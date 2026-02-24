/**
 * assistant-draft-message.js
 * Génère un message contextuel (WhatsApp/SMS/Email) pour l'assistant organisationnel.
 * Adapte le ton et le format selon le canal et la relation.
 * Modèle : Claude Haiku 4.5.
 * Dépendances : _auth.js (verifyAuth, withCORS)
 */

import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { who, who_role, context, tone, channel, slots, user_name } = req.body;

    if (!who || !channel) {
        return res.status(400).json({ error: 'who et channel requis' });
    }

    // Formater les créneaux pour le prompt
    const slotsFormatted = slots && slots.length > 0
        ? slots.map(s => `${s.day_label} de ${s.start} à ${s.end}`).join(', ')
        : 'Aucun créneau spécifique fourni';

    const systemPrompt = `Tu es Léon, l'assistant d'un conseiller immobilier. Tu rédiges un message pour ${user_name || 'l\'agent'} à envoyer à un contact.

DESTINATAIRE : ${who} (${who_role || 'contact'})
CONTEXTE : ${context || 'prise de contact'}
CANAL : ${channel}
TON : ${tone || 'professionnel'}
CRÉNEAUX DISPONIBLES : ${slotsFormatted}

Rédige UN message prêt à copier-coller adapté au canal :

- WhatsApp : conversationnel, tutoiement si amical, 3-5 lignes max, emojis ok (1-2 max)
- SMS : très court (2-3 lignes max), direct, pas d'emojis
- Email : structuré, formule de politesse, inclure un objet (champ "subject")

RETOURNE un JSON :
{
  "message": "le texte du message prêt à copier-coller",
  "subject": "objet de l'email (null si pas email)",
  "channel": "${channel}"
}

RÈGLES ABSOLUES :
- Le message doit paraître 100% naturel, comme écrit par un humain
- Adapter vouvoiement/tutoiement au ton (amical = tu, formel = vous)
- Inclure les créneaux de manière NATURELLE dans le texte, pas en liste
- Ne JAMAIS mentionner "Léon", "IA", "assistant", "automatique" dans le message
- Signer avec le prénom de l'agent : "${user_name || ''}"
- Si pas de créneaux fournis, rédiger le message sans mentionner de dates`;

    const userMessage = `Rédige le message pour ${who} (${who_role || 'contact'}) concernant : ${context || 'prise de contact'}. Canal : ${channel}. Ton : ${tone || 'professionnel'}.`;

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
                max_tokens: 500,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[AssistantDraftMessage] Erreur API:', response.status, errBody);
            return res.status(502).json({ error: 'AI generation failed' });
        }

        const data = await response.json();
        const text = data.content[0].text;

        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
            const parsed = JSON.parse(cleaned);
            console.log(`[AssistantDraftMessage] Message généré pour ${who} via ${channel}`);
            return res.status(200).json(parsed);
        } catch (parseErr) {
            console.error('[AssistantDraftMessage] JSON parse error:', parseErr.message);
            // Fallback : retourner le texte brut comme message
            return res.status(200).json({
                message: text,
                subject: null,
                channel
            });
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Timeout' });
        }
        console.error('[AssistantDraftMessage] Erreur:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
