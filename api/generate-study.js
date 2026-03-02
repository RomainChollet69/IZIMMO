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

    const { property, dvfSales, dpeData, agentName, agencyName, customInstructions } = req.body || {};

    if (!property || !property.address) {
        return res.status(400).json({ error: 'Adresse du bien requise' });
    }
    if (!dvfSales || dvfSales.length === 0) {
        return res.status(400).json({ error: 'Aucune donnée DVF fournie' });
    }

    // Limiter les données envoyées à Claude pour rester dans les limites
    const MAX_DVF = 50;
    const MAX_DPE = 100;
    const limitedDvf = dvfSales.slice(0, MAX_DVF);
    const limitedDpe = (dpeData || []).slice(0, MAX_DPE);

    const agentSignature = agentName
        ? (agencyName ? `${agentName}, ${agencyName}` : agentName)
        : 'Le conseiller';

    try {
        // ========== PASSE 1 : Analyse structurée ==========
        const analysisSystemPrompt = buildAnalysisPrompt();
        const analysisUserPrompt = buildAnalysisUserPrompt(property, limitedDvf, limitedDpe);

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

        const narrativeRaw = await callClaude(apiKey, writingSystemPrompt, writingUserPrompt, 4096, ABORT_TIMEOUT_MS);

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
    return `Tu es un analyste immobilier expert spécialisé dans l'estimation de biens en France.
Tu reçois des données DVF (valeurs foncières) et DPE (diagnostics énergétiques) pour un secteur géographique.

RÈGLES STRICTES :
- Utilise UNIQUEMENT les données fournies. Ne jamais inventer de ventes ou de prix.
- Pour les comparables, sélectionne les 5-10 ventes les plus pertinentes : même type de bien (appartement/maison), surface proche (+/- 30%), et les plus proches géographiquement.
- Calcule les statistiques UNIQUEMENT sur les ventes du même type de bien.
- Pour l'estimation, base-toi sur le prix médian au m² des comparables × surface du bien.
  Fourchette : -10% (low) à +10% (high) autour de l'estimation centrale (mid).
- Si le DPE est défavorable (F ou G), applique une décote de 5-15% sur l'estimation.
- Si des atouts sont mentionnés (dernier étage, rénové, vue, garage), mentionne-le dans le raisonnement.

Retourne UNIQUEMENT un JSON valide (pas de texte autour, pas de markdown) avec cette structure :
{
  "comparable_sales": [
    { "date": "2024-03-15", "price": 250000, "type": "Appartement", "surface": 68, "price_m2": 3676, "distance": 150 }
  ],
  "price_per_m2": { "median": 4200, "mean": 4350, "min": 3500, "max": 5200, "count": 25 },
  "price_per_m2_comparable": { "median": 4100, "mean": 4150, "min": 3800, "max": 4500, "count": 8 },
  "price_evolution": [
    { "year": 2022, "median_m2": 3900, "count": 12 },
    { "year": 2023, "median_m2": 4100, "count": 10 },
    { "year": 2024, "median_m2": 4200, "count": 8 }
  ],
  "dpe_distribution": { "A": 2, "B": 5, "C": 12, "D": 18, "E": 8, "F": 3, "G": 1 },
  "estimation": { "low": 252000, "mid": 280000, "high": 308000 },
  "estimation_reasoning": "Explication courte en 2-3 phrases."
}`;
}

function buildAnalysisUserPrompt(property, dvfSales, dpeData) {
    const dvfText = dvfSales.map(s =>
        `${s.date_mutation} | ${s.type_local} | ${s.surface_reelle_bati}m² | ${s.valeur_fonciere}€ | ${Math.round(s.valeur_fonciere / (s.surface_reelle_bati || 1))}€/m² | ${s.distance}m`
    ).join('\n');

    const dpeText = dpeData.length > 0
        ? dpeData.map(d => {
            const classes = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
            return `DPE ${classes[d.dpeClass] || '?'} | ${d.surface}m² | ${d.conso}kWh/m²/an | ${d.distance}m`;
        }).join('\n')
        : 'Aucune donnée DPE disponible.';

    return `BIEN À ESTIMER :
Adresse : ${property.address}
Type : ${property.propertyType || 'Non précisé'}
Surface : ${property.surface || 'Non précisée'}m²
Pièces : ${property.rooms || 'Non précisé'}
Description : ${property.description || 'Aucune'}
Budget vendeur : ${property.budget ? property.budget + '€' : 'Non communiqué'}
Annexes : ${(property.annexes || []).join(', ') || 'Aucune'}

VENTES DVF DU SECTEUR (${dvfSales.length} ventes) :
Date | Type | Surface | Prix | Prix/m² | Distance
${dvfText}

DPE DU SECTEUR (${dpeData.length} diagnostics) :
${dpeText}`;
}

function buildWritingPrompt(agentSignature, agentName) {
    return `Tu es un rédacteur professionnel spécialisé en rapports immobiliers.
Tu rédiges pour ${agentSignature}, conseiller immobilier.

STYLE :
- Professionnel mais accessible. Pas de jargon incompréhensible.
- Parle à la 1ère personne du conseiller ("D'après mon analyse...", "Je recommande...")
- Utilise les VRAIS chiffres du JSON fourni (jamais d'approximation vague)
- Formate les montants avec espaces : "280 000 €"
- Phrases courtes et percutantes. Pas de blabla corporate.
- INTERDIT : "n'hésitez pas", "nous restons à votre disposition", "force est de constater", "il est important de noter"
- Structure chaque section en HTML avec des <p>, <strong>, <ul> si pertinent.
- NE PAS inclure de balises <h1>, <h2>, <h3> — les titres sont gérés par le template.

Retourne UNIQUEMENT un JSON valide (pas de texte autour, pas de markdown) avec cette structure :
{
  "propertyPresentation": "<p>HTML de la présentation du bien (2-3 paragraphes)</p>",
  "marketAnalysis": "<p>HTML de la synthèse du marché local (1-2 paragraphes avec chiffres clés)</p>",
  "estimation": "<p>HTML de l'argumentation de l'estimation (1-2 paragraphes)</p>",
  "recommendation": "<p>HTML de la recommandation stratégique du conseiller ${agentName || ''} (2-3 paragraphes)</p>"
}`;
}

function buildWritingUserPrompt(property, analysis, customInstructions) {
    return `BIEN :
Adresse : ${property.address}
Type : ${property.propertyType || 'Non précisé'}
Surface : ${property.surface || '?'}m²
Pièces : ${property.rooms || '?'}
Description : ${property.description || 'Aucune description'}
Annexes : ${(property.annexes || []).join(', ') || 'Aucune'}

DONNÉES D'ANALYSE (JSON) :
${JSON.stringify(analysis, null, 2)}

${customInstructions ? `INSTRUCTIONS SUPPLÉMENTAIRES DU CONSEILLER :\n${customInstructions}` : ''}

Rédige les 4 sections en français.`;
}
