/**
 * assistant.js
 * Endpoint unifié de l'assistant organisationnel Léon.
 * Actions : orchestrate, draft_message, list_events, find_slots, create_event, update_event, delete_event.
 * Fusionne orchestrateur IA, génération de messages et CRUD Calendar.
 * Dépendances : _auth.js (verifyAuth, withCORS, getSupabaseAdmin)
 */

import { verifyAuth, withCORS, getSupabaseAdmin } from './_auth.js';

// =================================================================
// Constantes Calendar
// =================================================================

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Europe/Paris';

// =================================================================
// Handler principal — routage par action
// =================================================================

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
        switch (action) {
            // --- Actions IA ---
            case 'orchestrate':
                return await handleOrchestrate(req, res, user, params);
            case 'draft_message':
                return await handleDraftMessage(req, res, params);

            // --- Actions Calendar ---
            case 'list_events':
            case 'find_slots':
            case 'create_event':
            case 'update_event':
            case 'delete_event':
                return await handleCalendarAction(res, user, action, params);

            default:
                return res.status(400).json({ error: `Action inconnue: ${action}` });
        }
    } catch (err) {
        if (err.message === 'token_refresh_failed') {
            return res.status(401).json({ error: 'token_refresh_failed', message: 'Reconnecte ton Calendar dans les paramètres' });
        }
        console.error('[Assistant] Erreur:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

// =================================================================
// ORCHESTRATE — Compréhension d'intention (NLU multi-turn)
// =================================================================

async function handleOrchestrate(req, res, user, params) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { input, context, conversation_history } = req.body;

    if (!input) {
        return res.status(400).json({ error: 'input requis' });
    }

    const { today, user_name, contacts_json } = context || {};

    const systemPrompt = buildOrchestratorPrompt(
        today || new Date().toISOString().split('T')[0],
        user_name || 'Agent',
        contacts_json || '[]'
    );

    // Construire les messages avec historique de conversation
    const messages = [];
    if (conversation_history && Array.isArray(conversation_history)) {
        for (const msg of conversation_history.slice(-10)) {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: String(msg.content)
            });
        }
    }
    messages.push({ role: 'user', content: input });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: systemPrompt,
                messages
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[Assistant:orchestrate] Erreur API Anthropic:', response.status, errBody);
            return res.status(502).json({ error: 'AI generation failed' });
        }

        const data = await response.json();
        const text = data.content[0].text;

        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
            const parsed = JSON.parse(cleaned);
            console.log(`[Assistant:orchestrate] Intent: ${parsed.intent}, confidence: ${parsed.confidence}`);
            return res.status(200).json(parsed);
        } catch (parseErr) {
            console.error('[Assistant:orchestrate] JSON parse error:', parseErr.message, 'Raw:', text);
            return res.status(200).json({
                intent: 'unknown',
                confidence: 0,
                params: {},
                leon_response: text.length > 200 ? text.substring(0, 200) : text
            });
        }

    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Timeout — Léon a mis trop de temps à réfléchir' });
        }
        throw err;
    }
}

// =================================================================
// DRAFT_MESSAGE — Génération de message contextuel
// =================================================================

async function handleDraftMessage(req, res, params) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { who, who_role, context, tone, channel, slots, user_name } = req.body;

    if (!who || !channel) {
        return res.status(400).json({ error: 'who et channel requis' });
    }

    const slotsFormatted = slots && slots.length > 0
        ? slots.map(s => `${s.day_label} de ${s.start} à ${s.end}`).join(', ')
        : 'Aucun créneau spécifique fourni';

    const systemPrompt = `Tu es Léon, l'assistant d'un conseiller immobilier. Tu rédiges un message pour ${user_name || 'l\'agent'} à envoyer à un contact.

DESTINATAIRE : ${who} (${who_role || 'contact'})
CONTEXTE : ${context || 'prise de contact'}
CANAL : ${channel}
TON : ${tone || 'professionnel'}
CRÉNEAUX DISPONIBLES : ${slotsFormatted}

Rédige UN message prêt à copier-coller adapté au canal :

- WhatsApp : conversationnel, tutoiement si amical, 3-5 lignes max, emojis ok (1-2 max)
- SMS : très court (2-3 lignes max), direct, pas d'emojis
- Email : structuré, formule de politesse, inclure un objet (champ "subject")

RETOURNE un JSON :
{
  "message": "le texte du message prêt à copier-coller",
  "subject": "objet de l'email (null si pas email)",
  "channel": "${channel}"
}

RÈGLES ABSOLUES :
- Le message doit paraître 100% naturel, comme écrit par un humain
- Adapter vouvoiement/tutoiement au ton (amical = tu, formel = vous)
- Inclure les créneaux de manière NATURELLE dans le texte, pas en liste
- Ne JAMAIS mentionner "Léon", "IA", "assistant", "automatique" dans le message
- Signer avec le prénom de l'agent : "${user_name || ''}"
- Si pas de créneaux fournis, rédiger le message sans mentionner de dates`;

    const userMessage = `Rédige le message pour ${who} (${who_role || 'contact'}) concernant : ${context || 'prise de contact'}. Canal : ${channel}. Ton : ${tone || 'professionnel'}.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[Assistant:draft_message] Erreur API:', response.status, errBody);
            return res.status(502).json({ error: 'AI generation failed' });
        }

        const data = await response.json();
        const text = data.content[0].text;

        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
            const parsed = JSON.parse(cleaned);
            console.log(`[Assistant:draft_message] Message généré pour ${who} via ${channel}`);
            return res.status(200).json(parsed);
        } catch (parseErr) {
            console.error('[Assistant:draft_message] JSON parse error:', parseErr.message);
            return res.status(200).json({ message: text, subject: null, channel });
        }

    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Timeout' });
        }
        throw err;
    }
}

// =================================================================
// CALENDAR — Actions Google Calendar (list, find_slots, create, update, delete)
// =================================================================

async function handleCalendarAction(res, user, action, params) {
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
    }
}

// =================================================================
// Token refresh
// =================================================================

async function ensureValidToken(integration, supabaseAdmin) {
    const expiresAt = new Date(integration.google_token_expires_at);
    const now = new Date();
    const MARGIN_MS = 60 * 1000;

    if (expiresAt.getTime() - MARGIN_MS > now.getTime()) {
        return integration.google_access_token;
    }

    console.log('[Assistant:calendar] Token expiré, renouvellement...');

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
        console.error('[Assistant:calendar] Échec refresh token:', data);
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

    console.log('[Assistant:calendar] Token renouvelé');
    return data.access_token;
}

// =================================================================
// LIST_EVENTS
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
        console.error('[Assistant:calendar] Erreur Google API:', response.status, errBody);
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
// FIND_SLOTS
// =================================================================

async function handleFindSlots(res, accessToken, calendarId, params, integration) {
    const { date_from, date_to, slot_type, duration_minutes } = params;

    if (!date_from || !date_to) {
        return res.status(400).json({ error: 'date_from et date_to requis' });
    }

    const duration = duration_minutes || integration.default_meeting_duration || 60;
    const workingDays = integration.working_days || [1, 2, 3, 4, 5];

    const workStart = parseTime(integration.work_start || '08:30');
    const workEnd = parseTime(integration.work_end || '19:00');
    const lunchStart = parseTime(integration.lunch_slot_start || '12:00');
    const lunchEnd = parseTime(integration.lunch_slot_end || '14:00');

    const events = await fetchGoogleEvents(accessToken, calendarId, date_from, date_to);

    // Index événements par jour
    const eventsByDay = {};
    for (const event of events) {
        if (event.all_day) continue;
        const dayKey = event.start.substring(0, 10);
        if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
        eventsByDay[dayKey].push({
            start: extractTimeMinutes(event.start),
            end: extractTimeMinutes(event.end)
        });
    }

    // Jours bloqués (événements toute la journée)
    const allDayBlocked = new Set();
    for (const event of events) {
        if (event.all_day) allDayBlocked.add(event.start);
    }

    const slots = [];
    const current = new Date(date_from + 'T00:00:00');
    const end = new Date(date_to + 'T23:59:59');

    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();
        const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

        if (workingDays.includes(isoDay) && !allDayBlocked.has(dateStr)) {
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
                    rangeStart = lunchEnd;
                    rangeEnd = workEnd;
                    break;
                default:
                    rangeStart = workStart;
                    rangeEnd = workEnd;
                    break;
            }

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

    console.log(`[Assistant:calendar] find_slots: ${slots.length} créneaux (${date_from}→${date_to}, type=${slot_type}, durée=${duration}min)`);
    return res.status(200).json({ slots, total_found: slots.length });
}

function findFreeSlots(rangeStart, rangeEnd, events, minDuration) {
    const slots = [];
    let cursor = rangeStart;

    for (const event of events) {
        if (event.start > cursor) {
            const gapEnd = Math.min(event.start, rangeEnd);
            if (gapEnd - cursor >= minDuration) {
                slots.push({ start: cursor, end: gapEnd });
            }
        }
        cursor = Math.max(cursor, event.end);
    }

    if (rangeEnd - cursor >= minDuration) {
        slots.push({ start: cursor, end: rangeEnd });
    }

    return slots;
}

// =================================================================
// CREATE_EVENT
// =================================================================

async function handleCreateEvent(res, accessToken, calendarId, params) {
    const { title, date, start_time, end_time, location, description } = params;

    if (!title || !date || !start_time || !end_time) {
        return res.status(400).json({ error: 'title, date, start_time et end_time requis' });
    }

    const eventBody = {
        summary: title,
        start: { dateTime: `${date}T${start_time}:00`, timeZone: TIMEZONE },
        end: { dateTime: `${date}T${end_time}:00`, timeZone: TIMEZONE }
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
        console.error('[Assistant:calendar] Erreur create_event:', response.status, errBody);
        return res.status(502).json({ error: 'Échec création événement' });
    }

    const event = await response.json();
    console.log('[Assistant:calendar] Événement créé:', event.id, title);

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
// UPDATE_EVENT
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
        console.error('[Assistant:calendar] Erreur update_event:', response.status, errBody);
        return res.status(502).json({ error: 'Échec modification événement' });
    }

    const event = await response.json();
    console.log('[Assistant:calendar] Événement modifié:', event.id);

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
// DELETE_EVENT
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
        console.error('[Assistant:calendar] Erreur delete_event:', response.status, errBody);
        return res.status(502).json({ error: 'Échec suppression événement' });
    }

    console.log('[Assistant:calendar] Événement supprimé:', event_id);
    return res.status(200).json({ deleted: true, event_id });
}

// =================================================================
// Utilitaires
// =================================================================

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const str = typeof timeStr === 'string' ? timeStr : String(timeStr);
    const [h, m] = str.split(':').map(Number);
    return h * 60 + (m || 0);
}

function extractTimeMinutes(isoStr) {
    if (!isoStr) return 0;
    const timePart = isoStr.includes('T') ? isoStr.split('T')[1] : isoStr;
    const [h, m] = timePart.split(':').map(Number);
    return h * 60 + (m || 0);
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// =================================================================
// Prompt orchestrateur
// =================================================================

function buildOrchestratorPrompt(today, userName, contactsJson) {
    return `Tu es Léon, l'assistant organisationnel d'un conseiller immobilier indépendant français.

Tu reçois une demande en langage naturel (transcrite depuis un message vocal ou tapée au clavier).
Tu dois comprendre l'intention et retourner un JSON structuré.

DATE DU JOUR : ${today}
NOM DE L'AGENT : ${userName}

INTENTIONS POSSIBLES :

1. "find_slots" — Trouver des créneaux disponibles dans l'agenda
2. "create_event" — Créer un événement dans l'agenda (TOUJOURS retourner avec needs_confirmation: true)
3. "update_event" — Modifier un événement existant (décaler, changer l'heure)
4. "delete_event" — Supprimer/annuler un événement
5. "list_events" — Lister les événements à venir ("qu'est-ce que j'ai demain ?")
6. "draft_message" — Rédiger un message pour quelqu'un (sans lien avec l'agenda)
7. "find_slots_and_draft" — Trouver des créneaux ET rédiger un message proposant ces créneaux
8. "confirm_action" — L'agent confirme une action proposée ("oui", "ok", "c'est bon")
9. "unknown" — Intention non reconnue, demander une précision

RÈGLE DE CONFIRMATION :
- Pour create_event, update_event, delete_event : TOUJOURS ajouter "needs_confirmation": true dans params
- L'action ne sera exécutée qu'après confirmation explicite de l'agent

RÈGLE DE DÉSAMBIGUÏSATION :
- Si update_event ou delete_event et que la demande est ambiguë (ex: "mon RDV de jeudi" mais potentiellement plusieurs RDV)
- Ajouter "needs_disambiguation": true et "disambiguation_query": { "date_from": "...", "date_to": "..." } dans params

RETOURNE UNIQUEMENT un objet JSON valide (pas de texte autour, pas de markdown) :

{
  "intent": "find_slots_and_draft",
  "confidence": 0.95,
  "params": {
    "who": "Mathieu",
    "who_role": "courtier",
    "who_relationship": "professionnel_amical",
    "context": "répondre à Mathieu qui a demandé mes disponibilités pour un déjeuner",
    "slot_type": "lunch",
    "duration_minutes": 90,
    "date_range": {
      "from": "${today}",
      "to": "date calculée"
    },
    "message_channel": "whatsapp",
    "message_tone": "amical_pro",
    "needs_confirmation": false
  },
  "leon_response": "Je cherche tes créneaux déjeuner sur les 2 prochaines semaines et je te prépare une réponse WhatsApp pour Mathieu !"
}

RÈGLE CONTEXT (CRITIQUE) :
- Le champ "context" doit capturer la SITUATION COMPLÈTE, pas juste le type de RDV
- Mauvais : "context": "déjeuner"
- Bon : "context": "répondre à mon courtier qui me demande mes dispos pour déjeuner"
- Bon : "context": "proposer un déjeuner de networking à mon notaire"
- Le context est transmis tel quel au rédacteur de message — il doit contenir assez d'info pour que le message soit pertinent
- Capturer l'initiative : qui a initié ? (l'agent propose OU l'agent répond à une demande)
- Capturer l'objet : pourquoi ce RDV ? (déjeuner, visite, signature, point dossier...)

Pour list_events, le format de params est :
{
  "date_range": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "label": "demain" ou "cette semaine" ou "lundi"
}

Pour create_event :
{
  "title": "titre de l'événement",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "location": null,
  "description": null,
  "needs_confirmation": true
}

Pour update_event / delete_event avec ambiguïté :
{
  "needs_disambiguation": true,
  "disambiguation_query": { "date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD" },
  "original_request": "description de ce que l'agent veut faire"
}

RÈGLES D'EXTRACTION :

Dates :
- Convertir les dates relatives en dates absolues à partir de ${today}
- "demain" → today + 1 jour
- "la semaine prochaine" → lundi prochain → vendredi prochain
- "dans 2 semaines" → today → today + 14 jours
- "jeudi" → le prochain jeudi à partir de today
- "ce mois" → du today au dernier jour du mois

Créneaux (slot_type) :
- "déjeuner", "midi" → "lunch"
- "matin", "matinée" → "morning"
- "après-midi", "aprèm" → "afternoon"
- Pas de contexte horaire → "any"

Durées (duration_minutes) :
- Par défaut : 60
- "déjeuner" : 90
- "appel", "call", "coup de fil" : 30
- "visite", "estimation", "rendez-vous terrain" : 120
- Si l'agent précise une durée ("2 heures") : respecter

Relations (who_relationship) :
- "courtier", "notaire", "partenaire" → "professionnel_amical"
- "client", "vendeur", "acquéreur" → "client"
- "prospect", "lead" → "prospect"
- "ami", "famille" → "personnel"
- Par défaut si ambiguïté → "professionnel_formel"

Canal message (message_channel) :
- Si l'agent mentionne "SMS" → "sms"
- Si "email", "mail" → "email"
- Par défaut → "whatsapp"

Ton message (message_tone) :
- Déduire de who_relationship : amical → "amical_pro", formel → "formel", client → "pro_chaleureux"

RÈGLE ANTI-CLARIFICATION (CRITIQUE) :
- Ne demande JAMAIS le nom exact d'un contact si l'agent utilise un possessif ("mon courtier", "ma notaire", "mon client M. Dupont")
- Utilise directement le rôle comme destinataire : who = "ton courtier", who_role = "courtier"
- L'agent sait à qui il envoie le message, ton rôle est de le rédiger, pas de questionner
- Utilise "unknown" UNIQUEMENT si l'intention elle-même est incompréhensible, JAMAIS pour demander un nom

RÈGLE FIND_SLOTS_AND_DRAFT (IMPORTANT) :
- Si l'agent demande à la fois des créneaux ET un message, retourne TOUJOURS "find_slots_and_draft" (pas "find_slots")
- Détecte les formulations : "donne-moi mes créneaux et fais un message", "trouve un créneau et envoie-lui", "mes dispos + un WhatsApp"

leon_response :
- Toujours en français
- Tutoiement
- Style Léon : bienveillant, direct, encourageant
- Jamais plus de 2 phrases
- Si intent = "unknown" : demander poliment de reformuler
- Ne pose JAMAIS de question dans leon_response sauf si intent = "unknown"

HISTORIQUE DE CONVERSATION RÉCENT (pour le contexte multi-turn) :
→ Les messages précédents sont dans l'historique de la conversation.
→ Utilise-les pour comprendre les références ("le deuxième", "oui", "plutôt par SMS")
→ Si l'historique contient des créneaux proposés et que l'agent dit "prends le deuxième", retourne un create_event avec les infos du 2e créneau

CONTACTS CRM DE L'AGENT (pour matcher les noms — limité aux 50 plus récents, format: prénom nom, téléphone) :
${contactsJson}`;
}
