/**
 * lib/mailgun-send.js
 * Helper d'envoi d'emails via l'API Mailgun.
 * Utilisé pour les réponses automatiques aux demandes portail.
 * Dépendances : MAILGUN_API_KEY et MAILGUN_DOMAIN dans les env vars.
 */

const MAILGUN_EU_BASE = 'https://api.eu.mailgun.net/v3';

/**
 * Envoie un email via Mailgun.
 * @param {Object} params
 * @param {string} params.to - Adresse email du destinataire
 * @param {string} params.subject - Sujet de l'email
 * @param {string} params.html - Corps HTML de l'email
 * @param {string} [params.from] - Expéditeur (défaut: Léon <noreply@DOMAIN>)
 * @param {string} [params.replyTo] - Adresse de réponse (ex: l'email de l'agent)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, from, replyTo }) {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    if (!apiKey || !domain) {
        console.error('[Mailgun] MAILGUN_API_KEY ou MAILGUN_DOMAIN non configuré');
        return { success: false, error: 'Mailgun non configuré' };
    }

    const sender = from || `Léon <noreply@${domain}>`;
    const auth = Buffer.from(`api:${apiKey}`).toString('base64');

    const formData = new URLSearchParams();
    formData.append('from', sender);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('html', html);
    if (replyTo) formData.append('h:Reply-To', replyTo);

    try {
        const resp = await fetch(`${MAILGUN_EU_BASE}/${domain}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!resp.ok) {
            const errBody = await resp.text();
            console.error(`[Mailgun] Erreur ${resp.status}:`, errBody);
            return { success: false, error: `Mailgun ${resp.status}: ${errBody.substring(0, 200)}` };
        }

        const data = await resp.json();
        console.log('[Mailgun] Email envoyé:', data.id, '→', to);
        return { success: true, id: data.id };
    } catch (err) {
        console.error('[Mailgun] Erreur réseau:', err.message);
        return { success: false, error: err.message };
    }
}
