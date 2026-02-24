# API-MAP — Cartographie des endpoints et APIs

> Inventaire complet de chaque endpoint interne et API externe utilisée dans Léon.

---

## 1. Endpoints backend (Vercel Serverless Functions)

Tous les endpoints sont dans le dossier `api/`. Ils suivent un pattern commun :
- **Méthode** : POST uniquement (OPTIONS pour CORS preflight)
- **Auth** : Bearer token vérifié via `_auth.js` → `verifyAuth(req)`
- **CORS** : `Access-Control-Allow-Origin: *` via `withCORS(res)`
- **Modèle IA** : `claude-haiku-4-5-20251001` (sauf transcribe qui utilise Whisper)

---

### POST `/api/transcribe`

Transcription audio → texte français.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Content-Type** | `audio/webm` ou `audio/mp4` (raw body) |
| **Body** | Buffer audio brut |
| **Service externe** | OpenAI Whisper (`whisper-1`, `language=fr`) |
| **Timeout** | 15s |
| **Config spéciale** | `bodyParser: false` |

**Réponse** :
```json
{ "text": "Bonjour, j'ai un appartement à vendre..." }
```

**Erreurs** : `400` (pas d'audio), `401` (auth), `500` (clé manquante), `502` (OpenAI échoue), `504` (timeout)

---

### POST `/api/parse-lead`

Extraction de données structurées depuis une dictée vocale.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ text: string, type: "seller" \| "buyer" }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 20s |

**Réponse vendeur** :
```json
{
  "fields": {
    "first_name": "Jean",
    "last_name": "Dupont",
    "phone": "06 12 34 56 78",
    "email": null,
    "address": "15 rue de la Paix, Lyon",
    "property_type": "appartement",
    "budget": 250000,
    "surface": 65,
    "annexes": ["parking", "cave"],
    "source": "pige",
    "status": "warm",
    "description": "T3 lumineux, 3e étage",
    "notes": "Motivé, divorce en cours",
    "reminder": "2026-03-01"
  }
}
```

**Réponse acquéreur** : Mêmes champs + `budget_min`, `budget_max`, `sector`, `surface_min`, `criteria`, `dealbreakers`

**Erreurs** : `400` (pas de texte), `401`, `502`, `504`

---

### POST `/api/generate-message`

Génération de messages contextuels (SMS, WhatsApp, Email).

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ channel, scenario, leadData, notes, customPrompt, leadType }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 20s |

**Canaux** : `sms` (max 300 chars) / `whatsapp` (2-4 phrases, emojis ok) / `email` (avec sujet)

**Scénarios vendeurs** (24) : `confirmation_rdv`, `relance_estimation`, `mandat_signe`, `demande_avis`, `relance_recommandation`…

**Scénarios acquéreurs** (10) : `confirmation_visite`, `envoi_bien`, `retour_visite`…

**Réponse** :
```json
{ "message": "Bonjour Jean, suite à notre échange..." }
```

**Erreurs** : `400`, `401`, `500` (clé manquante), `502`, `504`

---

### POST `/api/generate-social-post`

Génération de contenu pour réseaux sociaux.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ mode, platform, user_input, template_override, suggestion_context }` |
| **Service externe** | Anthropic Claude Haiku + Supabase (contexte CRM) |
| **Timeout** | 30s |
| **Vercel maxDuration** | 60s |

**Modes** : `free_input` (l'agent raconte une histoire) / `suggestion` (template du calendrier)

**Plateformes** : `linkedin`, `instagram`, `facebook`, `tiktok`

**Réponse** :
```json
{
  "hook": "Ce que personne ne vous dit sur...",
  "hook_pattern": "contrarian",
  "content": "Texte complet du post...",
  "visual_recommendation": "Photo de l'immeuble avec...",
  "completeness": { "score": 85 },
  "compliance_flags": { "rgpd": true },
  "word_count": 180,
  "post_id": "uuid"
}
```

**Tables Supabase accédées** : `social_profiles`, `social_posts`, `sellers`, `buyers`, `visits`, `lead_notes`

**Erreurs** : `400`, `401`, `500`, `502`, `504`

---

### POST `/api/parse-import-batch`

Parsing d'un import Excel/CSV en fiches structurées.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ headers: string[], rows: string[][], leadType: "sellers" \| "buyers" }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 55s |
| **Vercel maxDuration** | 60s |

**Réponse** :
```json
{
  "leads": [{ "first_name": "Jean", "last_name": "Dupont", ... }],
  "ignored": [{ "row": 5, "reason": "Données insuffisantes" }]
}
```

**Erreurs** : `400`, `401`, `502`, `504`

---

### POST `/api/map-columns`

Mapping automatique des colonnes Excel vers les champs CRM.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ headers: string[], sampleRows: string[][] }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 15s |

**Réponse** :
```json
{ "Nom": "last_name", "Téléphone": "phone", "Ville": "sector" }
```

**Erreurs** : `400`, `401`, `502`, `504`

---

### POST `/api/analyze-document`

Extraction de données depuis un document (PDF, image).

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ fileUrl?, fileContent?, fileType, leadType }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 30s |

**Types supportés** : `image/*`, `application/pdf`, `text/plain`

**Réponse** :
```json
{
  "fields": {
    "first_name": "...", "last_name": "...",
    "address": "...", "budget": 300000, "surface": 80
  }
}
```

**Erreurs** : `400`, `401`, `404` (fichier introuvable), `502`, `504`

---

### POST `/api/parse-voice-note`

Analyse d'une note vocale pour identifier les contacts et les actions.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ transcription, leads: [], today }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 20s |

**Réponse** :
```json
{
  "action_understood": "Ajouter une note pour Dupont et relancer Martin",
  "contacts_matched": [
    { "lead_id": "uuid", "lead_type": "seller", "lead_name": "Dupont",
      "confidence": 0.95, "note_content": "...", "reminder_date": "2026-03-01" }
  ],
  "ambiguous_contacts": [],
  "unmatched_contacts": ["Nom inconnu"]
}
```

**Erreurs** : `400`, `401`, `502`, `504`

---

### POST `/api/parse-workflow-response`

Analyse de la réponse vocale d'un agent à une étape workflow.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ transcription, stepLabel, leadName?, leadStatus?, workflowType?, sortOrder?, recentNotes? }` |
| **Service externe** | Anthropic Claude Haiku |
| **Timeout** | 20s |

**Réponse** :
```json
{
  "step_completed": true,
  "step_in_progress": false,
  "note_summary": "RDV confirmé pour jeudi 14h",
  "reminder_date": "2026-03-06",
  "reminder_reason": "Rappeler après le RDV",
  "todo_text": null,
  "leon_response": "Parfait ! Le RDV est calé, on avance bien !"
}
```

**Erreurs** : `400`, `401`, `502`, `504`

---

### POST `/api/scrape-listing`

Scraping d'une annonce immobilière concurrente.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ url: string }` |
| **Service externe** | HTTP fetch + Anthropic Claude Haiku |
| **Timeout** | 30s (10s pour le fetch) |

**Plateformes** : SeLoger, LeBonCoin, Bien'ici, PAP, autres

**Réponse** :
```json
{
  "agency": "Century 21",
  "price": 285000,
  "description": "Bel appartement T3...",
  "surface": "85 m²",
  "date": "2026-02-15",
  "platform": "seloger"
}
```

**Note** : Retourne `200` avec champ `error` en cas d'échec (dégradation gracieuse).

---

### Helper : `_auth.js`

Fonctions partagées par tous les endpoints.

| Fonction | Rôle |
|----------|------|
| `verifyAuth(req)` | Extrait le Bearer token, vérifie via `supabase.auth.getUser()`, retourne l'objet user ou `null` |
| `withCORS(res)` | Ajoute les headers CORS (`Access-Control-Allow-Origin: *`, méthodes POST/OPTIONS) |
| `getSupabaseAdmin()` | Client Supabase avec `SERVICE_ROLE_KEY` (lazy singleton). Pour les opérations serveur hors contexte utilisateur. |

---

### POST `/api/google-auth-init`

Génère un nonce CSRF et retourne l'URL d'autorisation Google OAuth Calendar.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | (vide) |
| **Timeout** | 10s |

**Réponse** :
```json
{ "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

---

### GET `/api/google-auth-callback`

Callback de redirection OAuth Google. Vérifie le nonce, échange le code, stocke les tokens.

| Champ | Valeur |
|-------|--------|
| **Méthode** | GET (exception — redirect Google) |
| **Auth** | Via nonce dans `state` param (pas de Bearer) |
| **Query params** | `code`, `state`, `error` |
| **Timeout** | 15s |

**Réponse** : Redirection vers `parametres.html?calendar=connected` ou `?calendar=error&reason=...`

---

### POST `/api/calendar`

CRUD Google Calendar avec refresh automatique des tokens.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ action: string, ...params }` |
| **Timeout** | 30s |

**Actions** :
| Action | Params | Réponse |
|--------|--------|---------|
| `list_events` | `{ date_from, date_to }` | `{ events: [...] }` |
| `find_slots` | `{ date_from, date_to, slot_type, duration_minutes }` | `{ slots: [...], total_found }` |
| `create_event` | `{ title, date, start_time, end_time, location?, description? }` | `{ event: { id, summary, start, end, htmlLink } }` |
| `update_event` | `{ event_id, title?, date?, start_time?, end_time?, ... }` | `{ event: { id, summary, start, end, htmlLink } }` |
| `delete_event` | `{ event_id }` | `{ deleted: true, event_id }` |

---

### POST `/api/assistant-orchestrator`

Compréhension d'intention en langage naturel (NLU). Multi-turn via conversation_history.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ input, context: { today, user_name, contacts_json }, conversation_history }` |
| **Service** | Anthropic Claude Haiku |
| **Timeout** | 20s |

**Réponse** :
```json
{ "intent": "find_slots", "confidence": 0.95, "params": {...}, "leon_response": "..." }
```

**Intents** : `find_slots`, `create_event`, `update_event`, `delete_event`, `list_events`, `draft_message`, `find_slots_and_draft`, `confirm_action`, `unknown`

---

### POST `/api/assistant-draft-message`

Génération de message contextuel (WhatsApp/SMS/Email) pour l'assistant.

| Champ | Valeur |
|-------|--------|
| **Auth** | Bearer token |
| **Body** | `{ who, who_role, context, tone, channel, slots, user_name }` |
| **Service** | Anthropic Claude Haiku |
| **Timeout** | 20s |

**Réponse** :
```json
{ "message": "Salut Mathieu ! ...", "subject": null, "channel": "whatsapp" }
```

---

## 2. APIs externes (frontend)

### api-adresse.data.gouv.fr

API publique gratuite de géocodage d'adresses françaises.

**Recherche d'adresse** (autocomplétion) :
```
GET https://api-adresse.data.gouv.fr/search/?q={query}&limit=5
```
- Utilisé dans : `setupAddressAutocomplete()` — `js/supabase-config.js`
- Retourne : GeoJSON (adresse, code postal, ville, coordonnées GPS)

**Recherche de commune** (secteur acquéreurs) :
```
GET https://api-adresse.data.gouv.fr/search/?q={query}&limit=5&type=municipality
```
- Utilisé dans : `setupSectorAutocomplete()` — `js/supabase-config.js`

**Géocodage inverse** (clic sur carte) :
```
GET https://api-adresse.data.gouv.fr/reverse/?lon={lng}&lat={lat}&limit=1
```
- Utilisé dans : `dvf.html` (couche DVF)

**Auth** : Aucune | **Coût** : Gratuit | **Limite** : Aucune documentée

---

### Google Maps JavaScript API

Carte interactive pour la visualisation DVF/DPE.

**Chargement** :
```
https://maps.googleapis.com/maps/api/js?key={API_KEY}&v=weekly&callback=initMap
```

**Clé** : `js/maps-config.js` → `window.GOOGLE_MAPS_KEY`

**Composants utilisés** :
- `google.maps.Map` — Carte interactive
- `google.maps.Marker` — Marqueurs DVF et DPE
- `google.maps.Circle` — Rayon de recherche
- `google.maps.InfoWindow` — Popups d'information
- `google.maps.SymbolPath.CIRCLE` — Symboles personnalisés

**Utilisé dans** : `dvf.html`

---

## 3. Opérations Supabase (client → DB)

### Tables et opérations CRUD

| Table | SELECT | INSERT | UPDATE | DELETE | Pages |
|-------|--------|--------|--------|--------|-------|
| `sellers` | x | x | x | x | index.html, relance-widget, workflows, social |
| `buyers` | x | x | x | x | acquereurs.html, relance-widget, workflows |
| `workflow_steps` | x | x | x | — | workflows.js (toutes pages pipeline) |
| `todos` | x | x | x | x | todo-widget.js |
| `contacts` | x | — | — | — | supabase-config.js (autocomplétion), assistant.html |
| `user_integrations` | x | x | x (upsert) | — | parametres.html, api/calendar, api/google-auth-callback |
| `oauth_states` | x | x | — | x | api/google-auth-init, api/google-auth-callback |
| `social_profiles` | x | x | x (upsert) | — | social.js |
| `social_posts` | x | x | x | — | social.js, api/generate-social-post |
| `visits` | x | x | x | — | social.js (contexte CRM) |
| `lead_notes` | x | — | — | — | social.js (contexte CRM) |

### Supabase Storage

| Bucket | Opération | Usage | Page |
|--------|-----------|-------|------|
| `dvf-data` | GET (public) | Données de ventes immobilières par département | dvf.html |
| `dpe-data` | GET (public) | Diagnostics de performance énergétique | dvf.html |

### Supabase Auth

| Opération | Usage | Page |
|-----------|-------|------|
| `signInWithOAuth({ provider: 'google' })` | Connexion Google | login.html |
| `onAuthStateChange()` | Écoute changement de session | auth.js (toutes pages) |
| `getUser()` | Récupération user courant | auth.js, _auth.js (backend) |
| `signOut()` | Déconnexion | auth.js |

---

## 4. Variables d'environnement

### Vercel (serveur — jamais exposées au client)

| Variable | Service | Endpoints |
|----------|---------|-----------|
| `OPENAI_API_KEY` | OpenAI Whisper | `/api/transcribe` |
| `ANTHROPIC_API_KEY` | Anthropic Claude | `/api/parse-lead`, `/api/generate-message`, `/api/generate-social-post`, `/api/parse-import-batch`, `/api/map-columns`, `/api/analyze-document`, `/api/parse-voice-note`, `/api/parse-workflow-response`, `/api/scrape-listing`, `/api/assistant-orchestrator`, `/api/assistant-draft-message` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (admin) | `/api/google-auth-init`, `/api/google-auth-callback`, `/api/calendar` |
| `GOOGLE_CLIENT_ID` | Google OAuth | `/api/google-auth-init`, `/api/google-auth-callback` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | `/api/google-auth-callback`, `/api/calendar` (token refresh) |
| `GOOGLE_REDIRECT_URI` | Google OAuth | `/api/google-auth-init` |

### Client (publiques — protégées par RLS)

| Variable | Fichier | Valeur |
|----------|---------|--------|
| `SUPABASE_URL` | `js/supabase-config.js` | Hardcodé |
| `SUPABASE_ANON_KEY` | `js/supabase-config.js` | Hardcodé |
| `GOOGLE_MAPS_KEY` | `js/maps-config.js` | Hardcodé (restreint par HTTP referrer) |

---

## 5. Codes d'erreur communs

| Code | Signification | Quand |
|------|---------------|-------|
| `200` | Succès | Toujours (parfois avec champ `error` pour dégradation gracieuse) |
| `400` | Champs requis manquants | Body incomplet |
| `401` | Token absent ou invalide | Bearer token manquant/expiré |
| `405` | Méthode non autorisée | Requête non-POST |
| `500` | Erreur serveur / clé API manquante | Variable d'environnement non configurée |
| `502` | API externe échoue | Claude ou Whisper ne répond pas |
| `504` | Timeout | Requête dépasse le délai configuré |

---

## 6. Résumé des modèles IA

| Modèle | Service | Usage | Coût approximatif |
|--------|---------|-------|-------------------|
| `whisper-1` | OpenAI | Transcription audio français | ~$0.006/min |
| `claude-haiku-4-5-20251001` | Anthropic | Parsing, génération, analyse | ~$0.25/M tokens input, $1.25/M output |
