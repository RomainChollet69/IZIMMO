/**
 * cron-visit-reminder.js
 * Cron Vercel (toutes les ~10 min) : emails automatiques autour d'une visite, au visiteur.
 *   - Confirmation : ~à la programmation (visite créée dans les ~20 dernières min) — opt-in
 *     profiles.visit_confirmation_enabled, envoi unique via visits.confirmation_sent_at.
 *   - Rappel 24h avant + Rappel 4h avant — opt-in profiles.visit_reminder_enabled, envoi
 *     unique via visits.reminder_24h_sent_at / reminder_4h_sent_at.
 * Tous incluent l'heure + l'adresse du bien (lien Maps).
 *
 * Déclencheur : visit_date + visit_time (heure murale Europe/Paris). Garde-fous : statut
 * ≠ annulee, email visiteur valide, agent opt-in. Pas d'envoi "en retard" pour les rappels
 * (fenêtre de 15 min, > intervalle cron). Une confirmation imminente (< 4h) inhibe le rappel 4h.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (ajouté par Vercel aux requêtes cron).
 * Dépendances : lib/auth.js (admin), lib/mailgun-send.js, lib/visit-reminder-email.js
 */

import { getSupabaseAdmin } from '../lib/auth.js';
import { sendEmail } from '../lib/mailgun-send.js';
import { buildVisitReminderHtml } from '../lib/visit-reminder-email.js';
import { getAgencyBranding } from '../lib/agency-branding.js';

const H24 = 24 * 60 * 60 * 1000;
const H4 = 4 * 60 * 60 * 1000;
const LEAD_WINDOW_MS = 15 * 60 * 1000;     // fenêtre de déclenchement des rappels (> intervalle cron de 10 min)
const CONFIRM_WINDOW_MS = 20 * 60 * 1000;  // confirmation : seulement pour les visites créées dans les ~20 dernières min
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = Date.now();
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'https://www.avecleon.fr';

    try {
        // 1. Agents opt-in
        const { data: enabledProfiles, error: profErr } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, agency_name, avatar_url, auto_reply_show_photo, auto_reply_logo, brand_color, phone_pro, visit_reminder_enabled, visit_confirmation_enabled')
            .or('visit_reminder_enabled.eq.true,visit_confirmation_enabled.eq.true');
        if (profErr) throw profErr;
        if (!enabledProfiles || enabledProfiles.length === 0) {
            return res.status(200).json({ ok: true, sent: 0, reason: 'aucun agent activé' });
        }
        const profileById = new Map(enabledProfiles.map(p => [p.id, p]));
        const enabledIds = enabledProfiles.map(p => p.id);

        // 2. Visites à venir (≥ aujourd'hui, marge fuseau d'un jour), non annulées, avec heure.
        //    Pas de borne haute : la confirmation peut concerner une visite planifiée loin.
        const today = parisDateStr(new Date(now - 86400000));
        const { data: visits, error: visErr } = await supabaseAdmin
            .from('visits')
            .select(`id, user_id, visit_date, visit_time, status, buyer_name, visitor_email, created_at,
                     confirmation_sent_at, reminder_24h_sent_at, reminder_4h_sent_at,
                     buyers ( first_name, email ),
                     sellers ( first_name, last_name, address )`)
            .neq('status', 'annulee')
            .in('user_id', enabledIds)
            .not('visit_time', 'is', null)
            .gte('visit_date', today);
        if (visErr) throw visErr;

        let sent = 0, skipped = 0;
        const emailByUser = new Map();

        for (const visit of (visits || [])) {
            const visitInstant = parisWallTimeToInstant(visit.visit_date, visit.visit_time);
            if (visitInstant === null) { skipped++; continue; }
            const msUntil = visitInstant - now;

            const profile = profileById.get(visit.user_id) || {};
            const createdMs = visit.created_at ? Date.parse(visit.created_at) : 0;

            // Quelle étape ? Confirmation (création récente) prioritaire, puis rappel 24h, puis 4h.
            let stage = null, kind = 'reminder';
            if (profile.visit_confirmation_enabled && !visit.confirmation_sent_at
                && msUntil > 0 && createdMs >= now - CONFIRM_WINDOW_MS) {
                stage = 'confirmation'; kind = 'confirmation';
            } else if (profile.visit_reminder_enabled && !visit.reminder_24h_sent_at
                && msUntil <= H24 && msUntil > H24 - LEAD_WINDOW_MS) {
                stage = '24h';
            } else if (profile.visit_reminder_enabled && !visit.reminder_4h_sent_at
                && msUntil <= H4 && msUntil > H4 - LEAD_WINDOW_MS) {
                stage = '4h';
            }
            if (!stage) { skipped++; continue; }

            const visitorEmail = (visit.buyers && visit.buyers.email) || visit.visitor_email || '';
            if (!EMAIL_RE.test(visitorEmail)) { skipped++; continue; }

            const s = visit.sellers || {};
            const propertyAddress = s.address || '';
            const mapUrl = propertyAddress
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propertyAddress)}`
                : '';
            const whenLabel = whenLabelFor(visit.visit_date, visit.visit_time);

            // Identité agent + branding (réglages persos prioritaires, fallback par domaine)
            const agent = {
                name: profile.full_name || '', agency: profile.agency_name || '',
                avatarUrl: profile.avatar_url || '', showPhoto: profile.auto_reply_show_photo !== false,
                logoUrl: profile.auto_reply_logo || '', brandColor: profile.brand_color || '',
                phone: profile.phone_pro || ''
            };
            let agentEmail = emailByUser.get(visit.user_id);
            if (agentEmail === undefined) {
                try {
                    const { data: u } = await supabaseAdmin.auth.admin.getUserById(visit.user_id);
                    agentEmail = (u && u.user && u.user.email) || '';
                } catch (e) { agentEmail = ''; }
                emailByUser.set(visit.user_id, agentEmail);
            }
            if (!agent.brandColor || !agent.logoUrl) {
                const branding = getAgencyBranding(agentEmail);
                if (branding) {
                    if (!agent.brandColor) agent.brandColor = branding.brandColor;
                    if (!agent.logoUrl) agent.logoUrl = baseUrl + branding.logoPath;
                }
            }

            const visitorFirstName = (visit.buyers && visit.buyers.first_name)
                || (visit.buyer_name || '').trim().split(' ')[0] || '';

            const html = buildVisitReminderHtml({ kind, visitorFirstName, whenLabel, propertyAddress, mapUrl, agent });

            const domain = process.env.MAILGUN_DOMAIN || 'inbound.avecleon.fr';
            const fromName = agent.name && agent.agency
                ? `${agent.name}, ${agent.agency}`
                : agent.name || agent.agency || 'Léon';
            const subject = kind === 'confirmation'
                ? `Votre visite est confirmée : ${whenLabel}`
                : `Rappel : votre visite ${whenLabel}`;

            const result = await sendEmail({
                to: visitorEmail, subject, html,
                from: `${fromName} <noreply@${domain}>`,
                replyTo: agentEmail || undefined,
                // Agent en copie de la CONFIRMATION uniquement (pour vérifier l'envoi).
                // Les rappels -24h/-4h ne sont pas mis en copie pour ne pas saturer sa boîte.
                cc: (stage === 'confirmation' && agentEmail) ? agentEmail : undefined
            });

            if (result.success) {
                const stamp = new Date().toISOString();
                const patch = {};
                if (stage === 'confirmation') {
                    patch.confirmation_sent_at = stamp;
                    // Visite imminente (< ~4h) : la confirmation tient lieu de rappel 4h → on l'inhibe (anti-doublon).
                    if (msUntil <= H4 + LEAD_WINDOW_MS) patch.reminder_4h_sent_at = stamp;
                } else if (stage === '24h') {
                    patch.reminder_24h_sent_at = stamp;
                } else {
                    patch.reminder_4h_sent_at = stamp;
                }
                await supabaseAdmin.from('visits').update(patch).eq('id', visit.id);
                sent++;
                console.log(`[VisitReminder] ${stage} envoyé à ${visitorEmail} (visite ${visit.id})`);
            } else {
                skipped++;
                console.error(`[VisitReminder] Échec ${stage} visite ${visit.id}:`, result.error);
            }
        }

        return res.status(200).json({ ok: true, sent, skipped, candidates: (visits || []).length });
    } catch (err) {
        console.error('[VisitReminder] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

// ── Helpers fuseau Europe/Paris ──────────────────────────────────────────────

/** Heure murale Paris (date + heure saisies) → instant UTC (ms). Gère l'heure d'été/hiver. */
function parisWallTimeToInstant(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    if ([y, mo, d, h, mi].some(n => Number.isNaN(n))) return null;
    const guessUTC = Date.UTC(y, mo - 1, d, h, mi);
    return guessUTC - parisOffsetMs(new Date(guessUTC));
}

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

/** Date du jour (Paris) au format YYYY-MM-DD pour une instant donné. */
function parisDateStr(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
}

/** Libellé "quand" en clair : "aujourd'hui à 14h00", "demain à 14h00", sinon "mardi 18 juin à 14h00". */
function whenLabelFor(dateStr, timeStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    const time = `${h}h${String(mi).padStart(2, '0')}`;
    const todayStr = parisDateStr(new Date());
    const tomorrowStr = parisDateStr(new Date(Date.now() + 86400000));
    if (dateStr === todayStr) return `aujourd'hui à ${time}`;
    if (dateStr === tomorrowStr) return `demain à ${time}`;
    const long = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
    });
    return `${long} à ${time}`;
}
