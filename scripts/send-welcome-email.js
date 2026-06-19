/**
 * scripts/send-welcome-email.js
 * Envoi MANUEL (one-off) du mail de bienvenue Léon à une adresse donnée.
 * Cas d'usage : renvoyer la bienvenue à un inscrit qui ne l'a pas reçue
 * (ex: comptes créés avant la mise en place du mail de bienvenue).
 *
 * Réutilise exactement le template de production (lib/welcome-email.js) et
 * l'envoi Mailgun (lib/mailgun-send.js). Aucun secret en dur : les identifiants
 * Mailgun sont lus dans l'environnement.
 *
 * Usage :
 *   MAILGUN_API_KEY=... MAILGUN_DOMAIN=... \
 *     node scripts/send-welcome-email.js <email> "<Prénom Nom>"
 *
 * Sans argument, cible Philippe Bouvry (inscrit le 2026-06-18 sans mail reçu).
 */

import { sendEmail } from '../lib/mailgun-send.js';
import { buildWelcomeHtml } from '../lib/welcome-email.js';

const DEFAULT_EMAIL = 'pbouvry@efficity.com';
const DEFAULT_FULL_NAME = 'Philippe Bouvry';

// Met le prénom en casse propre (« PHILIPPE » -> « Philippe ») pour la salutation.
function cleanFirstName(fullName) {
    const raw = (fullName || '').trim().split(/\s+/)[0] || '';
    if (!raw) return '';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

async function main() {
    const email = process.argv[2] || DEFAULT_EMAIL;
    const fullName = process.argv[3] || DEFAULT_FULL_NAME;
    const firstName = cleanFirstName(fullName);

    if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
        console.error('❌ MAILGUN_API_KEY et MAILGUN_DOMAIN requis dans l\'environnement.');
        console.error('   Récupère-les depuis Vercel (Settings > Environment Variables) puis relance :');
        console.error('   MAILGUN_API_KEY=... MAILGUN_DOMAIN=... node scripts/send-welcome-email.js');
        process.exit(1);
    }

    console.log(`→ Envoi du mail de bienvenue à ${firstName} <${email}>...`);

    const result = await sendEmail({
        to: email,
        subject: 'Bienvenue dans Léon 👋',
        html: buildWelcomeHtml(firstName)
    });

    if (result.success) {
        console.log(`✅ Envoyé. Mailgun id: ${result.id}`);
    } else {
        console.error(`❌ Échec: ${result.error}`);
        process.exit(1);
    }
}

main();
