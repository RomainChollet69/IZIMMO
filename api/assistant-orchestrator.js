/**
 * assistant-orchestrator.js
 * Comprend l'intention de l'agent en langage naturel et retourne un JSON structuré.
 * Supporte le multi-turn via conversation_history.
 * Modèle : Claude Haiku 4.5.
 * Dépendances : _auth.js (verifyAuth, withCORS)
 */

import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { input, context, conversation_history } = req.body;

    if (!input) {
        return res.status(400).json({ error: 'input requis' });
    }

    const { today, user_name, contacts_json } = context || {};

    const systemPrompt = buildSystemPrompt(today || new Date().toISOString().split('T')[0], user_name || 'Agent', contacts_json || '[]');

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

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

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
            console.error('[AssistantOrchestrator] Erreur API Anthropic:', response.status, errBody);
            return res.status(502).json({ error: 'AI generation failed' });
        }

        const data = await response.json();
        const text = data.content[0].text;

        // Extraire le JSON de la réponse (peut être entouré de markdown)
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
            const parsed = JSON.parse(cleaned);
            console.log(`[AssistantOrchestrator] Intent: ${parsed.intent}, confidence: ${parsed.confidence}`);
            return res.status(200).json(parsed);
        } catch (parseErr) {
            console.error('[AssistantOrchestrator] JSON parse error:', parseErr.message, 'Raw:', text);
            // Fallback : retourner un intent unknown avec la réponse brute
            return res.status(200).json({
                intent: 'unknown',
                confidence: 0,
                params: {},
                leon_response: text.length > 200 ? text.substring(0, 200) : text
            });
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Timeout — Léon a mis trop de temps à réfléchir' });
        }
        console.error('[AssistantOrchestrator] Erreur:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

function buildSystemPrompt(today, userName, contactsJson) {
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
    "context": "déjeuner",
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
  "leon_response": "Je cherche un créneau déjeuner pour toi avec Mathieu sur les 2 prochaines semaines. Je te prépare aussi un message !"
}

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

leon_response :
- Toujours en français
- Tutoiement
- Style Léon : bienveillant, direct, encourageant
- Jamais plus de 2 phrases
- Si intent = "unknown" : demander poliment de reformuler

HISTORIQUE DE CONVERSATION RÉCENT (pour le contexte multi-turn) :
→ Les messages précédents sont dans l'historique de la conversation.
→ Utilise-les pour comprendre les références ("le deuxième", "oui", "plutôt par SMS")
→ Si l'historique contient des créneaux proposés et que l'agent dit "prends le deuxième", retourne un create_event avec les infos du 2e créneau

CONTACTS CRM DE L'AGENT (pour matcher les noms — limité aux 50 plus récents, format: prénom nom, téléphone) :
${contactsJson}`;
}
