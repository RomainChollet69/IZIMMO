export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://waimmo.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { headers, sampleRows } = req.body;
    if (!headers || !Array.isArray(headers)) return res.status(400).json({ error: 'Missing headers' });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                messages: [{
                    role: 'user',
                    content: `Tu es un assistant qui mappe les colonnes d'un fichier Excel vers les champs d'un CRM immobilier.

Champs CRM disponibles :
- first_name : prénom
- last_name : nom de famille
- full_name : nom complet (si prénom et nom sont dans la même colonne)
- phone : téléphone
- email : email
- address : adresse du bien
- description : description du bien
- budget : prix / estimation / budget
- source : source du lead (pige, recommandation, etc.)
- notes : notes / commentaires / observations
- date : date de contact / date de création
- reminder : date de relance / date de rappel
- property_type : type de bien (appartement, maison, etc.)
- surface : surface en m²
- status : statut du lead / température / avancement / colonne pipeline. Valeurs possibles : chaud/hot, tiède/warm, froid/cold, mandat/mandate, concurrent/competitor, vendu/sold, perdu/lost
- ignore : colonne à ignorer (non pertinente)

Colonnes du fichier Excel : ${JSON.stringify(headers)}

Exemples de données (premières lignes) :
${(sampleRows || []).slice(0, 3).map((row, i) => `Ligne ${i + 1}: ${JSON.stringify(row)}`).join('\n')}

Retourne UNIQUEMENT un JSON valide. Pour chaque colonne Excel, indique le champ CRM correspondant.
Format : { "colonne_excel": "champ_crm", ... }
Si tu n'es pas sûr, mets "ignore".`
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.error('Claude API error:', response.status);
            return res.status(502).json({ error: 'Mapping failed' });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.status(400).json({ error: 'Mapping failed' });

        return res.status(200).json(JSON.parse(jsonMatch[0]));
    } catch (err) {
        if (err.name === 'AbortError') return res.status(504).json({ error: 'Mapping timeout' });
        console.error('Map-columns error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
