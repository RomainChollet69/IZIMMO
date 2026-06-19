/**
 * api/welcome-email.js
 * Envoie le mail de bienvenue à un nouvel inscrit (déclenché par login.html après signUp).
 * Sécurité : le token Bearer de la session est vérifié — seul un utilisateur réellement
 * authentifié peut déclencher l'envoi vers SA propre adresse (pas de vecteur de spam).
 * Idempotent : un flag `welcome_email_sent` dans user_metadata évite les doublons.
 * Dépendances : lib/auth.js (verifyAuth + getSupabaseAdmin), lib/mailgun-send.js
 */

import { verifyAuth, getSupabaseAdmin, withCORS } from '../lib/auth.js';
import { sendEmail } from '../lib/mailgun-send.js';

const APP_URL = 'https://www.avecleon.fr';

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

/**
 * Construit le HTML du mail de bienvenue aux couleurs de Léon.
 * Ton : tutoiement, chaleureux, orienté action (premier pas dans l'app).
 */
function buildWelcomeHtml(firstName) {
    const greeting = firstName ? `Salut ${firstName},` : 'Salut,';

    return `
    <div style="max-width:520px; margin:0 auto; font-family:Inter,Arial,sans-serif; background:#f8fafc; padding:24px">
        <div style="background:white; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1)">

            <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); padding:36px 28px; text-align:center">
                <img src="${APP_URL}/img/logo_200.png" alt="Léon" width="120" style="display:inline-block; max-width:120px; height:auto">
                <p style="margin:16px 0 0; color:rgba(255,255,255,0.95); font-size:15px; font-weight:600">
                    Ton assistant immobilier qui ne dort jamais.
                </p>
            </div>

            <div style="padding:32px 28px">
                <h1 style="margin:0 0 12px; font-size:22px; font-weight:800; color:#1e293b">${greeting}</h1>
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#334155">
                    Bienvenue dans Léon ! Ton compte est prêt. À partir de maintenant, tu lui parles et il s'occupe du reste :
                    tes leads, tes visites, ton agenda et tes relances, sans rien laisser passer. Voici tout ce qu'il sait faire pour toi.
                </p>

                <div style="margin:20px 0; padding:18px 20px; background:#f5f3ff; border-radius:12px">
                    <div style="font-size:13px; line-height:1.95; color:#4c1d95">
                        🎙️ <strong>Assistant vocal</strong> : dicte une note, Léon crée le lead, la visite, le rappel ou l'événement agenda<br>
                        🏡 <strong>Pipelines Vendeurs &amp; Acquéreurs</strong> : chaque dossier suivi du premier contact à la signature<br>
                        🔗 <strong>Matching automatique</strong> : Léon rapproche tes acquéreurs de tes biens (ville, surface, prix)<br>
                        📅 <strong>Visites automatisées</strong> : confirmation au visiteur, rappels la veille et le jour J, suivi après la visite<br>
                        📨 <strong>Demandes portails</strong> : réponds aux contacts Leboncoin et SeLoger directement depuis Léon<br>
                        📊 <strong>Marché &amp; DVF</strong> : prix de vente réels et DPE pour argumenter tes estimations<br>
                        📱 <strong>Community management</strong> : génère tes posts réseaux sociaux en un clic<br>
                        🗓️ <strong>Agenda connecté</strong> à ton Google Calendar, avec relances automatiques
                    </div>
                </div>

                <a href="${APP_URL}/home.html" style="
                    display:block; text-align:center; padding:15px;
                    background:linear-gradient(135deg,#667eea,#764ba2);
                    color:white; border-radius:12px; text-decoration:none;
                    font-size:15px; font-weight:700; margin-top:24px;
                ">Ouvrir Léon</a>

                <p style="margin:24px 0 0; font-size:14px; line-height:1.6; color:#64748b">
                    Le meilleur premier réflexe : ouvre l'assistant vocal et dis-lui ta prochaine tâche.
                    Tu vas vite voir la différence.
                </p>
            </div>
        </div>

        <p style="text-align:center; font-size:11px; color:#94a3b8; margin-top:16px">
            Tu reçois ce message car tu viens de créer un compte sur Léon.
        </p>
    </div>`;
}
