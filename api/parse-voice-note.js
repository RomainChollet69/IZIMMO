import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
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

    const { transcription, leads, today } = req.body || {};
    if (!transcription) return res.status(400).json({ error: 'No transcription provided' });

    const systemPrompt = `Tu es Léon, l'assistant IA d'un agent immobilier. L'agent vient de te dicter une action qu'il a effectuée ou qu'il doit faire. Ton rôle est de :

1. Comprendre l'ACTION réalisée ou à faire
2. Identifier le ou les CONTACTS concernés parmi la liste de leads fournie
3. Rédiger une NOTE concise et professionnelle à enregistrer sur chaque lead
4. Suggérer la PROCHAINE ÉTAPE logique (avec une date de relance si pertinent)

IMPORTANT pour le matching des contacts :
- Fais du matching flou sur les noms (phonétique, diminutifs, noms partiels)
- "Nicolas Rudloff" peut matcher "Nicolas Rudloff" ou juste "Rudloff"
- "Coralie" peut matcher "Coralie Martin" ou "Coralie Durand"
- Si plusieurs leads ont le même prénom, retourne-les tous dans ambiguous_contacts et demande confirmation
- Si aucun match trouvé, retourne contacts_matched vide

TYPES D'ACTIONS COURANTES et emojis à utiliser dans la note :
- Estimation envoyée → 📧
- Appel effectué / rappel → 📞
- Visite effectuée → 🏠
- Mandat signé → ✍️
- Annonce publiée → 📢
- Relance à planifier → ⏰
- Lead froide / plus de nouvelles → ❄️
- Offre reçue → 💰
- Baisse de prix → 📉
- Autre action → 📝

Retourne UNIQUEMENT un JSON valide :
{
  "action_understood": "description courte de l'action comprise",
  "contacts_matched": [
    {
      "lead_id": "uuid du lead matché",
      "lead_type": "seller ou buyer",
      "lead_name": "nom complet du lead",
      "confidence": "high" | "medium" | "low",
      "note_content": "texte de la note à enregistrer (ex: '📧 Estimation envoyée le 23/02/2026')",
      "next_step": "suggestion de prochaine action (ex: 'Relancer dans 3 jours pour discuter du mandat')",
      "reminder_date": "YYYY-MM-DD si une relance est suggérée, sinon null"
    }
  ],
  "ambiguous_contacts": [
    {
      "name_mentioned": "prénom ou nom dicté",
      "possible_matches": [{"lead_id": "uuid", "lead_type": "seller ou buyer", "lead_name": "nom complet"}]
    }
  ],
  "unmatched_contacts": ["noms mentionnés mais non trouvés dans la base"]
}`;

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
                max_tokens: 800,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: `Transcription : "${transcription}"\n\nLeads de l'agent :\n${JSON.stringify(leads)}\n\nDate du jour : ${today}`
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Analyse échouée' });
        }

        const result = await response.json();
        const content = result.content?.[0]?.text || '{}';

        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        jsonStr = jsonStr.trim();

        const parsed = JSON.parse(jsonStr);
        return res.status(200).json(parsed);
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Analyse timeout (20s)' });
        }
        console.error('Parse-voice-note error:', err);
        return res.status(500).json({ error: 'Erreur interne : ' + err.message });
    }
}
