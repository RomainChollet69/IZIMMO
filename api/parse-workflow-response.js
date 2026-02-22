import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
    // CORS
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { transcription, stepLabel, leadName, leadStatus, workflowType, sortOrder, recentNotes } = req.body || {};
    if (!transcription || !stepLabel) return res.status(400).json({ error: 'Missing required fields' });

    const notesContext = recentNotes && recentNotes.length > 0
        ? recentNotes.slice(0, 3).map(n => `- ${n}`).join('\n')
        : 'Aucune note récente.';

    const systemPrompt = `Tu es Léon, l'assistant CRM d'un agent immobilier.

CONTEXTE :
- Question posée à l'agent : "${stepLabel}"
- Lead concerné : ${leadName || 'inconnu'}
- Statut actuel : ${leadStatus || 'inconnu'}
- Workflow en cours : ${workflowType || 'inconnu'}, étape #${sortOrder || '?'}
- Notes récentes :
${notesContext}

RÉPONSE TRANSCRITE DE L'AGENT :
"${transcription}"

Analyse la réponse et retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après) :
{
  "step_completed": true | false,
  "step_in_progress": true | false,
  "note_summary": "résumé factuel de ce que l'agent a dit (1-2 phrases max)",
  "reminder_date": "YYYY-MM-DD" | null,
  "reminder_reason": "raison du rappel" | null,
  "todo_text": "tâche à créer" | null,
  "leon_response": "ce que Léon devrait répondre (encourageant, utile, 1-2 phrases)"
}

Règles :
- Si l'agent dit que c'est fait → step_completed = true
- Si l'agent dit "en cours", "bientôt", "pas encore" → step_in_progress = true, step_completed = false
- Si l'agent mentionne une date ou un délai → extraire reminder_date (format YYYY-MM-DD)
- Si l'agent mentionne une action à faire → extraire todo_text
- Toujours remplir note_summary, même si step_completed = true
- leon_response doit être encourageant et utile, jamais autoritaire
- Retourne UNIQUEMENT le JSON, sans markdown, sans commentaire`;

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
                max_tokens: 512,
                messages: [{ role: 'user', content: systemPrompt }]
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
        const text = result.content?.[0]?.text || '';

        // Parse the JSON from Claude's response
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            // Try to extract JSON from potential markdown wrapping
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                console.error('Failed to parse Claude response:', text);
                return res.status(502).json({ error: 'Invalid AI response format' });
            }
        }

        return res.status(200).json(parsed);
    } catch (err) {
        if (err.name === 'AbortError') return res.status(504).json({ error: 'Parsing timeout' });
        console.error('Parse-workflow-response error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
