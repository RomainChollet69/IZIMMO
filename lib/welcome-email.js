/**
 * lib/welcome-email.js
 * Template HTML du mail de bienvenue Léon (charte : gradient, tutoiement, CTA).
 * Partagé entre l'endpoint api/welcome-email.js (déclenché au signup) et les
 * envois one-off (scripts/send-welcome-email.js, renvoi manuel à un inscrit).
 */

const APP_URL = 'https://www.avecleon.fr';

/**
 * Construit le HTML du mail de bienvenue aux couleurs de Léon.
 * @param {string} firstName - Prénom du destinataire (vide => salutation neutre)
 * @returns {string} HTML complet du corps de l'email
 */
export function buildWelcomeHtml(firstName) {
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
