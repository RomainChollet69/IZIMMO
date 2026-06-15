/**
 * lib/visit-followup-email.js
 * Construit le HTML de l'email de suivi envoyé automatiquement au visiteur
 * ~30 min après une visite (voir api/cron-visit-followup.js).
 * Reprend la charte des emails Léon (cf. inbound-email.js / buildAutoReplyHtml).
 * Aucune dépendance externe — fonctions pures.
 */

// Libellé de chaque type de lien. L'ordre définit l'ordre d'affichage des boutons.
// La couleur des boutons vient de la couleur de marque de l'agent (multi-agences).
const LINK_BUTTONS = [
    { key: 'documents',   label: '📄 Documents du bien' },
    { key: 'virtualTour', label: '🎥 Visite virtuelle' },
    { key: 'listing',     label: '🔗 Voir l\'annonce' }
];

// Couleur par défaut des boutons si l'agent n'a pas défini de couleur de marque.
const DEFAULT_BUTTON_COLOR = '#2C3E50';

// Valide une couleur hex (#rgb, #rrggbb) avant injection dans le style — anti-injection CSS.
function isSafeColor(c) {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
}

/**
 * Échappe le HTML pour les valeurs injectées (nom, adresse) — évite toute casse de template.
 */
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Construit le corps HTML du mail de suivi.
 * @param {Object} params
 * @param {string} [params.visitorFirstName] - Prénom du visiteur (sinon "Bonjour,")
 * @param {string} [params.propertyLabel] - Désignation du bien (ex: "9 montée des Soldats, Caluire")
 * @param {Object} params.links - { documents, virtualTour, listing } (URLs, certaines vides)
 * @param {Object} [params.agent] - { name, agency, avatarUrl, showPhoto, logoUrl, brandColor, phone }
 * @returns {string} HTML complet
 */
export function buildVisitFollowupHtml({ visitorFirstName, propertyLabel, links = {}, agent = {} }) {
    const greeting = visitorFirstName ? `Bonjour ${escapeHtml(visitorFirstName)},` : 'Bonjour,';
    const propertyPhrase = propertyLabel
        ? `notre visite du bien situé <strong>${escapeHtml(propertyLabel)}</strong>`
        : 'notre visite de ce jour';

    // Couleur de marque de l'agent (multi-agences) ; validée pour éviter toute injection CSS.
    const brandColor = isSafeColor(agent.brandColor) ? agent.brandColor : DEFAULT_BUTTON_COLOR;

    const signatureName = escapeHtml(agent.name || 'Votre conseiller');
    const signatureAgency = agent.agency
        ? `<br><span style="color:#78909C">${escapeHtml(agent.agency)}</span>` : '';
    const signaturePhone = agent.phone
        ? `<br><span style="color:#78909C">${escapeHtml(agent.phone)}</span>` : '';

    // Photo agent (optionnelle)
    let agentPhotoHtml = '';
    if (agent.showPhoto && agent.avatarUrl) {
        agentPhotoHtml = `<tr><td style="padding:24px 40px 0" align="center">
            <img src="${escapeHtml(agent.avatarUrl)}" alt="${signatureName}" width="72" height="72" style="border-radius:50%;border:3px solid #E0E0E0;object-fit:cover" referrerpolicy="no-referrer">
            <p style="font-size:15px;font-weight:700;color:#2C3E50;margin:10px 0 0">${signatureName}</p>
            ${agent.agency ? `<p style="font-size:13px;color:#78909C;margin:2px 0 0">${escapeHtml(agent.agency)}</p>` : ''}
        </td></tr>`;
    }

    // Boutons : uniquement les liens fournis, dans l'ordre de LINK_BUTTONS, à la couleur de marque.
    const buttonsHtml = LINK_BUTTONS
        .filter(b => links[b.key])
        .map(b => `<tr><td style="padding:0 40px 12px" align="center">
            <a href="${escapeHtml(links[b.key])}" target="_blank" style="
                display:block;max-width:360px;padding:15px 24px;
                background:${brandColor};color:#ffffff;
                font-size:16px;font-weight:600;
                text-decoration:none;border-radius:8px;letter-spacing:0.3px;
            ">${b.label}</a>
        </td></tr>`)
        .join('');

    // En-tête : logo de l'agence si fourni, sinon le nom de l'agence en texte.
    const headerHtml = agent.logoUrl
        ? `<img src="${escapeHtml(agent.logoUrl)}" alt="${escapeHtml(agent.agency || '')}" height="48" style="max-width:240px" referrerpolicy="no-referrer">`
        : (agent.agency ? `<span style="font-size:22px;font-weight:700;color:#2C3E50;letter-spacing:0.5px">${escapeHtml(agent.agency)}</span>` : '');

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

<!-- Photo agent -->
${agentPhotoHtml}

<!-- Body -->
<tr><td style="padding:${agent.showPhoto && agent.avatarUrl ? '16px' : '36px'} 40px 20px">
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 20px">${greeting}</p>
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 20px">
        Pour faire suite à ${propertyPhrase}, vous trouverez ci-dessous l'ensemble
        des éléments utiles à votre réflexion.
    </p>
</td></tr>

<!-- Boutons liens -->
${buttonsHtml}

<!-- Disponibilité -->
<tr><td style="padding:16px 40px 8px">
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0">
        Je reste à votre entière disposition pour tout complément d'information.
    </p>
</td></tr>

<!-- Footer / signature -->
<tr><td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0">
    <p style="font-size:14px;color:#2C3E50;line-height:1.6;margin:0">
        Bien à vous,<br>
        <strong>${signatureName}</strong>${signatureAgency}${signaturePhone}
    </p>
</td></tr>

</table>

<!-- Disclaimer -->
<p style="font-size:11px;color:#aaa;text-align:center;margin-top:20px;line-height:1.5">
    Cet email vous est adressé suite à la visite d'un bien immobilier.<br>
    Pour toute question, répondez simplement à ce message.
</p>

</td></tr></table>
</body></html>`;
}
