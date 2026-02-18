import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
    // CORS
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('ANTHROPIC_API_KEY not configured');
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { text, type } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text provided' });

    // Type: "seller" or "buyer"
    const isBuyer = type === 'buyer';

    const sellerPrompt = `Tu es un assistant qui extrait des informations structurées depuis une dictée vocale d'un agent immobilier qui décrit un vendeur (lead vendeur).

IMPORTANT : retourne UNIQUEMENT les informations explicitement mentionnées dans la dictée. Si un champ n'est PAS mentionné, mets null. Ne JAMAIS inventer ou deviner des informations.

Retourne un JSON avec ces champs :
- "first_name": string ou null — le prénom de la personne
- "last_name": string ou null — le nom de famille de la personne
- "phone": string ou null — numéro de téléphone (format français avec espaces : 06 12 34 56 78)
- "email": string ou null
- "address": string ou null — adresse du bien (UNIQUEMENT si explicitement dictée)
- "description": string ou null — description du bien (UNIQUEMENT si explicitement dictée)
- "budget": number ou null — prix/estimation en euros (nombre pur, sans € ni espace)
- "source": string ou null — source du lead parmi ces valeurs exactes :
  - "pige" (si le mot "pige" ou "en pige" est mentionné)
  - "recommandation" (si "recommandation" ou "recommandé par" est mentionné)
  - "boitage" (si "boîtage", "boitage" ou "boîte aux lettres" est mentionné)
  - "boucheaoreille" (si "bouche à oreille" est mentionné)
  - "siteimmo" (si "site immo", "site immobilier" ou "internet" est mentionné)
  - "efficity" (si "efficity" est mentionné)
  - "autre" (si une autre source est mentionnée mais ne correspond à aucune ci-dessus)
  - null (si AUCUNE source n'est mentionnée)
- "referrer_name": string ou null — nom de l'apporteur d'affaire (ex: "recommandé par Patrick Durand" → "Patrick Durand", "recommandation de Sophie Martin" → "Sophie Martin"). Seulement si la source est "recommandation" ET qu'un nom est mentionné après.
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble" (si le type de bien est mentionné)
- "surface": number ou null — surface du bien en m² (nombre pur, sans unité. Ex: 65, 120)
- "annexes": array ou null — parmi ["parking", "cave", "balcon", "jardin", "garage"] (UNIQUEMENT celles explicitement mentionnées)
- "notes": string ou null — toute information complémentaire qui ne rentre dans aucun autre champ (contexte, remarques de l'agent, etc.)
- "status": string ou null — parmi "hot", "warm", "cold" (UNIQUEMENT si explicitement mentionné comme "chaud/chaude", "tiède", "froid/froide")
- "reminder": string ou null — date de relance au format AAAA-MM-JJ (si mentionnée)

Règles :
- Si la personne dit "Sophie Martin", le prénom est "Sophie" et le nom est "Martin"
- Si la personne dit "Madame Martin", first_name est null et last_name est "Martin"
- IMPORTANT : "referrer_name" est le nom de la personne qui a RECOMMANDÉ le lead (l'apporteur), PAS le nom du lead lui-même. Ne pas confondre avec first_name/last_name.
- Ne jamais inventer de données. Si un champ n'est pas mentionné, il DOIT être null
- Retourne UNIQUEMENT le JSON, sans commentaire ni explication`;

    const buyerPrompt = `Tu es un assistant qui extrait des informations structurées depuis une dictée vocale d'un agent immobilier qui décrit un acquéreur (lead acquéreur).

IMPORTANT : retourne UNIQUEMENT les informations explicitement mentionnées dans la dictée. Si un champ n'est PAS mentionné, mets null. Ne JAMAIS inventer ou deviner des informations.

Retourne un JSON avec ces champs :
- "first_name": string ou null — le prénom de la personne
- "last_name": string ou null — le nom de famille de la personne
- "phone": string ou null — numéro de téléphone (format français avec espaces : 06 12 34 56 78)
- "email": string ou null
- "source": string ou null — source du lead parmi ces valeurs exactes :
  - "site_annonce" (si "site d'annonce", "leboncoin", "seloger" est mentionné)
  - "efficity" (si "efficity" est mentionné)
  - "recommandation" (si "recommandation" ou "recommandé par" est mentionné)
  - "appel_entrant" (si "appel entrant", "appel", "il m'a appelé" est mentionné)
  - "reseaux_sociaux" (si "réseaux sociaux", "facebook", "instagram" est mentionné)
  - "autre" (si une autre source est mentionnée mais ne correspond à aucune ci-dessus)
  - null (si AUCUNE source n'est mentionnée)
- "referrer_name": string ou null — nom de l'apporteur d'affaire (ex: "recommandé par Patrick Durand" → "Patrick Durand"). Seulement si la source est "recommandation" ET qu'un nom est mentionné après.
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "rooms": string ou null — parmi "T1", "T2", "T3", "T4", "T5+"
- "sector": string ou null — ville ou quartier recherché
- "surface_min": number ou null — surface minimum en m²
- "budget_min": number ou null — budget minimum en euros (nombre pur)
- "budget_max": number ou null — budget maximum en euros (nombre pur)
- "criteria": array ou null — parmi ["jardin", "parking", "ascenseur", "balcon_terrasse", "calme", "neuf_renove"]
- "surface": number ou null — surface du bien en m² (nombre pur, sans unité. Ex: 65, 120)
- "annexes": array ou null — parmi ["parking", "cave", "balcon", "jardin", "garage"] (UNIQUEMENT celles explicitement mentionnées)
- "dealbreakers": string ou null — éléments rédhibitoires mentionnés
- "notes": string ou null — toute information complémentaire qui ne rentre dans aucun autre champ
- "status": string ou null — parmi "new", "active" (UNIQUEMENT si explicitement mentionné)
- "reminder": string ou null — date de relance au format AAAA-MM-JJ

Règles :
- Si la personne dit "Sophie Martin", le prénom est "Sophie" et le nom est "Martin"
- IMPORTANT : "referrer_name" est le nom de la personne qui a RECOMMANDÉ le lead (l'apporteur), PAS le nom du lead lui-même.
- Ne jamais inventer de données. Si un champ n'est pas mentionné, il DOIT être null
- Retourne UNIQUEMENT le JSON, sans commentaire ni explication`;

    const systemPrompt = isBuyer ? buyerPrompt : sellerPrompt;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: systemPrompt,
                messages: [{ role: 'user', content: text }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Parsing failed' });
        }

        const result = await response.json();
        const content = result.content?.[0]?.text || '{}';

        // Extract JSON from response (handle possible markdown code blocks)
        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        jsonStr = jsonStr.trim();

        const fields = JSON.parse(jsonStr);
        return res.status(200).json({ fields });
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Parsing timeout' });
        }
        console.error('Parse-lead error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
