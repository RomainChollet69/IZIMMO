/**
 * cron-visit-followup.js
 * Cron Vercel (toutes les ~10 min) : envoie automatiquement au visiteur un email
 * de suivi ~30 min après l'heure planifiée d'une visite, avec les liens du bien
 * (documents, visite virtuelle, annonce) saisis sur la fiche vendeur.
 *
 * Déclencheur : visit_date + visit_time (heure murale Europe/Paris) + 30 min.
 * Garde-fous : statut ≠ annulee, ≥ 1 lien rempli, email visiteur valide, agent opt-in
 * (profiles.visit_followup_enabled), envoi unique (visits.followup_sent_at), fenêtre ≤ 24h.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (ajouté par Vercel aux requêtes cron).
 * Dépendances : lib/auth.js (admin), lib/mailgun-send.js, lib/visit-followup-email.js
 */

import { getSupabaseAdmin } from '../lib/auth.js';
import { sendEmail } from '../lib/mailgun-send.js';
import { buildVisitFollowupHtml } from '../lib/visit-followup-email.js';
import { getAgencyBranding } from '../lib/agency-branding.js';

const FOLLOWUP_DELAY_MS = 30 * 60 * 1000;        // 30 min après l'heure de visite
const BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;  // ne jamais relancer une visite > 24h (anti-backlog)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    // --- Auth cron ---
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = Date.now();

    // URL de base du site (pour les logos hébergés dans /img).
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'https://www.avecleon.fr';

    try {
        // 1. Agents ayant activé la feature (opt-in)
        const { data: enabledProfiles, error: profErr } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, agency_name, avatar_url, auto_reply_show_photo, auto_reply_logo, brand_color, phone_pro')
            .eq('visit_followup_enabled', true);
        if (profErr) throw profErr;
        if (!enabledProfiles || enabledProfiles.length === 0) {
            return res.status(200).json({ ok: true, sent: 0, reason: 'aucun agent activé' });
        }
        const profileById = new Map(enabledProfiles.map(p => [p.id, p]));
        const enabledIds = enabledProfiles.map(p => p.id);

        // 2. Visites candidates : non relancées, non annulées, avec heure, récentes (≤ ~2 jours)
        //    Le filtrage fin "+30min / fenêtre 24h" se fait en JS (calcul de fuseau Europe/Paris).
        const sinceDate = new Date(now - BACKFILL_WINDOW_MS - 86400000)
            .toISOString().split('T')[0]; // marge d'un jour pour couvrir le décalage de fuseau
        const { data: visits, error: visErr } = await supabaseAdmin
            .from('visits')
            .select(`id, user_id, visit_date, visit_time, status, buyer_name, visitor_email,
                     buyers ( first_name, email ),
                     sellers ( first_name, last_name, address, link_documents, link_virtual_tour, link_listing )`)
            .is('followup_sent_at', null)
            .neq('status', 'annulee')
            .in('user_id', enabledIds)
            .not('visit_time', 'is', null)
            .gte('visit_date', sinceDate);
        if (visErr) throw visErr;

        let sent = 0, skipped = 0;
        const emailByUser = new Map(); // cache : user_id -> email agent (reply-to)

        for (const visit of (visits || [])) {
            // Instant réel de la visite (heure murale Paris → UTC) + 30 min
            const visitInstant = parisWallTimeToInstant(visit.visit_date, visit.visit_time);
            if (visitInstant === null) { skipped++; continue; }
            const dueAt = visitInstant + FOLLOWUP_DELAY_MS;
            // Éligible seulement si l'échéance est passée ET dans la fenêtre des dernières 24h
            if (dueAt > now || dueAt < now - BACKFILL_WINDOW_MS) { skipped++; continue; }

            // Email du visiteur
            const visitorEmail = (visit.buyers && visit.buyers.email) || visit.visitor_email || '';
            if (!EMAIL_RE.test(visitorEmail)) { skipped++; continue; }

            // Liens du bien (au moins un requis)
            const s = visit.sellers || {};
            const links = {
                documents: s.link_documents || '',
                virtualTour: s.link_virtual_tour || '',
                listing: s.link_listing || ''
            };
            if (!links.documents && !links.virtualTour && !links.listing) { skipped++; continue; }

            // Identité agent
            const profile = profileById.get(visit.user_id) || {};
            const agent = {
                name: profile.full_name || '',
                agency: profile.agency_name || '',
                avatarUrl: profile.avatar_url || '',
                showPhoto: profile.auto_reply_show_photo !== false,
                logoUrl: profile.auto_reply_logo || '',
                brandColor: profile.brand_color || '',
                phone: profile.phone_pro || ''
            };

            // Email de l'agent (reply-to) — résolu via auth admin, mis en cache
            let agentEmail = emailByUser.get(visit.user_id);
            if (agentEmail === undefined) {
                try {
                    const { data: u } = await supabaseAdmin.auth.admin.getUserById(visit.user_id);
                    agentEmail = (u && u.user && u.user.email) || '';
                } catch (e) { agentEmail = ''; }
                emailByUser.set(visit.user_id, agentEmail);
            }

            // Fallback branding par domaine email (ex: conseillers @efficity.com) si non
            // configuré individuellement — les réglages persos de l'agent restent prioritaires.
            if (!agent.brandColor || !agent.logoUrl) {
                const branding = getAgencyBranding(agentEmail);
                if (branding) {
                    if (!agent.brandColor) agent.brandColor = branding.brandColor;
                    if (!agent.logoUrl) agent.logoUrl = baseUrl + branding.logoPath;
                }
            }

            // Prénom visiteur + désignation du bien
            const visitorFirstName = (visit.buyers && visit.buyers.first_name)
                || (visit.buyer_name || '').trim().split(' ')[0] || '';
            const propertyLabel = s.address
                || [s.first_name, s.last_name].filter(Boolean).join(' ')
                || '';

            const html = buildVisitFollowupHtml({ visitorFirstName, propertyLabel, links, agent });

            const domain = process.env.MAILGUN_DOMAIN || 'inbound.avecleon.fr';
            const fromName = agent.name && agent.agency
                ? `${agent.name} — ${agent.agency}`
                : agent.name || agent.agency || 'Léon';
            const subject = `Suite à notre visite${propertyLabel ? ' — ' + propertyLabel : ''}`;

            const result = await sendEmail({
                to: visitorEmail,
                subject,
                html,
                from: `${fromName} <noreply@${domain}>`,
                replyTo: agentEmail || undefined,
                // Agent en copie de l'envoi de documents (pour vérifier que le mail est bon et parti).
                cc: agentEmail || undefined
            });

            if (result.success) {
                await supabaseAdmin
                    .from('visits')
                    .update({ followup_sent_at: new Date().toISOString() })
                    .eq('id', visit.id);
                sent++;
                console.log(`[VisitFollowup] Envoyé à ${visitorEmail} (visite ${visit.id})`);
            } else {
                skipped++;
                console.error(`[VisitFollowup] Échec envoi visite ${visit.id}:`, result.error);
            }
        }

        return res.status(200).json({ ok: true, sent, skipped, candidates: (visits || []).length });
    } catch (err) {
        console.error('[VisitFollowup] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Convertit une heure murale Europe/Paris (date + heure saisies par l'agent) en instant
 * UTC (ms). Gère l'heure d'été/hiver via l'offset réel de Paris à cette date.
 * @returns {number|null} timestamp en ms, ou null si entrée invalide.
 */
function parisWallTimeToInstant(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    if ([y, mo, d, h, mi].some(n => Number.isNaN(n))) return null;
    // 1re approximation : on traite l'heure murale comme si elle était UTC.
    const guessUTC = Date.UTC(y, mo - 1, d, h, mi);
    // Offset réel de Paris à cet instant, puis correction.
    const offsetMs = parisOffsetMs(new Date(guessUTC));
    return guessUTC - offsetMs;
}

/** Offset (ms) du fuseau Europe/Paris par rapport à UTC à l'instant donné. */
function parisOffsetMs(date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p = dtf.formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asIfUTC - date.getTime();
}
