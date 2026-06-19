/**
 * api/welcome-email.js
 * Envoie le mail de bienvenue à un nouvel inscrit (déclenché par login.html après signUp).
 * Sécurité : le token Bearer de la session est vérifié — seul un utilisateur réellement
 * authentifié peut déclencher l'envoi vers SA propre adresse (pas de vecteur de spam).
 * Idempotent : un flag `welcome_email_sent` dans user_metadata évite les doublons.
 * Dépendances : lib/auth.js (verifyAuth + getSupabaseAdmin), lib/mailgun-send.js,
 *               lib/welcome-email.js (template HTML partagé)
 */

import { verifyAuth, getSupabaseAdmin, withCORS } from '../lib/auth.js';
import { sendEmail } from '../lib/mailgun-send.js';
import { buildWelcomeHtml } from '../lib/welcome-email.js';

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Le token de session prouve l'identité du destinataire : on n'envoie qu'à soi-même.
    const user = await verifyAuth(req);
    if (!user || !user.email) {
        return res.status(401).json({ error: 'Non authentifié' });
    }

    // Garde-fou idempotence : si le mail a déjà été envoyé pour ce compte, on ne renvoie pas
    // (protège contre un double-submit du formulaire ou un rechargement de page).
    if (user.user_metadata?.welcome_email_sent) {
        return res.status(200).json({ success: true, skipped: 'already_sent' });
    }

    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    const firstName = fullName.split(' ')[0] || '';

    const result = await sendEmail({
        to: user.email,
        subject: 'Bienvenue dans Léon 👋',
        html: buildWelcomeHtml(firstName)
    });

    if (!result.success) {
        console.error('[Welcome] Échec envoi mail bienvenue à', user.email, ':', result.error);
        return res.status(502).json({ error: 'Envoi échoué', detail: result.error });
    }

    // Marquer l'envoi pour ne jamais réexpédier (merge avec le metadata existant).
    try {
        const admin = getSupabaseAdmin();
        await admin.auth.admin.updateUserById(user.id, {
            user_metadata: { ...user.user_metadata, welcome_email_sent: true }
        });
    } catch (err) {
        // Non bloquant : le mail est déjà parti, on log juste l'échec du flag.
        console.error('[Welcome] Flag welcome_email_sent non écrit pour', user.id, ':', err.message);
    }

    console.log('[Welcome] Mail de bienvenue envoyé à', user.email);
    return res.status(200).json({ success: true, id: result.id });
}
