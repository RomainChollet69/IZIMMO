/**
 * lib/agency-branding.js
 * Branding par défaut selon le domaine email du conseiller (multi-agences).
 * Sert de fallback dans les emails automatiques quand le conseiller n'a pas
 * configuré sa couleur / son logo lui-même (ses réglages persos restent prioritaires).
 * Ajouter ici toute nouvelle agence partenaire.
 */

// domaine email → branding. logoPath est relatif à la racine du site (servi par Vercel).
const AGENCY_PRESETS = {
    // Efficity — charte 2022 : vert gazon #52AE32, logo texte noir pour fond clair.
    'efficity.com': { brandColor: '#52AE32', logoPath: '/img/agencies/efficity.jpg' },
    'efficity.fr':  { brandColor: '#52AE32', logoPath: '/img/agencies/efficity.jpg' }
};

/**
 * Retourne le preset de marque pour un email donné, ou null si domaine inconnu.
 * @param {string} email
 * @returns {{ brandColor: string, logoPath: string } | null}
 */
export function getAgencyBranding(email) {
    if (!email || typeof email !== 'string') return null;
    const at = email.lastIndexOf('@');
    if (at === -1) return null;
    const domain = email.slice(at + 1).toLowerCase().trim();
    return AGENCY_PRESETS[domain] || null;
}
