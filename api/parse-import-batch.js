export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { headers, rows, leadType } = req.body || {};
    if (!headers || !rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: 'Missing headers or rows' });
    }

    const isSeller = leadType === 'sellers';

    const fieldsBlock = isSeller ? `
- "first_name": string ou null — prénom (retirer civilité Mme/Mr/M./Monsieur/Madame)
- "last_name": string ou null — nom de famille
- "phone": string ou null — téléphone au format "06 12 34 56 78" (reformater si nécessaire)
- "email": string ou null
- "address": string ou null — adresse du bien (combiner rue + CP + ville si colonnes séparées)
- "description": string ou null — description du bien
- "budget": number ou null — prix en euros (nombre pur). "250K" ou "250k€" = 250000, "1.2M" = 1200000
- "source": string ou null — parmi "pige", "recommandation", "boitage", "boucheaoreille", "siteimmo", "efficity", "autre"
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "surface": number ou null — surface en m² (nombre pur). "128m2" → 128, "T3-88m2" → 88
- "rooms": string ou null — nombre de pièces (T1, T2, T3...)
- "date": string ou null — date au format "YYYY-MM-DD" (convertir depuis tout format)
- "reminder": string ou null — date de relance au format "YYYY-MM-DD"
- "status": string ou null — parmi "hot", "warm", "cold", "mandate", "competitor", "sold", "lost"
- "notes": string ou null — informations complémentaires, commentaires généraux
- "contact_notes": array de strings ou null — historique de contacts (chaque entrée = "[Nom colonne] contenu")` : `
- "first_name": string ou null — prénom (retirer civilité)
- "last_name": string ou null — nom de famille
- "phone": string ou null — téléphone au format "06 12 34 56 78"
- "email": string ou null
- "address": string ou null — adresse / secteur recherché
- "budget_min": number ou null — budget minimum en euros
- "budget_max": number ou null — budget maximum en euros
- "source": string ou null — parmi "site_annonce", "efficity", "recommandation", "appel_entrant", "reseaux_sociaux", "autre"
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "surface": number ou null — surface en m²
- "rooms": string ou null — nombre de pièces (T1, T2, T3...)
- "sector": string ou null — ville ou quartier recherché
- "status": string ou null — parmi "new", "active", "offer", "closed"
- "notes": string ou null — informations complémentaires
- "contact_notes": array de strings ou null — historique de contacts`;

    const statusRules = isSeller ? `
Pour le status, déduis à partir des notes/commentaires :
- "chaud", "intéressé", "RDV", "urgent", "très intéressé", "à rappeler" → "hot"
- "tiède", "moyen", "en cours", "à suivre" → "warm"
- "froid", "NRP", "injoignable", "absent", "long terme" → "cold"
- "mandat", "signé", "exclusif" → "mandate"
- "concurrent", "PAP", "autre agence", "pris" → "competitor"
- "vendu", "acte" → "sold"
- "perdu", "refus", "ne vend plus", "DEAD", "décédé", "abandonné" → "lost"
- Si tu ne peux pas déduire → null (le système appliquera le statut par défaut)` : `
Pour le status, déduis à partir des notes/commentaires :
- "nouveau", "récent" → "new"
- "actif", "recherche", "en cours" → "active"
- "offre", "proposition" → "offer"
- "conclu", "signé", "acheté" → "closed"
- Si tu ne peux pas déduire → null`;

    const systemPrompt = `Tu es un assistant qui extrait des leads immobiliers structurés depuis des lignes d'un fichier Excel/CSV.
CONTEXTE : Fichier de ${isSeller ? 'vendeurs (pige immobilière / prospection)' : 'acquéreurs'}.

Pour CHAQUE ligne qui contient des données utiles (au moins un nom ou un téléphone), retourne un objet lead avec ces champs :
${fieldsBlock}

RÈGLES :
- Si une ligne ne contient ni nom ni téléphone exploitable, mets-la dans "ignored" avec la raison
- Reformater les téléphones français : "0612345678" → "06 12 34 56 78"
- Les civilités (Mme, Mr, M., Monsieur, Madame, Mlle) doivent être retirées du nom
- Si prénom et nom sont dans la même cellule, les séparer (dernier mot = nom de famille)
- Les prix avec K/k = ×1000, M/m = ×1000000. "750K€" → 750000, "400K€ 410K€" → 400000 (prendre le premier)
- "en veut 300K€" → 300000. Extraire le nombre même si entouré de texte
- Convertir toute date en YYYY-MM-DD (gérer DD/MM/YYYY, dates Excel sérialisées, formats français abrégés)
- Ne JAMAIS inventer de données. Si un champ n'est pas dans la ligne, mettre null
${statusRules}

Retourne UNIQUEMENT un JSON valide au format :
{
  "leads": [ { "row_index": 0, ... }, { "row_index": 1, ... } ],
  "ignored": [ { "row_index": 2, "reason": "Ligne vide" } ]
}
Le row_index correspond à la position de la ligne dans le batch (0-indexed).`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const rowsText = rows.map((row, i) => {
            const obj = {};
            headers.forEach((h, idx) => {
                if (row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
                    obj[h] = row[idx];
                }
            });
            return `Ligne ${i}: ${JSON.stringify(obj)}`;
        }).join('\n');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: 'user', content: `En-têtes : ${JSON.stringify(headers)}\n\n${rowsText}` }]
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

        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1];
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.status(400).json({ error: 'No valid JSON in response' });

        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({
            leads: parsed.leads || [],
            ignored: parsed.ignored || []
        });
    } catch (err) {
        if (err.name === 'AbortError') return res.status(504).json({ error: 'Parsing timeout' });
        console.error('Parse-import-batch error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
