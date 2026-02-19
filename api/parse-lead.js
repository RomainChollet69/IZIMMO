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
- "description": string ou null — description PHYSIQUE du bien (voir règles ci-dessous)
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
- "annexes": array ou null — parmi ["parking", "cave", "balcon", "jardin", "garage", "piscine", "ascenseur"] (UNIQUEMENT celles explicitement mentionnées)
- "notes": string ou null — informations COMMERCIALES et RELATIONNELLES (voir règles ci-dessous)
- "status": string ou null — parmi "hot", "warm", "cold", "off_market" (UNIQUEMENT si explicitement mentionné comme "chaud/chaude", "tiède", "froid/froide", "off market/hors mandat")
- "reminder": string ou null — date de relance au format AAAA-MM-JJ (si mentionnée)

RÉPARTITION DESCRIPTION vs NOTES — TRÈS IMPORTANT :

"description" = UNIQUEMENT ce qui décrit le BIEN PHYSIQUE :
- Nombre de chambres/pièces (T1, T2, T3, T4, "2 chambres", "5 pièces"...)
- Étage (3ème étage, RDC, dernier étage...)
- Orientation (sud, plein sud, est-ouest...)
- État (rénové, à rafraîchir, neuf, travaux...)
- Caractéristiques (lumineux, calme, traversant, vue dégagée, parquet, moulures...)
- DPE (classe A, B, C, D, E, F, G)
- Chauffage (gaz, électrique, collectif...)
- Copropriété (charges, nombre de lots)
- Toute info physique sur le bien
- NE PAS inclure ce qui a déjà un champ dédié (surface, budget, address, property_type, annexes)

"notes" = UNIQUEMENT ce qui concerne la RELATION COMMERCIALE et le CONTEXTE :
- Comment le contact a été établi (appel entrant, appel sortant, rencontre...)
- Ce que le vendeur a dit sur son projet (motivations, timing, contraintes)
- Prochaines étapes (rappeler tel jour, envoyer estimation, programmer visite...)
- Impressions de l'agent (sympa, pressé, hésitant, motivé...)
- Toute info sur la relation, pas sur le bien

EXEMPLES :
Dictée : "T4 de deux chambres 62m2 troisième étage lumineux, appel entrant, il veut vendre avant l'été"
→ property_type: "appartement", surface: 62, description: "T4 de 2 chambres, 3ème étage, lumineux", notes: "Appel entrant. Souhaite vendre avant l'été."

Dictée : "Maison 5 pièces avec jardin et garage, rénové récemment, recommandé par Julie, très sympathique, à rappeler lundi"
→ property_type: "maison", description: "5 pièces, rénové récemment", annexes: ["jardin", "garage"], source: "recommandation", referrer_name: "Julie", notes: "Très sympathique. À rappeler lundi."

Dictée : "Appartement rez-de-chaussée vue sur parc pas de vis-à-vis DPE C, il est pressé car divorce"
→ property_type: "appartement", description: "RDC, vue sur parc, sans vis-à-vis, DPE C", notes: "Pressé, contexte de divorce."

Règles :
- NE METS JAMAIS dans notes des infos qui décrivent le bien (étage, chambres, orientation, état, DPE...)
- NE METS JAMAIS dans description des infos relationnelles (appel, rappeler, impression...)
- Règle simple : cette info serait-elle sur une annonce immobilière ? Si oui → description. Si non → notes.
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
- "description": string ou null — description PHYSIQUE du bien recherché (voir règles ci-dessous)
- "criteria": array ou null — parmi ["parking", "cave", "balcon", "jardin", "garage", "piscine", "ascenseur"]
- "surface": number ou null — surface du bien en m² (nombre pur, sans unité. Ex: 65, 120)
- "annexes": array ou null — parmi ["parking", "cave", "balcon", "jardin", "garage", "piscine", "ascenseur"] (UNIQUEMENT celles explicitement mentionnées)
- "dealbreakers": string ou null — éléments rédhibitoires mentionnés
- "notes": string ou null — informations COMMERCIALES et RELATIONNELLES (voir règles ci-dessous)
- "status": string ou null — parmi "new", "active" (UNIQUEMENT si explicitement mentionné)
- "reminder": string ou null — date de relance au format AAAA-MM-JJ

RÉPARTITION DESCRIPTION vs NOTES — TRÈS IMPORTANT :

"description" = UNIQUEMENT ce qui décrit le BIEN RECHERCHÉ (caractéristiques physiques) :
- Nombre de chambres/pièces (si pas déjà dans rooms)
- Étage souhaité (RDC, étage élevé, dernier étage...)
- Orientation (sud, lumineux...)
- État souhaité (rénové, neuf, pas de travaux...)
- Caractéristiques (calme, traversant, vue dégagée...)
- NE PAS inclure ce qui a déjà un champ dédié (surface, budget, property_type, rooms, sector, annexes/criteria)

"notes" = UNIQUEMENT ce qui concerne la RELATION COMMERCIALE et le CONTEXTE :
- Comment le contact a été établi (appel entrant, rencontre, visite...)
- Projet de l'acquéreur (primo-accédant, investisseur, mutation...)
- Timing (urgent, pas pressé, cherche depuis 6 mois...)
- Prochaines étapes (rappeler, envoyer des biens, programmer visite...)
- Impressions de l'agent (motivé, hésitant, sérieux...)

EXEMPLES :
Dictée : "Cherche T3 lumineux étage élevé avec balcon à Lyon 3, budget 300000, appel entrant, très motivé"
→ property_type: "appartement", rooms: "T3", description: "Lumineux, étage élevé", criteria: ["balcon"], sector: "Lyon 3", budget_max: 300000, notes: "Appel entrant. Très motivé."

Dictée : "Couple primo-accédant, maison avec jardin et garage, 4 pièces minimum, rénové, recommandé par Marc"
→ property_type: "maison", rooms: "T4", description: "Rénové", criteria: ["jardin", "garage"], source: "recommandation", referrer_name: "Marc", notes: "Couple primo-accédant."

Règles :
- NE METS JAMAIS dans notes des infos qui décrivent le bien (étage, orientation, état, lumineux...)
- NE METS JAMAIS dans description des infos relationnelles (appel, rappeler, impression, projet...)
- Règle simple : cette info serait-elle sur une annonce immobilière ? Si oui → description. Si non → notes.
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
