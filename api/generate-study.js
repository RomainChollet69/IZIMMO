/**
 * generate-study.js
 * Génère une étude de marché immobilière via 2 passes Claude Sonnet.
 * Passe 1 : Analyse structurée (JSON) des données DVF/DPE fournies.
 * Passe 2 : Rédaction narrative (HTML) basée sur l'analyse.
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

    const { property, dvfSales, agentName, agencyName, customInstructions } = req.body || {};

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
        // ========== PASSE 1 : Analyse structurée ==========
        const analysisSystemPrompt = buildAnalysisPrompt();
        const analysisUserPrompt = buildAnalysisUserPrompt(property, limitedDvf);

        const analysisRaw = await callClaude(apiKey, analysisSystemPrompt, analysisUserPrompt, 4096, ABORT_TIMEOUT_MS);

        let analysis;
        try {
            // Extraire le JSON même si enveloppé dans du texte
            const jsonMatch = analysisRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Pas de JSON trouvé');
            analysis = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            console.error('[GenerateStudy] Parse error passe 1:', parseErr.message, analysisRaw.substring(0, 500));
            return res.status(502).json({ error: 'Erreur d\'analyse IA', detail: 'Le modèle n\'a pas retourné un JSON valide' });
        }

        // ========== PASSE 2 : Rédaction narrative ==========
        const writingSystemPrompt = buildWritingPrompt(agentSignature, agentName);
        const writingUserPrompt = buildWritingUserPrompt(property, analysis, customInstructions);

        const narrativeRaw = await callClaude(apiKey, writingSystemPrompt, writingUserPrompt, 6000, ABORT_TIMEOUT_MS);

        let narrative;
        try {
            const jsonMatch = narrativeRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Pas de JSON trouvé');
            narrative = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            // Fallback : utiliser le texte brut comme recommandation
            console.warn('[GenerateStudy] Parse warning passe 2, utilisation texte brut');
            narrative = {
                propertyPresentation: narrativeRaw,
                marketAnalysis: '',
                estimation: '',
                recommendation: ''
            };
        }

        return res.status(200).json({ analysis, narrative });

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Génération timeout — réessayez' });
        }
        console.error('[GenerateStudy] Error:', err);
        return res.status(500).json({ error: 'Erreur interne: ' + err.message });
    }
}

// ========== Appel Claude générique ==========

async function callClaude(apiKey, systemPrompt, userPrompt, maxTokens, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
            messages: [{ role: 'user', content: userPrompt }]
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

// ========== Prompts ==========

function buildAnalysisPrompt() {
    return `Tu es un analyste immobilier senior avec 20 ans d'expérience en estimation de biens en France.
Tu reçois des données DVF (Demandes de Valeurs Foncières) réelles pour un secteur géographique précis.
Ton rôle est de produire une analyse approfondie et rigoureuse digne d'un rapport professionnel.

MÉTHODOLOGIE D'ANALYSE :

1. SÉLECTION DES COMPARABLES (5-10 ventes) :
   - PRIORITÉ 1 : Même type de bien (appartement/maison)
   - PRIORITÉ 2 : Surface proche (+/- 30% de la surface du bien)
   - PRIORITÉ 3 : Proximité géographique (< 500m idéal, < 1km acceptable)
   - PRIORITÉ 4 : Date récente (pondérer les ventes 2024-2025 plus fortement)
   - Si peu de comparables proches, élargir progressivement les critères

2. STATISTIQUES DE PRIX :
   - Calculer sur TOUTES les ventes du même type (pas seulement les comparables)
   - Séparer les stats secteur (tout le dataset) des stats comparables (sélection fine)
   - Identifier les outliers (prix anormalement hauts ou bas) et les exclure du calcul médian

3. ÉVOLUTION DES PRIX :
   - Regrouper par année les ventes du même type
   - Calculer la médiane au m² par année
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

Retourne UNIQUEMENT un JSON valide (pas de texte autour, pas de markdown) :
{
  "comparable_sales": [
    { "date": "2024-03-15", "price": 250000, "type": "Appartement", "surface": 68, "price_m2": 3676, "distance": 150 }
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

FORMAT HTML :
- Utilise <p>, <strong>, <em>, <ul>/<li> pour structurer
- NE PAS inclure de <h1>, <h2>, <h3> — les titres sont gérés par le template
- Utilise <strong> pour mettre en valeur les chiffres clés dans le texte

Retourne UNIQUEMENT un JSON valide (pas de texte autour, pas de markdown) :
{
  "propertyPresentation": "HTML (3-4 paragraphes). §1: Accroche sur l'emplacement et le caractère du bien (citer la rue, le quartier, l'ambiance). §2: Description détaillée des espaces intérieurs (distribution, luminosité, matériaux, volumes). §3: Environnement immédiat (commerces, transports, écoles, espaces verts à proximité). §4 (si pertinent): Potentiel du bien (travaux possibles, plus-value, évolution du quartier).",

  "marketAnalysis": "HTML (3-4 paragraphes). §1: Synthèse du marché local avec chiffres clés (prix médian/m², volume de transactions, tendance). §2: Comparaison avec les biens similaires vendus récemment (citer 2-3 ventes précises avec prix et surface). §3: Évolution des prix sur les dernières années et interprétation de la tendance. §4: Positionnement du bien par rapport au marché (au-dessus/en-dessous de la médiane et pourquoi).",

  "estimation": "HTML (3-4 paragraphes). §1: Méthodologie utilisée (analyse comparative + ajustements). §2: Argumentation de la fourchette retenue avec les facteurs de valorisation (citer chaque atout et son impact). §3: Facteurs de décote éventuels (DPE, travaux, etc.) et comment les compenser. §4: Comparaison avec le budget vendeur si communiqué (conforter ou recadrer avec diplomatie).",

  "recommendation": "HTML (3-4 paragraphes). §1: Prix de mise en vente recommandé avec justification stratégique (attirer des visites vs maximiser le prix). §2: Stratégie de commercialisation (comment mettre en valeur les atouts, quel angle marketing, ciblage acquéreur). §3: Timing et scénario de vente (durée prévisionnelle, étapes clés, quand envisager une baisse). §4: Conclusion personnelle engageante du conseiller ${agentName || ''} (confiance dans le bien, engagement d'accompagnement)."
}`;
}

function buildWritingUserPrompt(property, analysis, customInstructions) {
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

${customInstructions ? `INSTRUCTIONS PARTICULIÈRES DU CONSEILLER :\n${customInstructions}\n` : ''}
RAPPEL : Rédige les 4 sections en français. Chaque section doit faire 3-4 paragraphes riches et argumentés. Cite des chiffres précis du JSON. Le ton doit inspirer confiance et expertise.`;
}
