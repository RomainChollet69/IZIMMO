/**
 * generate-study.js
 * Génère une étude de marché immobilière via 2 passes Claude Sonnet.
 * Passe 1 : Analyse structurée (JSON) des données DVF/DPE fournies — en parallèle avec POI + commune.
 * Passe 2 : Rédaction narrative (HTML) + Vision photos + données environnement.
 * APIs externes : Overpass (OSM), API Géo (geo.api.gouv.fr), Anthropic Claude.
 * Dépendances : lib/auth.js (verifyAuth, withCORS)
 */
import { verifyAuth, withCORS } from '../lib/auth.js';

const MODEL = 'claude-sonnet-4-20250514';
const ABORT_TIMEOUT_MS = 55000; // 55s (vercel max = 60s)

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { property, dvfSales, agentName, agencyName, customInstructions, photos } = req.body || {};

    if (!property || !property.address) {
        return res.status(400).json({ error: 'Adresse du bien requise' });
    }
    if (!dvfSales || dvfSales.length === 0) {
        return res.status(400).json({ error: 'Aucune donnée DVF fournie' });
    }

    // Limiter les données envoyées à Claude pour rester dans les limites
    const MAX_DVF = 50;
    const limitedDvf = dvfSales.slice(0, MAX_DVF);

    const agentSignature = agentName
        ? (agencyName ? `${agentName}, ${agencyName}` : agentName)
        : 'Le conseiller';

    try {
        const deadline = Date.now() + ABORT_TIMEOUT_MS; // Deadline absolue (55s)

        // ========== PASSE 1 + POI + COMMUNE en parallèle ==========
        const analysisSystemPrompt = buildAnalysisPrompt();
        const analysisUserPrompt = buildAnalysisUserPrompt(property, limitedDvf);

        const hasCoords = property.latitude && property.longitude;

        const [analysisRaw, poiData, communeData] = await Promise.all([
            callClaude(apiKey, analysisSystemPrompt, analysisUserPrompt, 4096, deadline - Date.now()),
            hasCoords
                ? fetchPOIData(property.latitude, property.longitude).catch(err => {
                    console.warn('[GenerateStudy] POI fetch failed (non-blocking):', err.message);
                    return null;
                })
                : Promise.resolve(null),
            hasCoords
                ? fetchCommuneData(property.latitude, property.longitude).catch(err => {
                    console.warn('[GenerateStudy] Commune fetch failed (non-blocking):', err.message);
                    return null;
                })
                : Promise.resolve(null)
        ]);

        const pass1Ms = ABORT_TIMEOUT_MS - (deadline - Date.now());
        console.log(`[GenerateStudy] Passe 1 terminée en ${Math.round(pass1Ms / 1000)}s`);

        let analysis;
        try {
            const jsonMatch = analysisRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Pas de JSON trouvé');
            analysis = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            console.error('[GenerateStudy] Parse error passe 1:', parseErr.message, analysisRaw.substring(0, 500));
            return res.status(502).json({ error: 'Erreur d\'analyse IA', detail: 'Le modèle n\'a pas retourné un JSON valide' });
        }

        // ========== PASSE 2 : Rédaction narrative (+ Vision + Environnement) ==========
        const remaining = deadline - Date.now();
        if (remaining < 5000) {
            // Moins de 5s restantes — pas assez pour la passe 2
            console.warn(`[GenerateStudy] Pas assez de temps pour passe 2 (${Math.round(remaining / 1000)}s). Retour analyse seule.`);
            return res.status(200).json({ analysis, narrative: { propertyPresentation: '', marketAnalysis: '', estimation: '', recommendation: '' }, poiData, communeData });
        }
        console.log(`[GenerateStudy] Budget passe 2: ${Math.round(remaining / 1000)}s`);

        const writingSystemPrompt = buildWritingPrompt(agentSignature, agentName);
        const writingUserPrompt = buildWritingUserPrompt(property, analysis, customInstructions, poiData, communeData);

        // Envoyer les photos en mode Vision pour enrichir la description du bien
        const photoImages = (photos || []).slice(0, 5);
        const narrativeRaw = await callClaude(apiKey, writingSystemPrompt, writingUserPrompt, 6500, remaining, photoImages);

        let narrative;
        try {
            const jsonMatch = narrativeRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Pas de JSON trouvé');
            narrative = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            console.warn('[GenerateStudy] Parse warning passe 2, utilisation texte brut');
            narrative = {
                propertyPresentation: narrativeRaw,
                marketAnalysis: '',
                estimation: '',
                recommendation: ''
            };
        }

        return res.status(200).json({ analysis, narrative, poiData, communeData });

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Génération timeout — réessayez' });
        }
        console.error('[GenerateStudy] Error:', err);
        return res.status(500).json({ error: 'Erreur interne: ' + err.message });
    }
}

// ========== Appel Claude générique ==========

async function callClaude(apiKey, systemPrompt, userPrompt, maxTokens, timeoutMs, images = []) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Construire le contenu multimodal si images présentes (Claude Vision)
    let userContent;
    if (images.length > 0) {
        const imageBlocks = images.map(dataUrl => {
            const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) return null;
            return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
        }).filter(Boolean);
        userContent = [...imageBlocks, { type: 'text', text: userPrompt }];
        console.log(`[GenerateStudy] Vision mode: ${imageBlocks.length} image(s) jointe(s)`);
    } else {
        userContent = userPrompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }]
        }),
        signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
        const errBody = await response.text();
        console.error('[GenerateStudy] Anthropic error:', response.status, errBody);
        let detail = `Anthropic ${response.status}`;
        try {
            const errJson = JSON.parse(errBody);
            detail = errJson.error?.message || detail;
        } catch (_) {
            detail = errBody.substring(0, 300) || detail;
        }
        throw new Error(detail);
    }

    const result = await response.json();
    return result.content?.[0]?.text || '';
}

// ========== POI & Commune (Overpass + API Géo) ==========

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 8000; // 8s max pour ne pas bloquer la génération
const GEO_API_TIMEOUT_MS = 5000;

/** Distance Haversine en mètres */
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

/** Requête Overpass combinée — toutes catégories en une seule requête HTTP */
async function fetchPOIData(lat, lng) {
    const query = `[out:json][timeout:10];
(
  nw["amenity"~"school|kindergarten"](around:1000,${lat},${lng});
  nw["railway"="station"](around:2000,${lat},${lng});
  nw["railway"="tram_stop"](around:1000,${lat},${lng});
  nw["highway"="bus_stop"](around:500,${lat},${lng});
  nw["shop"~"supermarket|convenience|bakery|butcher"](around:500,${lat},${lng});
  nw["amenity"~"pharmacy|bank"](around:500,${lat},${lng});
  nw["amenity"~"doctors|dentist|clinic|hospital"](around:1000,${lat},${lng});
  nw["leisure"~"park|garden"](around:1000,${lat},${lng});
  way["highway"~"motorway|trunk|primary"](around:300,${lat},${lng});
  way["railway"~"rail|light_rail"](around:300,${lat},${lng});
);
out center;`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

    const response = await fetch(OVERPASS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const data = await response.json();
    console.log(`[GenerateStudy] Overpass: ${data.elements?.length || 0} éléments`);
    return structurePOIData(data.elements || [], lat, lng);
}

/** Données communales via API Géo */
async function fetchCommuneData(lat, lng) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEO_API_TIMEOUT_MS);

    const url = `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=nom,code,population,codesPostaux,codeDepartement,departement,region&limit=1`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`API Géo ${response.status}`);
    const communes = await response.json();
    if (!communes.length) return null;

    const c = communes[0];
    console.log(`[GenerateStudy] Commune: ${c.nom} (${c.code}), pop=${c.population}`);
    return {
        name: c.nom,
        inseeCode: c.code,
        population: c.population,
        postalCodes: c.codesPostaux || [],
        departement: c.departement || { code: c.codeDepartement, nom: '' },
        region: c.region || { nom: '' }
    };
}

/** Classifier un élément Overpass dans une catégorie POI */
function classifyElement(tags) {
    if (!tags) return null;
    // Écoles
    if (tags.amenity === 'school' || tags.amenity === 'kindergarten') return 'schools';
    // Transports
    if (tags.railway === 'station' || tags.railway === 'tram_stop' || tags.highway === 'bus_stop') return 'transport';
    // Commerces
    if (tags.shop && /supermarket|convenience|bakery|butcher/.test(tags.shop)) return 'commerce';
    if (tags.amenity === 'pharmacy' || tags.amenity === 'bank') return 'commerce';
    // Santé
    if (/doctors|dentist|clinic|hospital/.test(tags.amenity)) return 'health';
    // Espaces verts
    if (tags.leisure === 'park' || tags.leisure === 'garden') return 'greenSpaces';
    // Bruit (route/rail majeur) — traité séparément
    if (tags.highway && /motorway|trunk|primary/.test(tags.highway)) return '_noise_road';
    if (tags.railway && /rail|light_rail/.test(tags.railway)) return '_noise_rail';
    return null;
}

/** Structurer les éléments Overpass bruts en catégories exploitables */
function structurePOIData(elements, lat, lng) {
    const categories = {
        schools: { count: 0, nearest: null, items: [] },
        transport: { count: 0, nearest: null, items: [] },
        commerce: { count: 0, nearest: null, items: [] },
        health: { count: 0, nearest: null, items: [] },
        greenSpaces: { count: 0, nearest: null, items: [] }
    };
    const noiseElements = [];

    for (const el of elements) {
        const cat = classifyElement(el.tags);
        if (!cat) continue;

        const elLat = el.lat || el.center?.lat;
        const elLng = el.lon || el.center?.lon;
        if (!elLat || !elLng) continue;

        const distance = Math.round(haversine(lat, lng, elLat, elLng));
        const name = el.tags?.name || '';

        if (cat.startsWith('_noise')) {
            noiseElements.push({ ...el, _distance: distance });
            continue;
        }

        const item = { name, distance, type: el.tags?.amenity || el.tags?.shop || el.tags?.railway || el.tags?.highway || el.tags?.leisure || '' };
        categories[cat].items.push(item);
        categories[cat].count++;

        if (!categories[cat].nearest || distance < categories[cat].nearest.distance) {
            categories[cat].nearest = { name, distance };
        }
    }

    // Trier par distance et limiter à 5 items par catégorie (suffisant pour l'affichage)
    for (const cat of Object.values(categories)) {
        cat.items.sort((a, b) => a.distance - b.distance);
        cat.items = cat.items.slice(0, 5);
    }

    const noise = estimateNoise(noiseElements, lat, lng);
    const walkScore = computeWalkScore(categories);

    return { categories, noise, walkScore };
}

/** Estimer le niveau sonore d'après la proximité routes/voies ferrées */
function estimateNoise(noiseElements, lat, lng) {
    let nearestRoad = null;
    let nearestRailway = null;

    for (const el of noiseElements) {
        const dist = el._distance;
        const tags = el.tags || {};

        if (tags.highway && (!nearestRoad || dist < nearestRoad.distance)) {
            nearestRoad = { type: tags.highway, distance: dist };
        }
        if (tags.railway && (!nearestRailway || dist < nearestRailway.distance)) {
            nearestRailway = { type: tags.railway, distance: dist };
        }
    }

    const ROAD_LABELS = { motorway: 'Autoroute', trunk: 'Voie rapide', primary: 'Route principale' };
    const sources = [];
    let score = 0;

    if (nearestRoad) {
        sources.push(`${ROAD_LABELS[nearestRoad.type] || 'Route'} à ${nearestRoad.distance}m`);
        if (nearestRoad.distance < 50) score += 3;
        else if (nearestRoad.distance < 150) score += 2;
        else score += 1;
    }
    if (nearestRailway) {
        sources.push(`Voie ferrée à ${nearestRailway.distance}m`);
        if (nearestRailway.distance < 100) score += 3;
        else if (nearestRailway.distance < 200) score += 2;
        else score += 1;
    }

    let level = 'calme';
    if (score >= 4) level = 'bruyant';
    else if (score >= 2) level = 'modere';

    return { level, sources, nearestRoad, nearestRailway };
}

/** Score piéton heuristique (1-10) basé sur la couverture d'aménités */
function computeWalkScore(categories) {
    let score = 0;
    const c = categories;
    // Commerce à proximité
    if (c.commerce.nearest && c.commerce.nearest.distance < 300) score += 2;
    else if (c.commerce.count > 0) score += 1;
    // Transport
    if (c.transport.nearest && c.transport.nearest.distance < 400) score += 2;
    else if (c.transport.count > 0) score += 1;
    // Écoles
    if (c.schools.nearest && c.schools.nearest.distance < 500) score += 1;
    // Santé
    if (c.health.nearest && c.health.nearest.distance < 800) score += 1;
    // Espaces verts
    if (c.greenSpaces.nearest && c.greenSpaces.nearest.distance < 500) score += 1;
    // Bonus diversité
    if (c.commerce.count >= 5) score += 1;
    if (c.transport.count >= 3) score += 1;
    const coveredCategories = Object.values(c).filter(cat => cat.count > 0).length;
    if (coveredCategories >= 5) score += 1;

    return Math.min(score, 10);
}

// ========== Prompts ==========

function buildAnalysisPrompt() {
    return `Tu es un analyste immobilier senior avec 20 ans d'expérience en estimation de biens en France.
Tu reçois des données DVF (Demandes de Valeurs Foncières) réelles pour un secteur géographique précis.
Ton rôle est de produire une analyse approfondie et rigoureuse digne d'un rapport professionnel.

ADAPTATION À LA DENSITÉ DU MARCHÉ :
Le dataset contient toutes les ventes dans un rayon donné. Adapte ta rigueur selon le volume :
- Zone dense (Paris, grandes villes) : > 30 ventes → sélection très fine, distance < 500m, surface ±20%
- Zone intermédiaire (villes moyennes) : 10-30 ventes → critères modérés, distance < 1km, surface ±30%
- Zone rurale / faible volume : < 10 ventes → utilise tout le dataset, élargis les critères de surface ±50%
En zone dense, 100m d'écart change significativement le prix. En zone rurale, les prix sont homogènes sur plusieurs km.

MÉTHODOLOGIE D'ANALYSE :

1. SÉLECTION DES COMPARABLES (5-10 ventes) :
   - PRIORITÉ 1 : Même type de bien (appartement/maison)
   - PRIORITÉ 2 : Surface proche (±20% en zone dense, ±30% standard, ±50% en zone rurale)
   - PRIORITÉ 3 : Proximité géographique (< 500m en zone dense, < 1km standard, rayon complet en zone rurale)
   - PRIORITÉ 4 : Date récente (pondérer les ventes 2024-2025 plus fortement)
   - Si peu de comparables proches, élargir progressivement les critères

2. STATISTIQUES DE PRIX :
   - "price_per_m2" = calculé sur TOUTES les ventes du même type dans le dataset (pas seulement les comparables)
   - "price_per_m2_comparable" = calculé uniquement sur les comparables sélectionnés (sélection fine)
   - Identifier les outliers (prix anormalement hauts ou bas) et les exclure du calcul médian
   - IMPORTANT : les statistiques secteur ("price_per_m2") doivent utiliser le MAXIMUM de ventes disponibles

3. ÉVOLUTION DES PRIX :
   - Regrouper par année TOUTES les ventes du même type (pas seulement les comparables)
   - Calculer la médiane au m² par année
   - IMPORTANT : N'inclure que les années avec un minimum de ventes pour être fiable (3+ en zone dense, 2+ en zone rurale). Les années avec 1 seule vente donnent des médianes non fiables.
   - La variation affichée doit être réaliste et cohérente avec le marché immobilier (rarement > ±20% sur 5 ans hors crise majeure)
   - Identifier la tendance (hausse, baisse, stabilisation)

4. ESTIMATION :
   - Base : prix médian au m² des comparables × surface du bien
   - Ajustements : DPE (F/G = -5 à -15%, A/B = +3 à +5%), étage élevé (+3-5%), rénové (+5-10%),
     vue dégagée (+3-5%), parking/garage (+5-15k€), balcon/terrasse (+2-5%)
   - Fourchette : -10% (basse) à +10% (haute) autour de l'estimation centrale

5. POINTS FORTS / POINTS FAIBLES :
   - Identifier 5-8 atouts spécifiques du bien basés sur sa description et son positionnement
   - Identifier 3-6 points faibles ou axes d'amélioration
   - Être SPÉCIFIQUE (pas de généralités) : citer l'étage, l'exposition, le quartier, etc.

6. PROFIL ACQUÉREUR :
   - Calculer la mensualité de crédit (taux 3.2%, durée 20 ans, apport 10%)
   - En déduire le revenu mensuel minimum (mensualité / 0.35 = taux endettement max)
   - Décrire le profil type d'acheteur pour ce bien

FORMATS :
- Les dates dans comparable_sales doivent être au format JJ/MM/AAAA (ex: 15/03/2024), PAS en format ISO.

Retourne UNIQUEMENT un JSON valide (pas de texte autour, pas de markdown) :
{
  "comparable_sales": [
    { "date": "15/03/2024", "price": 250000, "type": "Appartement", "surface": 68, "price_m2": 3676, "distance": 150 }
  ],
  "price_per_m2": { "median": 4200, "mean": 4350, "min": 3500, "max": 5200, "count": 25 },
  "price_per_m2_comparable": { "median": 4100, "mean": 4150, "min": 3800, "max": 4500, "count": 8 },
  "price_evolution": [
    { "year": 2020, "median_m2": 3600, "count": 5 },
    { "year": 2021, "median_m2": 3800, "count": 8 },
    { "year": 2022, "median_m2": 3900, "count": 12 },
    { "year": 2023, "median_m2": 4100, "count": 10 },
    { "year": 2024, "median_m2": 4200, "count": 8 }
  ],
  "estimation": { "low": 252000, "mid": 280000, "high": 308000 },
  "estimation_reasoning": "Raisonnement détaillé en 3-5 phrases expliquant la méthode, les ajustements appliqués et la fourchette retenue.",
  "strengths": ["Emplacement prisé dans le 6e arrondissement", "Exposition plein sud avec luminosité exceptionnelle", "Hauteurs sous plafond et cachet ancien", "Proximité transports (métro, bus)", "Étage élevé avec ascenseur"],
  "weaknesses": ["DPE défavorable (classe E) — coût de rénovation énergétique à prévoir", "Surface limitée pour un T2 (67 m²)", "Charges de copropriété potentiellement élevées dans l'ancien"],
  "buyer_profile": {
    "monthly_payment": 1350,
    "required_income": 3860,
    "loan_amount": 252000,
    "downpayment": 28000,
    "rate": 3.2,
    "duration_years": 20,
    "profile_description": "Jeune couple actif ou investisseur — CSP+ avec revenus stables"
  },
  "market_trend": "stable",
  "market_trend_detail": "Le marché du 6e arrondissement montre une stabilisation des prix après la hausse de 2021-2022, avec un volume de transactions maintenu."
}`;
}

function buildAnalysisUserPrompt(property, dvfSales) {
    const dvfText = dvfSales.map(s =>
        `${s.date_mutation} | ${s.type_local} | ${s.surface_reelle_bati}m² | ${s.valeur_fonciere}€ | ${Math.round(s.valeur_fonciere / (s.surface_reelle_bati || 1))}€/m² | ${s.distance}m`
    ).join('\n');

    return `BIEN À ESTIMER :
Adresse : ${property.address}
Type : ${property.propertyType || 'Non précisé'}
Surface : ${property.surface || 'Non précisée'}m²
Pièces : ${property.rooms || 'Non précisé'}
DPE : ${property.dpe || 'Non précisé'}
Description : ${property.description || 'Aucune'}
Budget vendeur : ${property.budget ? property.budget + '€' : 'Non communiqué'}
Annexes : ${(property.annexes || []).join(', ') || 'Aucune'}
${property.interviewSummary ? `\nINFORMATIONS COMPLÉMENTAIRES (collectées auprès du propriétaire) :\n${property.interviewSummary}\n` : ''}
VENTES DVF DU SECTEUR (${dvfSales.length} ventes) :
Date | Type | Surface | Prix | Prix/m² | Distance
${dvfText}`;
}

function buildWritingPrompt(agentSignature, agentName) {
    return `Tu es un rédacteur expert en rapports immobiliers professionnels haut de gamme.
Tu rédiges une étude de marché pour ${agentSignature}, conseiller immobilier.
Ce document sera remis au propriétaire vendeur pour l'accompagner dans sa prise de décision.

STYLE RÉDACTIONNEL :
- Ton professionnel, confiant et expert. Tu ES le conseiller qui s'adresse à son client.
- 1ère personne : "D'après mon analyse...", "Je recommande...", "Mon expertise du secteur..."
- Utilise les VRAIS chiffres du JSON (jamais d'approximation : "environ 280 000 €" → "280 000 €")
- Formate TOUJOURS les montants avec espaces : "280 000 €", "4 500 €/m²"
- Phrases variées : alterner courtes (impact) et développées (argumentation)
- INTERDIT : "n'hésitez pas", "nous restons à votre disposition", "force est de constater", "il est important de noter", "il convient de", "en effet"
- Chaque section doit apporter de la VALEUR : pas de remplissage, chaque phrase a un but
- IMPORTANT : Les informations complémentaires du propriétaire contiennent des labels courts (ex: "3e étage", "Bon état"). Reformule-les en français naturel dans tes paragraphes. NE JAMAIS copier les labels tels quels. Ex : "situé au troisième étage" et non "situé au 3e étage". Ex: "l'appartement bénéficie d'un bon état général" et non "état général : Bon état".

PHOTOS DU BIEN :
Si des photos sont jointes au message, utilise-les pour enrichir ta description :
- Décris ce que tu OBSERVES concrètement : luminosité, volumes, matériaux, état des finitions, vue depuis les fenêtres
- Mentionne les éléments visuels remarquables (parquet, moulures, cuisine équipée, verrière, etc.)
- Intègre ces observations naturellement dans "propertyPresentation" et "estimation" (ajustements basés sur l'état réel)
- NE JAMAIS écrire "sur les photos" ou "comme on peut le voir" — décris comme si tu avais personnellement visité le bien
- Si les photos montrent des défauts (peinture défraîchie, équipements vieillissants), mentionne-les diplomatiquement dans les points d'amélioration

FORMAT HTML :
- Utilise <p>, <strong>, <em>, <ul>/<li> pour structurer
- NE PAS inclure de <h1>, <h2>, <h3> — les titres sont gérés par le template
- Utilise <strong> pour mettre en valeur les chiffres clés dans le texte

Retourne UNIQUEMENT un JSON valide (pas de texte autour, pas de markdown) :
{
  "propertyPresentation": "HTML (3-4 paragraphes). §1: Accroche sur l'emplacement et le caractère du bien (citer la rue, le quartier, l'ambiance). §2: Description détaillée des espaces intérieurs (distribution, luminosité, matériaux, volumes). §3: Environnement immédiat (commerces, transports, écoles, espaces verts à proximité). §4 (si pertinent): Potentiel du bien (travaux possibles, plus-value, évolution du quartier).",

  "marketAnalysis": "HTML (3-4 paragraphes). §1: Synthèse du marché local avec chiffres clés (prix médian/m², volume de transactions, tendance). §2: Comparaison avec les biens similaires vendus récemment (citer 2-3 ventes précises avec prix et surface). §3: Évolution des prix sur les dernières années et interprétation de la tendance. §4: Positionnement du bien par rapport au marché (au-dessus/en-dessous de la médiane et pourquoi).",

  "estimation": "HTML (3-4 paragraphes). §1: Méthodologie utilisée (analyse comparative + ajustements). §2: Argumentation de la fourchette retenue avec les facteurs de valorisation (citer chaque atout et son impact). §3: Facteurs de décote éventuels (DPE, travaux, etc.) et comment les compenser. §4: Comparaison avec le budget vendeur si communiqué (conforter ou recadrer avec diplomatie).",

  "recommendation": "HTML (3-4 paragraphes). §1: Prix de mise en vente recommandé avec justification stratégique (attirer des visites vs maximiser le prix). §2: Stratégie de commercialisation (comment mettre en valeur les atouts, quel angle marketing, ciblage acquéreur). §3: Timing et scénario de vente (durée prévisionnelle, étapes clés, quand envisager une baisse). §4: Conclusion personnelle engageante du conseiller ${agentName || ''} (confiance dans le bien, engagement d'accompagnement).",

  "environment": "HTML (2-3 paragraphes). UNIQUEMENT si des données environnement sont fournies. §1: Cadre de vie — décrire l'ambiance du quartier, la densité de commerces et services, l'accessibilité transport. Citer les POIs les plus proches PAR LEUR NOM. §2: Données communales — population, dynamisme de la commune. §3: Qualité de vie — espaces verts, calme/bruit, score piéton. Utilise UNIQUEMENT les données fournies, ne rien inventer. Si aucune donnée environnement n'est fournie, retourne une chaîne vide."
}`;
}

/** Formater les données environnement pour le prompt IA */
function buildEnvironmentBlock(poiData, communeData) {
    if (!poiData && !communeData) return '';

    let block = 'DONNÉES ENVIRONNEMENT DU BIEN :\n';

    if (communeData) {
        const pop = communeData.population ? communeData.population.toLocaleString('fr-FR') : 'N/A';
        const dept = communeData.departement?.nom || '';
        const region = communeData.region?.nom || '';
        block += `Commune : ${communeData.name} (${communeData.inseeCode}) — ${pop} habitants — ${dept} — ${region}\n`;
    }

    if (poiData?.categories) {
        const LABELS = { schools: 'Écoles', transport: 'Transports', commerce: 'Commerces', health: 'Santé', greenSpaces: 'Espaces verts' };
        block += '\nAménités à proximité :\n';
        for (const [key, data] of Object.entries(poiData.categories)) {
            const label = LABELS[key] || key;
            let line = `- ${label} : ${data.count}`;
            if (data.nearest) {
                const name = data.nearest.name || 'sans nom';
                line += ` (le plus proche : ${name} à ${data.nearest.distance}m)`;
            }
            block += line + '\n';
        }
    }

    if (poiData?.noise) {
        block += `\nAmbiance sonore estimée : ${poiData.noise.level}`;
        if (poiData.noise.sources.length > 0) {
            block += ` (${poiData.noise.sources.join(', ')})`;
        }
        block += '\n';
    }

    if (poiData?.walkScore != null) {
        block += `Score piéton estimé : ${poiData.walkScore}/10\n`;
    }

    block += '\nUtilise ces données pour enrichir "propertyPresentation" (§3 environnement) ET pour la section "environment".\n';
    return block;
}

function buildWritingUserPrompt(property, analysis, customInstructions, poiData, communeData) {
    const budgetLine = property.budget
        ? `Budget/estimation vendeur : ${property.budget.toLocaleString('fr-FR')} € — COMPARE avec ton estimation et commente (conforte si proche, recadre diplomatiquement si éloigné)`
        : 'Budget vendeur : Non communiqué';

    return `BIEN À VALORISER :
Adresse : ${property.address}
Ville : ${property.city || ''} ${property.postalCode || ''}
Type : ${property.propertyType || 'Non précisé'}
Surface habitable : ${property.surface || '?'} m²
${property.surfaceTerrain ? `Surface terrain : ${property.surfaceTerrain} m²` : ''}
Pièces : ${property.rooms || 'Non précisé'}
DPE : ${property.dpe || 'Non précisé'}
Description du bien : ${property.description || 'Aucune description fournie'}
Annexes : ${(property.annexes || []).join(', ') || 'Aucune'}
${property.interviewSummary ? `\nINFORMATIONS COMPLÉMENTAIRES DU PROPRIÉTAIRE :\n${property.interviewSummary}\n` : ''}
${budgetLine}

RÉSULTATS DE L'ANALYSE CHIFFRÉE :
${JSON.stringify(analysis, null, 2)}

${buildEnvironmentBlock(poiData, communeData)}
${customInstructions ? `INSTRUCTIONS PARTICULIÈRES DU CONSEILLER :\n${customInstructions}\n` : ''}
RAPPEL : Rédige les sections en français. Chaque section doit faire 3-4 paragraphes riches et argumentés (2-3 pour "environment"). Cite des chiffres précis du JSON. Le ton doit inspirer confiance et expertise.`;
}
