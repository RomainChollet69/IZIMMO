/**
 * calendar.js
 * Edge Function CRUD Google Calendar.
 * Actions : list_events, find_slots, create_event, update_event, delete_event.
 * Gère le refresh automatique des tokens Google.
 * Dépendances : _auth.js (verifyAuth, withCORS, getSupabaseAdmin)
 */

import { verifyAuth, withCORS, getSupabaseAdmin } from './_auth.js';

// Jours de la semaine en français pour l'affichage
const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Europe/Paris';

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const { action, ...params } = req.body;

    if (!action) {
        return res.status(400).json({ error: 'Action requise' });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();

        // Récupérer l'intégration Calendar de l'utilisateur
        const { data: integration, error: intError } = await supabaseAdmin
            .from('user_integrations')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (intError || !integration || !integration.google_calendar_connected) {
            return res.status(400).json({ error: 'calendar_not_connected' });
        }

        // Renouveler le token si nécessaire
        const accessToken = await ensureValidToken(integration, supabaseAdmin);
        const calendarId = integration.google_calendar_id || 'primary';

        // Routage des actions
        switch (action) {
            case 'list_events':
                return await handleListEvents(res, accessToken, calendarId, params);

            case 'find_slots':
                return await handleFindSlots(res, accessToken, calendarId, params, integration);

            case 'create_event':
                return await handleCreateEvent(res, accessToken, calendarId, params);

            case 'update_event':
                return await handleUpdateEvent(res, accessToken, calendarId, params);

            case 'delete_event':
                return await handleDeleteEvent(res, accessToken, calendarId, params);

            default:
                return res.status(400).json({ error: `Action inconnue: ${action}` });
        }

    } catch (err) {
        if (err.message === 'token_refresh_failed') {
            return res.status(401).json({ error: 'token_refresh_failed', message: 'Reconnecte ton Calendar dans les paramètres' });
        }
        console.error('[Calendar] Erreur:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

// =================================================================
// Renouvellement automatique du token Google
// =================================================================

async function ensureValidToken(integration, supabaseAdmin) {
    const expiresAt = new Date(integration.google_token_expires_at);
    const now = new Date();
    const MARGIN_MS = 60 * 1000; // Renouveler 1 min avant expiration

    if (expiresAt.getTime() - MARGIN_MS > now.getTime()) {
        return integration.google_access_token;
    }

    console.log('[Calendar] Token expiré, renouvellement en cours...');

    if (!integration.google_refresh_token) {
        throw new Error('token_refresh_failed');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: integration.google_refresh_token,
            grant_type: 'refresh_token'
        })
    });

    const data = await response.json();

    if (!data.access_token) {
        console.error('[Calendar] Échec refresh token:', data);
        throw new Error('token_refresh_failed');
    }

    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabaseAdmin
        .from('user_integrations')
        .update({
            google_access_token: data.access_token,
            google_token_expires_at: newExpiresAt
        })
        .eq('user_id', integration.user_id);

    console.log('[Calendar] Token renouvelé avec succès');
    return data.access_token;
}

// =================================================================
// LIST_EVENTS — Lister les événements sur une période
// =================================================================

async function handleListEvents(res, accessToken, calendarId, params) {
    const { date_from, date_to } = params;

    if (!date_from || !date_to) {
        return res.status(400).json({ error: 'date_from et date_to requis' });
    }

    const events = await fetchGoogleEvents(accessToken, calendarId, date_from, date_to);
    return res.status(200).json({ events });
}

async function fetchGoogleEvents(accessToken, calendarId, dateFrom, dateTo) {
    const timeMin = `${dateFrom}T00:00:00+01:00`;
    const timeMax = `${dateTo}T23:59:59+01:00`;

    const queryParams = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        timeZone: TIMEZONE,
        maxResults: '100'
    });

    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
        const errBody = await response.text();
        console.error('[Calendar] Erreur Google API list_events:', response.status, errBody);
        throw new Error(`Google Calendar API error: ${response.status}`);
    }

    const data = await response.json();

    return (data.items || []).map(event => ({
        id: event.id,
        summary: event.summary || '(Sans titre)',
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location || null,
        description: event.description || null,
        htmlLink: event.htmlLink || null,
        all_day: !event.start?.dateTime
    }));
}

// =================================================================
// FIND_SLOTS — Trouver des créneaux libres
// =================================================================

async function handleFindSlots(res, accessToken, calendarId, params, integration) {
    const { date_from, date_to, slot_type, duration_minutes } = params;

    if (!date_from || !date_to) {
        return res.status(400).json({ error: 'date_from et date_to requis' });
    }

    const duration = duration_minutes || integration.default_meeting_duration || 60;
    const workingDays = integration.working_days || [1, 2, 3, 4, 5];

    // Préférences horaires (convertir TIME en heures/minutes)
    const workStart = parseTime(integration.work_start || '08:30');
    const workEnd = parseTime(integration.work_end || '19:00');
    const lunchStart = parseTime(integration.lunch_slot_start || '12:00');
    const lunchEnd = parseTime(integration.lunch_slot_end || '14:00');

    // Récupérer tous les événements de la période
    const events = await fetchGoogleEvents(accessToken, calendarId, date_from, date_to);

    // Construire un index événements par jour
    const eventsByDay = {};
    for (const event of events) {
        if (event.all_day) continue; // Les événements toute la journée bloquent tout le jour
        const dayKey = event.start.substring(0, 10);
        if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
        eventsByDay[dayKey].push({
            start: extractTimeMinutes(event.start),
            end: extractTimeMinutes(event.end)
        });
    }

    // Marquer les jours avec événements toute la journée
    const allDayBlocked = new Set();
    for (const event of events) {
        if (event.all_day) {
            allDayBlocked.add(event.start); // format YYYY-MM-DD
        }
    }

    const slots = [];
    const current = new Date(date_from + 'T00:00:00');
    const end = new Date(date_to + 'T23:59:59');

    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay(); // 0=dimanche
        const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convertir en ISO (1=lundi, 7=dimanche)

        // Vérifier jour travaillé
        if (workingDays.includes(isoDay) && !allDayBlocked.has(dateStr)) {
            // Déterminer la plage horaire selon slot_type
            let rangeStart, rangeEnd;
            switch (slot_type) {
                case 'morning':
                    rangeStart = workStart;
                    rangeEnd = lunchStart;
                    break;
                case 'lunch':
                    rangeStart = lunchStart;
                    rangeEnd = lunchEnd;
                    break;
                case 'afternoon':
                    rangeEnd = workEnd;
                    rangeStart = lunchEnd;
                    break;
                default: // 'any'
                    rangeStart = workStart;
                    rangeEnd = workEnd;
                    break;
            }

            // Trouver les créneaux libres dans cette plage
            const dayEvents = (eventsByDay[dateStr] || [])
                .filter(e => e.end > rangeStart && e.start < rangeEnd)
                .sort((a, b) => a.start - b.start);

            const freeSlots = findFreeSlots(rangeStart, rangeEnd, dayEvents, duration);

            for (const slot of freeSlots) {
                const dayDate = new Date(dateStr + 'T12:00:00');
                const jourNom = JOURS_FR[dayDate.getDay()];
                const jourNum = dayDate.getDate();
                const moisNom = MOIS_FR[dayDate.getMonth()];

                slots.push({
                    date: dateStr,
                    start: minutesToTime(slot.start),
                    end: minutesToTime(slot.end),
                    day_label: `${capitalize(jourNom)} ${jourNum} ${moisNom}`
                });
            }
        }

        current.setDate(current.getDate() + 1);
    }

    console.log(`[Calendar] find_slots: ${slots.length} créneaux trouvés (${date_from} → ${date_to}, type=${slot_type}, durée=${duration}min)`);
    return res.status(200).json({ slots, total_found: slots.length });
}

/**
 * Trouve les créneaux libres dans une plage horaire en soustrayant les événements.
 * @param {number} rangeStart - Début de la plage en minutes depuis minuit
 * @param {number} rangeEnd - Fin de la plage en minutes depuis minuit
 * @param {Array} events - Événements triés par start [{start, end}] en minutes
 * @param {number} minDuration - Durée minimum du créneau en minutes
 * @returns {Array} Créneaux libres [{start, end}]
 */
function findFreeSlots(rangeStart, rangeEnd, events, minDuration) {
    const slots = [];
    let cursor = rangeStart;

    for (const event of events) {
        if (event.start > cursor) {
            // Espace libre avant cet événement
            const gapEnd = Math.min(event.start, rangeEnd);
            if (gapEnd - cursor >= minDuration) {
                slots.push({ start: cursor, end: gapEnd });
            }
        }
        cursor = Math.max(cursor, event.end);
    }

    // Espace libre après le dernier événement
    if (rangeEnd - cursor >= minDuration) {
        slots.push({ start: cursor, end: rangeEnd });
    }

    return slots;
}

// =================================================================
// CREATE_EVENT — Créer un événement
// =================================================================

async function handleCreateEvent(res, accessToken, calendarId, params) {
    const { title, date, start_time, end_time, location, description } = params;

    if (!title || !date || !start_time || !end_time) {
        return res.status(400).json({ error: 'title, date, start_time et end_time requis' });
    }

    const eventBody = {
        summary: title,
        start: {
            dateTime: `${date}T${start_time}:00`,
            timeZone: TIMEZONE
        },
        end: {
            dateTime: `${date}T${end_time}:00`,
            timeZone: TIMEZONE
        }
    };

    if (location) eventBody.location = location;
    if (description) eventBody.description = description;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventBody),
            signal: controller.signal
        }
    );
    clearTimeout(timeout);

    if (!response.ok) {
        const errBody = await response.text();
        console.error('[Calendar] Erreur create_event:', response.status, errBody);
        return res.status(502).json({ error: 'Échec création événement' });
    }

    const event = await response.json();
    console.log('[Calendar] Événement créé:', event.id, title);

    return res.status(200).json({
        event: {
            id: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            htmlLink: event.htmlLink
        }
    });
}

// =================================================================
// UPDATE_EVENT — Modifier un événement existant
// =================================================================

async function handleUpdateEvent(res, accessToken, calendarId, params) {
    const { event_id, title, date, start_time, end_time, location, description } = params;

    if (!event_id) {
        return res.status(400).json({ error: 'event_id requis' });
    }

    const patchBody = {};
    if (title) patchBody.summary = title;
    if (location !== undefined) patchBody.location = location;
    if (description !== undefined) patchBody.description = description;

    if (date && start_time && end_time) {
        patchBody.start = { dateTime: `${date}T${start_time}:00`, timeZone: TIMEZONE };
        patchBody.end = { dateTime: `${date}T${end_time}:00`, timeZone: TIMEZONE };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event_id)}`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patchBody),
            signal: controller.signal
        }
    );
    clearTimeout(timeout);

    if (!response.ok) {
        const errBody = await response.text();
        console.error('[Calendar] Erreur update_event:', response.status, errBody);
        return res.status(502).json({ error: 'Échec modification événement' });
    }

    const event = await response.json();
    console.log('[Calendar] Événement modifié:', event.id);

    return res.status(200).json({
        event: {
            id: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            htmlLink: event.htmlLink
        }
    });
}

// =================================================================
// DELETE_EVENT — Supprimer un événement
// =================================================================

async function handleDeleteEvent(res, accessToken, calendarId, params) {
    const { event_id } = params;

    if (!event_id) {
        return res.status(400).json({ error: 'event_id requis' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event_id)}`,
        {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal
        }
    );
    clearTimeout(timeout);

    if (!response.ok && response.status !== 410) {
        const errBody = await response.text();
        console.error('[Calendar] Erreur delete_event:', response.status, errBody);
        return res.status(502).json({ error: 'Échec suppression événement' });
    }

    console.log('[Calendar] Événement supprimé:', event_id);
    return res.status(200).json({ deleted: true, event_id });
}

// =================================================================
// Utilitaires
// =================================================================

/** Parse "HH:MM" en minutes depuis minuit */
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const str = typeof timeStr === 'string' ? timeStr : String(timeStr);
    const [h, m] = str.split(':').map(Number);
    return h * 60 + (m || 0);
}

/** Extrait les minutes depuis minuit d'un datetime ISO */
function extractTimeMinutes(isoStr) {
    if (!isoStr) return 0;
    const timePart = isoStr.includes('T') ? isoStr.split('T')[1] : isoStr;
    const [h, m] = timePart.split(':').map(Number);
    return h * 60 + (m || 0);
}

/** Convertit des minutes depuis minuit en "HH:MM" */
function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Capitalize la première lettre */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
