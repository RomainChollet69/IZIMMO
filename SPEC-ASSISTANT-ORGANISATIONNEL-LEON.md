# Spécification — Léon Assistant Organisationnel
## Gestion d'agenda, planning et communication automatisée

> Version 2.1 — 24 février 2026 (corrections pré-implémentation)
> Fonctionnalité : Assistant organisationnel IA avec intégration Google Calendar
> Page dédiée `assistant.html` — séparée de `micro.html`
> Prompt à fournir à Claude Code pour implémentation

---

## 1. Contexte et objectif

Tu travailles sur **Léon**, un CRM spécialisé pour les conseillers immobiliers indépendants en France.

**Site** : https://avecleon.fr
**Repo GitHub** : `github.com/RomainChollet69/IZIMMO` (nom historique du dossier)
**Stack** : HTML/CSS/JS vanilla (pas de framework), Supabase (PostgreSQL, Auth, RLS), Vercel (Serverless Functions), Claude Haiku (IA), Whisper (transcription audio).
**Auth** : Google OAuth uniquement via Supabase Auth (pas d'email/mot de passe — cf. DECISIONS.md D003).
**Déploiement** : auto-deploy depuis GitHub `main` vers Vercel.

### Ce qu'on veut construire

Une **nouvelle page `assistant.html`** — un assistant organisationnel vocal et textuel qui permet au conseiller immobilier de gérer son agenda et sa communication en langage naturel :

- *"Trouve-moi un créneau pour déjeuner avec Mathieu, mon courtier, dans les 2 prochaines semaines et envoie-lui un message avec mes dispos"*
- *"Bloque-moi 2 heures demain matin pour de la prospection"*
- *"Décale mon rendez-vous de jeudi avec Mme Dupont à vendredi même heure"*
- *"Qu'est-ce que j'ai demain ?"*

Léon comprend la demande, interroge Google Calendar, propose des créneaux, rédige des messages, et exécute les actions après validation de l'agent.

### Pourquoi une page séparée (et pas dans micro.html)

`micro.html` est le mode terrain — l'agent sort d'un RDV, il dicte vite une note CRM en marchant. C'est une feature stable (1667 lignes) qu'on ne veut pas toucher.

`assistant.html` est le mode bureau — l'agent est posé, il organise sa semaine, il prépare des messages, il consulte son planning. Les cas d'usage sont fondamentalement différents.

**Liens croisés** : un bouton 📅 sur micro.html renvoie vers assistant.html, et un bouton 🎤 sur assistant.html renvoie vers micro.html. Navigation fluide entre les deux.

### Pourquoi c'est stratégique

Aucun CRM immobilier concurrent ne propose ça. Léon passe de "CRM qui stocke" à "assistant qui agit". Ça colle parfaitement avec le tagline "Ton CRM qui ne dort jamais" et le positionnement de Léon comme directeur commercial bienveillant (cf. SPEC-WORKFLOWS-LEON.md).

---

## 2. Architecture existante — LIRE ATTENTIVEMENT

### Conventions du projet (CLAUDE.md)

Le projet a un fichier `CLAUDE.md` à la racine qui impose des règles strictes :
- **Plan mode par défaut** pour toute tâche non triviale (3+ étapes)
- **Documentation obligatoire** : mettre à jour `docs/ARCHITECTURE.md`, `docs/API-MAP.md`, `docs/CHANGELOG.md` après chaque changement structurel
- **Push GitHub** à la fin de chaque action (Vercel déploie automatiquement)
- **Logging structuré** par module : `[Calendar]`, `[Assistant]`, etc.
- **Leçons** : enregistrer toute correction dans `tasks/lessons.md`

### Arborescence actuelle du projet

```
IZIMMO/
├── CLAUDE.md                   # Règles de comportement Claude Code
├── index.html                  # Pipeline Vendeurs — Kanban 6 colonnes
├── acquereurs.html             # Pipeline Acquéreurs — Kanban 4 colonnes
├── formulaire.html             # Formulaire public acquéreur (sans auth)
├── login.html                  # Page de connexion Google OAuth
├── landing.html                # Page marketing / vitrine
├── social.html                 # Moteur de contenu réseaux sociaux
├── parametres.html             # Page de paramètres utilisateur
├── micro.html                  # Mode micro mobile — notes CRM vocales (NE PAS MODIFIER sauf lien croisé)
├── dvf.html                    # Visualiseur données DVF + DPE
│
├── js/
│   ├── supabase-config.js      # Client Supabase + utilitaires partagés (getAuthHeaders(), etc.)
│   ├── auth.js                 # Guard d'authentification + profil header
│   ├── workflows.js            # Définitions workflows + gestion des étapes
│   ├── relance-widget.js       # Widget flottant des relances (cloche)
│   ├── todo-widget.js          # Widget to-do avec dictée vocale
│   ├── audio-recorder.js       # Enregistrement micro + détection silence + transcription Whisper
│   ├── onboarding.js           # Tour guidé première utilisation
│   ├── social.js               # Logique calendrier social + IA
│   └── maps-config.js          # Clé API Google Maps
│
├── api/                        # Vercel Serverless Functions (Node.js)
│   ├── _auth.js                # Helper auth partagé (verifyAuth + withCORS)
│   ├── transcribe.js           # Transcription audio → texte (OpenAI Whisper)
│   ├── parse-lead.js           # Dictée vocale → nouveau lead structuré (Claude)
│   ├── parse-voice-note.js     # Dictée vocale → note sur lead existant (Claude)
│   ├── parse-workflow-response.js # Réponse vocale aux étapes workflow (Claude)
│   ├── generate-message.js     # Génération SMS/WhatsApp/Email contextuel (Claude)
│   ├── generate-social-post.js # Génération contenu réseaux sociaux (Claude)
│   ├── parse-import-batch.js   # Import Excel/CSV par batch (Claude)
│   ├── map-columns.js          # Mapping colonnes Excel → champs CRM (Claude)
│   ├── analyze-document.js     # Analyse PDF/images (Claude)
│   └── scrape-listing.js       # Scraping annonces immobilières (Claude)
│
├── sql/
│   └── 001_workflow_steps.sql  # Migration table workflow_steps
│
├── docs/                       # Documentation vivante ← À METTRE À JOUR
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── CHANGELOG.md
│   └── API-MAP.md
│
└── tasks/                      # Gestion des tâches ← À METTRE À JOUR
    ├── todo.md
    └── lessons.md
```

### Pattern d'une Edge Function (REPRODUIRE CE PATTERN)

Toutes les Edge Functions suivent le même modèle. **Modèle IA : `claude-haiku-4-5-20251001`**.

```javascript
import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
  withCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  const { /* params */ } = req.body;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: 'Parsing failed', raw: text });
  }
}
```

### Variables d'environnement Vercel

**Déjà configurées :**

| Variable | Usage |
|----------|-------|
| `OPENAI_API_KEY` | Transcription Whisper |
| `ANTHROPIC_API_KEY` | Génération IA (Claude) |

Les clés Supabase (URL + anon key) sont hardcodées dans `js/supabase-config.js` côté client — standard protégé par RLS (cf. D007).

**À AJOUTER dans Vercel :**

| Variable | Usage |
|----------|-------|
| `GOOGLE_CLIENT_ID` | Client ID OAuth Google (le même que Supabase Auth) |
| `GOOGLE_CLIENT_SECRET` | Client secret OAuth Google |
| `GOOGLE_REDIRECT_URI` | `https://avecleon.fr/api/google-auth-callback` |
| `SUPABASE_URL` | URL du projet Supabase (côté serveur) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role (écriture serveur dans `user_integrations` — JAMAIS côté client) |

### Authentification existante

- **Google OAuth uniquement** via Supabase Auth (D003)
- Token via `getAuthHeaders()` dans `js/supabase-config.js`
- Edge Functions : vérification via `_auth.js` → `verifyAuth(req)`
- RLS sur toutes les tables (`auth.uid() = user_id`)
- Le client OAuth Google Cloud Console existe déjà → on y **ajoute les scopes Calendar**

### Tables Supabase existantes pertinentes

- `sellers` — leads vendeurs (id, user_id, first_name, last_name, phone, email, address, status...)
- `buyers` — leads acquéreurs (idem)
- `contacts` — carnet de contacts (id, user_id, name, phone, email)
- `lead_notes` — notes horodatées (seller_id OU buyer_id)
- `todos` — todo list
- `workflow_steps` — étapes de workflows automatisés

### Charte graphique actuelle

| Élément | Valeur |
|---------|--------|
| Gradient principal | `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` |
| Typo titres | Barlow Semi Condensed, 800, uppercase, letter-spacing 0.5px |
| Typo corps | Inter, 400-700 |
| Texte foncé | `#2C3E50` |
| Texte gris | `#7F8C8D` |
| Fond clair | `#f8f9fa` |
| Bordures | `#E1E8ED` |
| Alerte rouge | `#FF4757` |
| Succès vert | `#66BB6A` |
| Border-radius | 8-20px (cartes: 12px, boutons: 10px) |
| Ombres | `0 4px 12px rgba(0,0,0,0.15)` |
| Breakpoint mobile | 768px |
| Icônes | Font Awesome 6.5.1 |

### Scripts JS chargés par page (pour comprendre le pattern)

| Page | Scripts |
|------|---------|
| `index.html` | supabase-config, auth, workflows, audio-recorder, relance-widget, todo-widget, onboarding |
| `acquereurs.html` | supabase-config, auth, workflows, audio-recorder, relance-widget, todo-widget |
| `social.html` | supabase-config, auth, social, audio-recorder |
| `micro.html` | supabase-config, auth, audio-recorder |
| `parametres.html` | supabase-config, auth |

→ `assistant.html` chargera : `supabase-config.js`, `auth.js`, `audio-recorder.js`

---

## 3. Ce qu'il faut implémenter

### 3.1 Étape 1 — Intégration Google Calendar

#### 3.1.1 Configuration Google Cloud Console

L'auth Google OAuth est déjà configurée pour Supabase Auth. Il faut :

1. **Ajouter les scopes Calendar** au client OAuth existant :
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`

2. **S'assurer que `access_type=offline`** lors du consentement (pour obtenir le refresh_token)

3. **Ajouter l'URI de redirection** `https://avecleon.fr/api/google-auth-callback`

#### 3.1.2 Nouvelle table Supabase : `user_integrations`

```sql
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,

  -- Google Calendar
  google_calendar_connected BOOLEAN DEFAULT false,
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expires_at TIMESTAMPTZ,
  google_calendar_id TEXT DEFAULT 'primary',

  -- Préférences organisationnelles
  default_meeting_duration INT DEFAULT 60,
  lunch_slot_start TIME DEFAULT '12:00',
  lunch_slot_end TIME DEFAULT '14:00',
  work_start TIME DEFAULT '08:30',
  work_end TIME DEFAULT '19:00',
  working_days INT[] DEFAULT ARRAY[1,2,3,4,5], -- ISO: 1=lundi, 7=dimanche

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own integrations" ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

-- Fonction update_updated_at si elle n'existe pas déjà
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Table temporaire pour stocker les nonces OAuth (CSRF protection)
CREATE TABLE oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  nonce TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own oauth states" ON oauth_states
  FOR ALL USING (auth.uid() = user_id);

-- Nettoyage auto des nonces expirés (>15 min)
-- À appeler périodiquement ou via pg_cron si disponible
```

**Fichier** : `sql/002_user_integrations.sql`

#### 3.1.3 UI dans `parametres.html`

Ajouter une section Google Calendar :

```
┌──────────────────────────────────────────────┐
│  📅 Google Calendar                          │
│                                              │
│  Connecte ton agenda pour que Léon puisse    │
│  consulter tes disponibilités et créer des   │
│  événements pour toi.                        │
│                                              │
│  [🔗 Connecter Google Calendar]              │
│                                              │
│  --- OU si déjà connecté ---                 │
│                                              │
│  ✅ Connecté (romain@gmail.com)              │
│  [Déconnecter]                               │
│                                              │
│  ── Préférences horaires ──                  │
│  Horaires de travail : [08:30] - [19:00]     │
│  Pause déjeuner : [12:00] - [14:00]          │
│  Jours travaillés : ☑L ☑Ma ☑Me ☑J ☑V ☐S ☐D │
│  Durée RDV par défaut : [60] min             │
└──────────────────────────────────────────────┘
```

Les préférences sont sauvegardées dans `user_integrations` via upsert Supabase côté client.

**Flux OAuth (sécurisé avec nonce CSRF) :**
1. Clic "Connecter" → appel `/api/google-auth-init` (POST, auth Bearer) → génère un nonce aléatoire, le stocke dans `oauth_states` avec le `user_id`, retourne l'URL Google OAuth complète avec `state={nonce}` + scopes Calendar + `access_type=offline` + `prompt=consent`
2. Redirection vers Google OAuth → l'utilisateur consent
3. Google renvoie un code vers `/api/google-auth-callback?code=xxx&state={nonce}`
4. L'Edge Function vérifie le nonce dans `oauth_states` → retrouve le `user_id`, supprime le nonce (usage unique)
5. Échange le code → tokens Google, upsert dans `user_integrations`
6. Redirection vers `parametres.html?calendar=connected`

**Pourquoi un nonce** : le paramètre `state` OAuth est visible dans l'URL, les logs et l'historique navigateur. Y mettre un access token serait une fuite de credentials. Le nonce sert de protection CSRF et de lien vers le user_id côté serveur.

#### 3.1.4 Edge Function : `api/google-auth-init.js`

```javascript
// POST /api/google-auth-init
// Auth: Bearer token (pattern standard)
// Retourne: { auth_url }
//
// 1. verifyAuth() pour identifier le user
// 2. Générer un nonce aléatoire (crypto.randomUUID() ou crypto.randomBytes)
// 3. Insérer dans oauth_states { user_id, nonce } via SUPABASE_SERVICE_ROLE_KEY
// 4. Supprimer les nonces expirés du même user (>15 min)
// 5. Construire l'URL Google OAuth :
//    https://accounts.google.com/o/oauth2/v2/auth?
//    client_id=...&redirect_uri=...&response_type=code
//    &scope=https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events
//    &access_type=offline&prompt=consent&state={nonce}
// 6. Retourner { auth_url }
```

#### 3.1.5 Edge Function : `api/google-auth-callback.js`

```javascript
// GET /api/google-auth-callback?code=xxx&state={nonce}
//
// ATTENTION : cet endpoint est un GET (redirect Google), pas un POST
// Ne PAS utiliser verifyAuth() ici — l'auth se fait via le nonce
//
// 1. Récupérer le code d'autorisation et le nonce (state param)
//
// 2. Vérifier le nonce dans oauth_states (via SUPABASE_SERVICE_ROLE_KEY) :
//    SELECT user_id FROM oauth_states WHERE nonce = {state} AND created_at > now() - interval '15 minutes'
//    Si introuvable → erreur "Invalid or expired state"
//
// 3. Supprimer le nonce (usage unique) :
//    DELETE FROM oauth_states WHERE nonce = {state}
//
// 4. Échanger le code contre des tokens Google :
//    POST https://oauth2.googleapis.com/token
//    { code, client_id, client_secret, redirect_uri, grant_type: 'authorization_code' }
//
// 5. Optionnel : récupérer l'email Google pour affichage
//    GET https://www.googleapis.com/oauth2/v2/userinfo
//
// 6. Upsert dans user_integrations (via SUPABASE_SERVICE_ROLE_KEY) :
//    { user_id, google_calendar_connected: true,
//      google_access_token, google_refresh_token,
//      google_token_expires_at: now + expires_in }
//
// 7. Rediriger vers parametres.html?calendar=connected
```

#### 3.1.6 Edge Function : `api/calendar.js`

```javascript
// POST /api/calendar
// Auth: Bearer token (pattern standard)
// Body: { action, ...params }

export default async function handler(req, res) {
  withCORS(res);
  const user = await verifyAuth(req, res);
  if (!user) return;

  const { action, ...params } = req.body;

  // 1. Récupérer les tokens Google depuis user_integrations
  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!integration?.google_calendar_connected) {
    return res.status(400).json({ error: 'calendar_not_connected' });
  }

  // 2. Renouveler le token si expiré
  const accessToken = await ensureValidToken(integration);

  // 3. Exécuter l'action
  switch (action) {

    case 'list_events': {
      // GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
      // Params: { date_from, date_to }
      // Query: timeMin, timeMax, singleEvents=true, orderBy=startTime, timeZone=Europe/Paris
      // Retourne : { events: [{ id, summary, start, end, location, description }] }
      break;
    }

    case 'find_slots': {
      // Logique custom — LA FONCTION LA PLUS IMPORTANTE
      // Params: { date_from, date_to, slot_type, duration_minutes }
      //
      // a) Récupérer tous les événements sur la période via list_events
      // b) Pour chaque jour dans la période :
      //    - Vérifier que c'est un jour travaillé (integration.working_days)
      //    - Définir la plage horaire selon slot_type :
      //      • 'morning' → work_start à lunch_slot_start
      //      • 'lunch'   → lunch_slot_start à lunch_slot_end
      //      • 'afternoon' → lunch_slot_end à work_end
      //      • 'any'     → work_start à work_end
      //    - Soustraire les événements existants de la plage
      //    - Identifier les créneaux libres ≥ duration_minutes
      // c) Retourner les créneaux triés par date
      //
      // Retourne : { slots: [{ date, start, end, day_label }], total_found }
      // Exemple : { slots: [
      //   { date: '2026-03-04', start: '12:00', end: '14:00', day_label: 'Mardi 4 mars' },
      //   { date: '2026-03-06', start: '12:00', end: '14:00', day_label: 'Jeudi 6 mars' }
      // ], total_found: 2 }
      break;
    }

    case 'create_event': {
      // POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
      // Params: { title, date, start_time, end_time, location?, description? }
      // Body Google: { summary, start: { dateTime, timeZone: 'Europe/Paris' },
      //               end: { dateTime, timeZone: 'Europe/Paris' }, location, description }
      // Retourne : { event: { id, summary, start, end, htmlLink } }
      break;
    }

    case 'update_event': {
      // PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
      // Params: { event_id, ...fieldsToUpdate }
      break;
    }

    case 'delete_event': {
      // DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
      // Params: { event_id }
      break;
    }
  }
}

// Renouvellement automatique du token Google
async function ensureValidToken(integration) {
  if (new Date(integration.google_token_expires_at) > new Date()) {
    return integration.google_access_token;
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
  if (!data.access_token) throw new Error('Token refresh failed');

  await supabaseAdmin.from('user_integrations').update({
    google_access_token: data.access_token,
    google_token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  }).eq('user_id', integration.user_id);

  return data.access_token;
}
```

---

### 3.2 Étape 2 — L'orchestrateur IA

#### 3.2.1 Edge Function : `api/assistant-orchestrator.js`

```javascript
// POST /api/assistant-orchestrator
// Auth: Bearer token
// Body: { input: "texte ou transcription", context: { today, user_name, contacts_json }, conversation_history: [...] }
// Retourne: { intent, confidence, params, leon_response }
//
// conversation_history : les 5 derniers échanges [{role: "user", content: "..."}, {role: "assistant", content: "..."}]
// Permet le multi-turn : "prends le deuxième", "oui", "envoie par SMS plutôt"
```

**System prompt complet :**

```
Tu es Léon, l'assistant organisationnel d'un conseiller immobilier indépendant français.

Tu reçois une demande en langage naturel (transcrite depuis un message vocal ou tapée au clavier).
Tu dois comprendre l'intention et retourner un JSON structuré.

DATE DU JOUR : {today}
NOM DE L'AGENT : {user_name}

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
- L'UI affichera une carte de preview avec boutons [Confirmer] [Annuler]
- L'action ne sera exécutée qu'après confirmation explicite de l'agent

RÈGLE DE DÉSAMBIGUÏSATION :
- Si update_event ou delete_event et que la demande est ambiguë (ex: "mon RDV de jeudi" mais potentiellement plusieurs RDV)
- Ajouter "needs_disambiguation": true et "disambiguation_query": { date_from, date_to } dans params
- L'UI listera les événements du jour et l'agent choisira lequel modifier/supprimer

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
      "from": "2026-02-25",
      "to": "2026-03-10"
    },
    "message_channel": "whatsapp",
    "message_tone": "amical_pro"
  },
  "leon_response": "Je cherche un créneau déjeuner pour toi avec Mathieu sur les 2 prochaines semaines. Je te prépare aussi un message !"
}

RÈGLES D'EXTRACTION :

Dates :
- Convertir les dates relatives en dates absolues à partir de {today}
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
{conversation_history}
→ Utilise cet historique pour comprendre les références ("le deuxième", "oui", "plutôt par SMS")
→ Si l'historique contient des créneaux proposés et que l'agent dit "prends le deuxième", retourne un create_event avec les infos du 2e créneau

CONTACTS CRM DE L'AGENT (pour matcher les noms — limité aux 50 plus récents, format: prénom nom, téléphone) :
{contacts_json}
```

---

### 3.3 Étape 3 — Génération de message

#### 3.3.1 Edge Function : `api/assistant-draft-message.js`

```javascript
// POST /api/assistant-draft-message
// Auth: Bearer token
// Body: { who, who_role, context, tone, channel, slots, user_name }
// Retourne: { message, subject (si email), channel }
```

**System prompt :**

```
Tu es Léon, l'assistant d'un conseiller immobilier. Tu rédiges un message pour {user_name} à envoyer à un contact.

DESTINATAIRE : {who} ({who_role})
CONTEXTE : {context}
CANAL : {channel}
TON : {tone}
CRÉNEAUX DISPONIBLES : {slots_formatted}

Rédige UN message prêt à copier-coller adapté au canal :

- WhatsApp : conversationnel, tutoiement si amical, 3-5 lignes max, emojis ok (1-2 max)
- SMS : très court (2-3 lignes max), direct, pas d'emojis
- Email : structuré, formule de politesse, inclure un objet (champ "subject")

RETOURNE un JSON :
{
  "message": "le texte du message prêt à copier-coller",
  "subject": "objet de l'email (null si pas email)",
  "channel": "whatsapp"
}

RÈGLES ABSOLUES :
- Le message doit paraître 100% naturel, comme écrit par un humain
- Adapter vouvoiement/tutoiement au ton (amical = tu, formel = vous)
- Inclure les créneaux de manière NATURELLE dans le texte, pas en liste
- Ne JAMAIS mentionner "Léon", "IA", "assistant", "automatique" dans le message
- Signer avec le prénom de l'agent : "{user_name}"
- Si pas de créneaux fournis, rédiger le message sans mentionner de dates
```

---

### 3.4 Étape 4 — Page `assistant.html`

#### 3.4.1 Structure de la page

C'est une **page conversationnelle** — l'agent interagit avec Léon comme dans un chat. L'interface est mobile-first mais fonctionne aussi en desktop.

**Scripts à charger** : `supabase-config.js`, `auth.js`, `audio-recorder.js`

**Layout :**

```
┌──────────────────────────────────────────────┐
│  [Header standard Léon avec navigation]      │
│  (même pattern que micro.html / social.html) │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Zone conversation (scroll vertical)   │  │
│  │                                        │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │ 🤖 Léon                          │  │  │
│  │  │ Salut Romain ! Qu'est-ce que je  │  │  │
│  │  │ peux organiser pour toi ?        │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │                                        │  │
│  │  [Les réponses et cartes s'empilent    │  │
│  │   ici au fil de la conversation]       │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Zone de saisie (fixe en bas)         │  │
│  │                                        │  │
│  │  ┌────────────────────────┐ [🎤] [➤]  │  │
│  │  │ Tape ou dicte...       │           │  │
│  │  └────────────────────────┘           │  │
│  │                                        │  │
│  │  Exemples cliquables :                │  │
│  │  "Mon planning demain"                │  │
│  │  "Trouver un créneau"                 │  │
│  │  "Envoyer un message"                 │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

#### 3.4.2 Composants de conversation

**Message de l'agent (bulle droite) :**
```
                    ┌──────────────────────┐
                    │ Trouve un créneau    │
                    │ pour déjeuner avec   │
                    │ Mathieu dans 2       │
                    │ semaines             │
                    └──────────────────────┘
```

**Réponse de Léon (bulle gauche) :**
```
┌──────────────────────────────────┐
│ 🤖 Léon                          │
│ Je cherche tes dispos déjeuner   │
│ sur les 2 prochaines semaines... │
└──────────────────────────────────┘
```

**Carte créneaux (après recherche) :**
```
┌──────────────────────────────────────────┐
│  📅 3 créneaux trouvés pour Mathieu      │
│                                          │
│  ☐ Mardi 4 mars, 12h – 14h              │
│  ☐ Jeudi 6 mars, 12h – 14h              │
│  ☐ Mardi 11 mars, 12h – 14h             │
│                                          │
│  [📅 Bloquer le(s) créneau(x)]          │
└──────────────────────────────────────────┘
```

**Carte message (généré) :**
```
┌──────────────────────────────────────────┐
│  💬 Message pour Mathieu (WhatsApp)      │
│  ┌────────────────────────────────────┐  │
│  │ Salut Mathieu ! Pour notre         │  │
│  │ déjeuner, je suis dispo mardi 4,  │  │
│  │ jeudi 6 ou mardi 11 mars à midi.  │  │
│  │ Dis-moi ce qui t'arrange !        │  │
│  │ À bientôt, Romain                 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [📋 Copier]  [💬 WhatsApp]             │
│  [🔄 Régénérer]  [✏️ Modifier]          │
└──────────────────────────────────────────┘
```

**Carte planning (liste d'événements) :**
```
┌──────────────────────────────────────────┐
│  📅 Ton planning de demain               │
│                                          │
│  09:00 – 10:30                           │
│  📍 Estimation Mme Dupont               │
│     15 rue de la Paix, Lyon 6e          │
│                                          │
│  12:00 – 13:30                           │
│  🍽️ Déjeuner Mathieu                     │
│     Restaurant à confirmer              │
│                                          │
│  15:00 – 16:00                           │
│  📞 Appel notaire – Dossier Lemaire     │
│                                          │
│  💡 Belle journée chargée !              │
└──────────────────────────────────────────┘
```

**Carte preview événement (avant confirmation) :**
```
┌──────────────────────────────────────────┐
│  📅 Créer cet événement ?                │
│                                          │
│  📌 Prospection                           │
│  🕐 Demain, 08:30 – 10:30               │
│  📍 (pas de lieu)                        │
│                                          │
│  [✅ Confirmer]  [❌ Annuler]             │
└──────────────────────────────────────────┘
```

**Carte confirmation événement (après exécution) :**
```
┌──────────────────────────────────────────┐
│  ✅ Événement créé                        │
│                                          │
│  📅 Prospection                           │
│  🕐 Demain, 08:30 – 10:30               │
│                                          │
│  [Voir dans Google Calendar ↗]           │
└──────────────────────────────────────────┘
```

**Carte désambiguïsation (choix entre plusieurs événements) :**
```
┌──────────────────────────────────────────┐
│  🤔 Tu as 3 RDV jeudi, lequel ?         │
│                                          │
│  ○ 09:00 – Estimation Mme Dupont        │
│  ○ 12:00 – Déjeuner Mathieu             │
│  ○ 15:00 – Appel notaire                │
│                                          │
│  [Sélectionner]                          │
└──────────────────────────────────────────┘
```

**Carte Google Calendar non connecté :**
```
┌──────────────────────────────────────────┐
│  📅 Connecte ton agenda                  │
│                                          │
│  Pour utiliser l'assistant, connecte     │
│  ton Google Calendar dans les            │
│  paramètres.                             │
│                                          │
│  [⚙️ Aller dans Paramètres]              │
└──────────────────────────────────────────┘
```

#### 3.4.3 Flux d'interaction complet

```javascript
// Historique conversation (stocké en mémoire côté client)
const conversationHistory = []; // Max 10 entrées (5 échanges)
const MAX_HISTORY = 10;

// 1. L'agent saisit (texte ou vocal)
async function handleUserInput(input) {
  // Afficher la bulle de l'agent
  appendUserMessage(input);

  // Ajouter à l'historique
  conversationHistory.push({ role: 'user', content: input });
  if (conversationHistory.length > MAX_HISTORY) conversationHistory.splice(0, 2);

  // Afficher "Léon réfléchit..."
  const thinkingId = appendLeonThinking();

  // 2. Vérifier que Calendar est connecté
  const integration = await checkCalendarConnection();
  if (!integration?.google_calendar_connected) {
    removeLeonThinking(thinkingId);
    appendCalendarNotConnected();
    return;
  }

  // 3. Appeler l'orchestrateur avec l'historique de conversation
  const headers = await getAuthHeaders();
  const orchestration = await fetch('/api/assistant-orchestrator', {
    method: 'POST', headers,
    body: JSON.stringify({
      input,
      context: {
        today: new Date().toISOString().split('T')[0],
        user_name: userName,
        contacts_json: await getContactsList()
      },
      conversation_history: conversationHistory.slice(0, -1) // Exclure le message actuel (déjà dans input)
    })
  }).then(r => r.json());

  // 4. Afficher la réponse textuelle de Léon
  removeLeonThinking(thinkingId);
  appendLeonMessage(orchestration.leon_response);

  // Ajouter la réponse de Léon à l'historique
  conversationHistory.push({ role: 'assistant', content: orchestration.leon_response });
  if (conversationHistory.length > MAX_HISTORY) conversationHistory.splice(0, 2);

  // 5. Exécuter selon l'intention
  switch (orchestration.intent) {

    case 'find_slots': {
      const slots = await callCalendar('find_slots', orchestration.params);
      appendSlotsCard(slots);
      // Ajouter les créneaux à l'historique pour le multi-turn
      conversationHistory.push({ role: 'assistant', content: `Créneaux trouvés: ${JSON.stringify(slots.slots)}` });
      break;
    }

    case 'find_slots_and_draft': {
      const slots = await callCalendar('find_slots', orchestration.params);
      appendSlotsCard(slots);
      conversationHistory.push({ role: 'assistant', content: `Créneaux trouvés: ${JSON.stringify(slots.slots)}` });

      const message = await fetch('/api/assistant-draft-message', {
        method: 'POST', headers,
        body: JSON.stringify({
          who: orchestration.params.who,
          who_role: orchestration.params.who_role,
          context: orchestration.params.context,
          tone: orchestration.params.message_tone,
          channel: orchestration.params.message_channel,
          slots: slots.slots,
          user_name: userName
        })
      }).then(r => r.json());
      appendMessageCard(message, orchestration.params);
      break;
    }

    case 'create_event': {
      // Afficher une carte de PREVIEW avec boutons Confirmer/Annuler
      // L'action n'est PAS exécutée tant que l'agent ne confirme pas
      appendEventPreview(orchestration.params, async () => {
        // Callback de confirmation
        const event = await callCalendar('create_event', orchestration.params);
        appendEventConfirmation(event, orchestration.params);
      });
      break;
    }

    case 'update_event': {
      if (orchestration.params.needs_disambiguation) {
        // Lister les événements du jour pour que l'agent choisisse
        const events = await callCalendar('list_events', orchestration.params.disambiguation_query);
        appendDisambiguationCard(events, 'update', orchestration.params);
      } else {
        // Preview de la modification avec Confirmer/Annuler
        appendUpdatePreview(orchestration.params, async () => {
          const event = await callCalendar('update_event', orchestration.params);
          appendEventConfirmation(event, orchestration.params);
        });
      }
      break;
    }

    case 'delete_event': {
      if (orchestration.params.needs_disambiguation) {
        const events = await callCalendar('list_events', orchestration.params.disambiguation_query);
        appendDisambiguationCard(events, 'delete', orchestration.params);
      } else {
        // Confirmation obligatoire avant suppression
        appendDeletePreview(orchestration.params, async () => {
          await callCalendar('delete_event', orchestration.params);
          appendLeonMessage('C\'est supprimé !');
        });
      }
      break;
    }

    case 'list_events': {
      const events = await callCalendar('list_events', orchestration.params.date_range);
      appendPlanningCard(events, orchestration.params.label);
      break;
    }

    case 'draft_message': {
      const message = await fetch('/api/assistant-draft-message', {
        method: 'POST', headers,
        body: JSON.stringify({
          who: orchestration.params.who,
          who_role: orchestration.params.who_role,
          context: orchestration.params.context,
          tone: orchestration.params.message_tone,
          channel: orchestration.params.message_channel,
          slots: null,
          user_name: userName
        })
      }).then(r => r.json());
      appendMessageCard(message, orchestration.params);
      break;
    }

    case 'unknown':
      // leon_response déjà affiché, l'agent peut reformuler
      break;
  }

  // Scroll vers le bas
  scrollToBottom();
}
```

#### 3.4.4 Zone de saisie

**Input texte + bouton vocal + bouton envoyer :**

```html
<div class="input-zone">
  <div class="input-row">
    <input type="text" id="textInput" placeholder="Tape ta demande..." />
    <button id="voiceBtn" class="btn-voice">🎤</button>
    <button id="sendBtn" class="btn-send">➤</button>
  </div>
  <div class="quick-actions">
    <button class="quick-chip" data-text="Qu'est-ce que j'ai demain ?">Mon planning demain</button>
    <button class="quick-chip" data-text="Trouve-moi un créneau cette semaine">Trouver un créneau</button>
    <button class="quick-chip" data-text="Bloque 2h de prospection demain matin">Bloquer du temps</button>
  </div>
</div>
```

**Envoi texte** : Entrée ou clic ➤ → `handleUserInput(textInput.value)`

**Envoi vocal** : Clic 🎤 → AudioRecorder → transcription Whisper → afficher la transcription comme bulle user → `handleUserInput(transcription)`

**Chips rapides** : Clic → injecte le texte dans l'input et envoie directement

#### 3.4.5 Interactions des boutons d'action

| Bouton | Action |
|--------|--------|
| 📋 Copier | `navigator.clipboard.writeText(message)` + toast "Copié !" |
| 💬 WhatsApp | `window.open('https://wa.me/{phone}?text=' + encodeURIComponent(message))` — chercher le téléphone du contact dans les leads CRM ou le carnet de contacts |
| 📅 Bloquer créneau(x) | Pour chaque créneau coché → `callCalendar('create_event', ...)` → appendEventConfirmation |
| 🔄 Régénérer | Re-appeler `assistant-draft-message.js` avec les mêmes params |
| ✏️ Modifier | Le texte du message passe en `textarea` (pas de contenteditable — trop buggé cross-browser) |
| Voir dans Google Calendar ↗ | `window.open(event.htmlLink)` (lien retourné par l'API Google) |
| ⚙️ Aller dans Paramètres | `window.location.href = 'parametres.html'` |

---

### 3.5 Étape 5 — Liens croisés

#### 3.5.1 Ajouter `assistant.html` dans la navigation

Toutes les pages ont un header avec des onglets de navigation. Ajouter un onglet "Assistant" dans le header de toutes les pages (ou au minimum dans le header de micro.html et index.html).

**Icône** : `fa-solid fa-wand-magic-sparkles` ou `fa-solid fa-robot`
**Label** : "Assistant"
**Lien** : `assistant.html`

#### 3.5.2 Lien micro → assistant

Ajouter un petit bouton flottant ou un lien dans micro.html :
```
📅 Gérer mon agenda → assistant.html
```

#### 3.5.3 Lien assistant → micro

Ajouter un lien dans assistant.html :
```
🎤 Ajouter une note CRM → micro.html
```

---

## 4. Récapitulatif des fichiers

### À CRÉER :

| Fichier | Rôle |
|---------|------|
| `assistant.html` | **Nouvelle page** — interface conversationnelle assistant organisationnel |
| `api/google-auth-init.js` | Edge Function — génère nonce CSRF + URL OAuth Google Calendar |
| `api/google-auth-callback.js` | Edge Function — vérifie nonce, échange code → tokens Google Calendar |
| `api/calendar.js` | Edge Function — CRUD Google Calendar (list, find_slots, create, update, delete) |
| `api/assistant-orchestrator.js` | Edge Function — compréhension intention langage naturel → JSON (multi-turn) |
| `api/assistant-draft-message.js` | Edge Function — génération message contextuel |
| `sql/002_user_integrations.sql` | Migration SQL — tables user_integrations + oauth_states |

### À MODIFIER :

| Fichier | Modification |
|---------|-------------|
| `parametres.html` | Ajouter section Google Calendar (connexion + préférences horaires) |
| `micro.html` | Ajouter lien croisé vers assistant.html (MINIMAL — ne pas toucher à la logique existante) |
| `index.html` | Ajouter onglet "Assistant" dans la navigation |
| `acquereurs.html` | Idem |
| `social.html` | Idem |
| `vercel.json` | Ajouter timeout 30s pour calendar.js et assistant-orchestrator.js |

### Documentation à METTRE À JOUR (obligation CLAUDE.md) :

| Fichier | Ajout |
|---------|-------|
| `docs/ARCHITECTURE.md` | assistant.html + 4 Edge Functions + table user_integrations + flux Calendar |
| `docs/API-MAP.md` | Endpoints /api/calendar, /api/assistant-orchestrator, /api/assistant-draft-message, /api/google-auth-callback |
| `docs/DECISIONS.md` | D016 (Google Calendar API), D017 (page assistant.html séparée de micro.html) |
| `docs/CHANGELOG.md` | Nouvelle entrée de session |
| `tasks/todo.md` | Mettre à jour les tâches |

### RÉUTILISÉS sans modification :

- `js/supabase-config.js` — Client Supabase + `getAuthHeaders()`
- `js/auth.js` — Guard auth + profil header
- `js/audio-recorder.js` — Classe AudioRecorder
- `api/transcribe.js` — Whisper transcription
- `api/_auth.js` — Helper auth (verifyAuth + withCORS)

---

## 5. Ordre d'implémentation

**Sprint 1 — Socle Calendar**
1. Créer `sql/002_user_integrations.sql` (tables user_integrations + oauth_states) et exécuter la migration dans Supabase
2. Ajouter les variables d'environnement dans Vercel
3. Configurer les scopes Calendar dans Google Cloud Console + URI de redirection
4. Implémenter `api/google-auth-init.js` (génération nonce + URL OAuth)
5. Implémenter `api/google-auth-callback.js` (vérification nonce + échange tokens)
6. Implémenter `api/calendar.js` (toutes les actions)
7. Ajouter la section Calendar dans `parametres.html`
8. Tester : OAuth flow → tokens stockés → lecture événements → find_slots → création événement

**Sprint 2 — Orchestrateur IA**
9. Implémenter `api/assistant-orchestrator.js` avec le system prompt complet (multi-turn, confirmation, désambiguïsation)
10. Implémenter `api/assistant-draft-message.js`
11. Tester avec des inputs texte variés (cf. section 8)

**Sprint 3 — Page assistant.html**
12. Créer `assistant.html` : layout, header, zone conversation, zone de saisie
13. Implémenter le flux conversationnel complet (handleUserInput → orchestration → actions → confirmation)
14. Créer les composants UI : bulles, carte créneaux, carte message, carte planning, carte preview/confirmation, carte désambiguïsation, carte Calendar non connecté
15. Implémenter les boutons d'action (copier, WhatsApp, bloquer créneau, régénérer, modifier via textarea)
16. Implémenter la saisie vocale (bouton 🎤 → AudioRecorder → transcription → handleUserInput)
17. Implémenter les quick chips
18. Tester le flux complet : texte + vocal + multi-turn + confirmation + tous les types de réponse

**Sprint 4 — Navigation et finitions**
19. Ajouter l'onglet "Assistant" dans la navigation de toutes les pages
20. Ajouter les liens croisés micro ↔ assistant
21. Mettre à jour `vercel.json` (timeouts — inclure google-auth-init)
22. Mettre à jour toute la documentation (`docs/` et `tasks/`)

---

## 6. Contraintes techniques

### Coûts par requête

| Étape | Service | Coût |
|---|---|---|
| Transcription vocale (10-15s) | Whisper | ~$0.003 |
| Orchestrateur (comprendre intention) | Claude Haiku | ~$0.0002 |
| Consultation agenda | Google Calendar API | **Gratuit** |
| Génération message | Claude Haiku | ~$0.0002 |
| **Total par requête** | | **~$0.004** |

→ ~$0.60/mois/agent pour 5 utilisations/jour. Largement rentable sur l'abonnement à 19.90€/mois.

### Timeout Vercel

Ajouter dans `vercel.json` :
```json
{
  "functions": {
    "api/parse-import-batch.js": { "maxDuration": 60 },
    "api/generate-social-post.js": { "maxDuration": 60 },
    "api/calendar.js": { "maxDuration": 30 },
    "api/assistant-orchestrator.js": { "maxDuration": 30 },
    "api/assistant-draft-message.js": { "maxDuration": 30 },
    "api/google-auth-init.js": { "maxDuration": 10 },
    "api/google-auth-callback.js": { "maxDuration": 15 }
  }
}
```

### Sécurité

- Tokens Google dans `user_integrations` protégée par RLS
- `refresh_token` et `SUPABASE_SERVICE_ROLE_KEY` JAMAIS côté client
- Tous les appels Calendar passent par les Edge Functions
- Si révocation de l'accès Google → nettoyer les tokens, afficher message reconnexion

### Gestion d'erreurs

| Situation | Comportement |
|-----------|-------------|
| Calendar non connecté | Carte avec lien vers parametres.html |
| Token expiré + refresh échoue | "Reconnecte ton Calendar dans les paramètres" |
| Aucun créneau trouvé | Léon propose d'élargir la période ou un autre type de créneau |
| Intention non comprise | Léon demande de reformuler (intent "unknown") |
| API Google indisponible | Message d'erreur + bouton Réessayer |
| Timeout (>30s) | "L'opération a pris trop de temps" + Réessayer |

---

## 7. Ton de Léon

(cf. SPEC-WORKFLOWS-LEON.md pour le détail complet)

- **Tutoyer** l'agent
- **Direct et efficace** — max 2 phrases par réponse
- **Encourageant** : "Belle journée chargée !", "C'est calé !", "Parfait !"
- **Jamais autoritaire** ni condescendant
- Emojis avec parcimonie : 📅, 💬, ✅, 💡, 🍽️
- Si agenda vide : "Ta matinée est libre, parfait pour de la prospection !" (jamais désobligeant)
- **Message de bienvenue** : "Salut {prénom} ! Qu'est-ce que je peux organiser pour toi ?"

---

## 8. Tests à effectuer

1. **OAuth Calendar** — Flux complet : clic → consentement → callback → tokens stockés → message succès dans parametres.html
2. **Déconnexion Calendar** — Clic "Déconnecter" → tokens supprimés → bouton "Connecter" réapparaît
3. **Lecture agenda** — Récupérer les événements d'un jour, d'une semaine
4. **Recherche créneaux** — Trouver les créneaux libres en respectant les préférences horaires (work_start/end, lunch, working_days)
5. **Création événement** — Créer un RDV → vérifier qu'il apparaît dans Google Calendar
6. **Renouvellement token** — Forcer l'expiration → vérifier le refresh automatique transparent
7. **Orchestrateur — 15+ formulations** :
   - "Trouve un créneau pour déjeuner avec Mathieu dans 2 semaines"
   - "Bloque 2h demain matin pour de la prospection"
   - "Qu'est-ce que j'ai demain ?"
   - "Mon planning de la semaine"
   - "Décale mon RDV de jeudi à vendredi"
   - "Annule mon rendez-vous de lundi"
   - "Préviens Mme Dupont que je serai en retard de 15 min"
   - "Organise un appel avec mon notaire cette semaine"
   - "Envoie un message à Mathieu pour confirmer notre déjeuner"
   - "Je suis dispo mardi et jeudi, envoie ça à mon courtier"
   - "Réserve le créneau de 14h à 16h jeudi pour une estimation"
   - "C'est quoi mon prochain RDV ?"
   - "J'ai rien demain matin ?"
   - "Cale un appel de 30 min avec Pierre cette semaine"
   - "Envoie un SMS à Mme Martin pour confirmer la visite de vendredi"
8. **Message généré** — Vérifier le ton adapté par canal (WhatsApp décontracté, Email formel, SMS court)
9. **Saisie vocale** — Flux complet sur Mobile Safari (iPhone) et Chrome (Android)
10. **Quick chips** — Clic → la demande s'exécute correctement
11. **Calendar non connecté** — Carte affichée avec lien paramètres
12. **Lien croisé micro ↔ assistant** — Navigation fluide entre les deux pages
13. **micro.html inchangé** — Vérifier que les notes CRM fonctionnent exactement comme avant (zéro régression)

---

## 9. Évolutions futures (hors scope v1)

- **Rappels / tâches** : intent `create_reminder` mappé vers la table `todos` existante
- **Bot WhatsApp** : l'agent envoie ses vocaux directement à "Léon" sur WhatsApp (WhatsApp Business API)
- **Synchronisation CRM ↔ Calendar** : lier un événement Calendar à une fiche lead (RDV estimation → fiche vendeur)
- **Rappels intelligents** : Léon rappelle 1h avant un RDV d'estimation de préparer les documents
- **Suggestion proactive** : "Tu n'as rien de prévu jeudi matin, c'est le moment de rappeler tes 3 leads tièdes"
- **Multi-calendrier** : gérer calendrier pro + perso
- **Intégration briefing du matin** : le briefing (cf. SPEC-WORKFLOWS-LEON.md) inclut les RDV du jour depuis Google Calendar
- **Actions en chaîne** : "Bloque le créneau de mardi avec Mathieu et envoie une confirmation à Mme Dupont pour vendredi 15h" → 2 actions en 1 dictée
- **Historique conversationnel** : sauvegarder les conversations assistant en base pour reprise
- **Mode mains-libres** : activation par "Hey Léon" (Web Speech API continue)
