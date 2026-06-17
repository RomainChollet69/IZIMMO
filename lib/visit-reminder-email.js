/**
 * lib/visit-reminder-email.js
 * Construit le HTML de l'email de RAPPEL de visite envoyé automatiquement au visiteur
 * ~24h puis ~4h avant la visite (voir api/cron-visit-reminder.js).
 * Reprend la charte des emails Léon (cf. visit-followup-email.js).
 * Aucune dépendance externe, fonctions pures.
 */

const DEFAULT_ACCENT = '#2C3E50';

function isSafeColor(c) {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Corps HTML du rappel de visite.
 * @param {Object} params
 * @param {string} [params.visitorFirstName] - Prénom du visiteur (sinon "Bonjour,")
 * @param {string} params.whenLabel - Quand, en clair (ex: "demain mardi 18 juin à 14h00")
 * @param {string} [params.propertyAddress] - Adresse du bien
 * @param {string} [params.mapUrl] - Lien Google Maps de l'adresse (optionnel)
 * @param {Object} [params.agent] - { name, agency, avatarUrl, showPhoto, logoUrl, brandColor, phone }
 * @returns {string} HTML complet
 */
export function buildVisitReminderHtml({ kind = 'reminder', visitorFirstName, whenLabel, propertyAddress, mapUrl, agent = {} }) {
    const greeting = visitorFirstName ? `Bonjour ${escapeHtml(visitorFirstName)},` : 'Bonjour,';
    const accent = isSafeColor(agent.brandColor) ? agent.brandColor : DEFAULT_ACCENT;
    // Phrase d'intro selon le type d'envoi (confirmation à la programmation, ou rappel avant la visite).
    const introSentence = kind === 'confirmation'
        ? `Votre visite est bien programmée <strong>${escapeHtml(whenLabel)}</strong>. Voici le récapitulatif, à très bientôt.`
        : `Petit rappel de notre visite <strong>${escapeHtml(whenLabel)}</strong>. J'ai hâte de vous y retrouver.`;

    const signatureName = escapeHtml(agent.name || 'Votre conseiller');
    const signatureAgency = agent.agency
        ? `<br><span style="color:#78909C">${escapeHtml(agent.agency)}</span>` : '';
    const signaturePhone = agent.phone
        ? `<br><span style="color:#78909C">${escapeHtml(agent.phone)}</span>` : '';

    let agentPhotoHtml = '';
    if (agent.showPhoto && agent.avatarUrl) {
        agentPhotoHtml = `<tr><td style="padding:24px 40px 0" align="center">
            <img src="${escapeHtml(agent.avatarUrl)}" alt="${signatureName}" width="72" height="72" style="border-radius:50%;border:3px solid #E0E0E0;object-fit:cover" referrerpolicy="no-referrer">
            <p style="font-size:15px;font-weight:700;color:#2C3E50;margin:10px 0 0">${signatureName}</p>
            ${agent.agency ? `<p style="font-size:13px;color:#78909C;margin:2px 0 0">${escapeHtml(agent.agency)}</p>` : ''}
        </td></tr>`;
    }

    const headerHtml = agent.logoUrl
        ? `<img src="${escapeHtml(agent.logoUrl)}" alt="${escapeHtml(agent.agency || '')}" height="48" style="max-width:240px" referrerpolicy="no-referrer">`
        : (agent.agency ? `<span style="font-size:22px;font-weight:700;color:#2C3E50;letter-spacing:0.5px">${escapeHtml(agent.agency)}</span>` : '');

    // Encart récapitulatif : quand + adresse (avec lien Maps optionnel).
    const addressLine = propertyAddress
        ? `<tr><td style="padding-top:10px"><span style="color:#78909C;font-size:13px">Adresse</span><br>
              <span style="color:#2C3E50;font-size:16px;font-weight:600">${escapeHtml(propertyAddress)}</span>
              ${mapUrl ? `<br><a href="${escapeHtml(mapUrl)}" target="_blank" style="color:${accent};font-size:13px;font-weight:600;text-decoration:none">Voir l'itinéraire →</a>` : ''}
           </td></tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

<!-- Header -->
<tr><td style="background:#F5F5F7;padding:28px 40px;text-align:center;border-bottom:1px solid #E8E8ED">
    ${headerHtml}
</td></tr>

${agentPhotoHtml}

<!-- Body -->
<tr><td style="padding:${agent.showPhoto && agent.avatarUrl ? '16px' : '36px'} 40px 8px">
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 16px">${greeting}</p>
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 8px">
        ${introSentence}
    </p>
</td></tr>

<!-- Encart quand + adresse -->
<tr><td style="padding:8px 40px 4px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FB;border:1px solid #EEF0F3;border-radius:12px">
        <tr><td style="padding:16px 18px">
            <span style="color:#78909C;font-size:13px">Quand</span><br>
            <span style="color:#2C3E50;font-size:16px;font-weight:600">${escapeHtml(whenLabel)}</span>
            ${addressLine ? `<table width="100%" cellpadding="0" cellspacing="0">${addressLine}</table>` : ''}
        </td></tr>
    </table>
</td></tr>

<!-- Empêchement -->
<tr><td style="padding:18px 40px 8px">
    <p style="font-size:15px;color:#2C3E50;line-height:1.7;margin:0">
        Un empêchement ou une question ? Répondez simplement à cet email.
    </p>
</td></tr>

<!-- Footer / signature -->
<tr><td style="padding:18px 40px 28px;border-top:1px solid #f0f0f0">
    <p style="font-size:14px;color:#2C3E50;line-height:1.6;margin:0">
        À très vite,<br>
        <strong>${signatureName}</strong>${signatureAgency}${signaturePhone}
    </p>
</td></tr>

</table>

<p style="font-size:11px;color:#aaa;text-align:center;margin-top:20px;line-height:1.5">
    Message automatique concernant une visite planifiée.<br>
    Pour toute question, répondez simplement à ce message.
</p>

</td></tr></table>
</body></html>`;
}
