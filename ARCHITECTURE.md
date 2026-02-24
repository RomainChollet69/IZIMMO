# ARCHITECTURE — Léon. (IZIMMO)

> CRM immobilier voice-first avec pipeline Kanban, workflows automatisés et IA intégrée.

---

## 1. Arborescence du projet

```
IZIMMO/
│
├── index.html                  # Pipeline Vendeurs — Kanban 6 colonnes (table `sellers`)
├── acquereurs.html             # Pipeline Acquéreurs — Kanban 4 colonnes (table `buyers`)
├── formulaire.html             # Formulaire public acquéreur (sans auth)
├── login.html                  # Page de connexion Google OAuth
├── landing.html                # Page marketing / vitrine
├── social.html                 # Moteur de contenu réseaux sociaux
├── parametres.html             # Page de paramètres utilisateur
├── micro.html                  # Version mobile allégée (voice-first)
├── dvf.html                    # Visualiseur données DVF + DPE
├── reset-password.html         # Réinitialisation mot de passe
├── pipeline-acquereurs.html    # ⚠️ DEPRECATED — ancien fichier à nettoyer
│
├── js/
│   ├── supabase-config.js      # Client Supabase + utilitaires partagés
│   ├── auth.js                 # Guard d'authentification + profil header
│   ├── workflows.js            # Définitions workflows + gestion des étapes
│   ├── relance-widget.js       # Widget flottant des relances (cloche)
│   ├── todo-widget.js          # Widget to-do avec dictée vocale
│   ├── audio-recorder.js       # Enregistrement micro + détection silence
│   ├── onboarding.js           # Tour guidé première utilisation
│   ├── social.js               # Logique calendrier social + IA
│   └── maps-config.js          # Clé API Google Maps
│
├── api/                        # Vercel Serverless Functions
│   ├── _auth.js                # Helper auth partagé (vérification Bearer token)
│   ├── transcribe.js           # Transcription audio → texte (OpenAI Whisper)
│   ├── parse-lead.js           # Extraction données structurées d'une dictée (Claude)
│   ├── parse-import-batch.js   # Parsing import Excel/CSV de contacts
│   ├── generate-message.js     # Génération SMS/WhatsApp/Email contextuel (Claude)
│   ├── generate-social-post.js # Génération contenu réseaux sociaux (Claude)
│   ├── parse-workflow-response.js # Parsing réponse vocale aux étapes workflow
│   ├── analyze-document.js     # Analyse de documents PDF
│   ├── parse-voice-note.js     # Parsing notes vocales
│   ├── map-columns.js          # Mapping colonnes pour imports
│   └── scrape-listing.js       # Scraping d'annonces immobilières
│
├── sql/
│   └── 001_workflow_steps.sql  # Migration table workflow_steps + RLS + indexes
│
├── img/
│   ├── Logo_leon.svg           # Logo vectoriel
│   ├── logo_200.png            # Logo header (toutes pages)
│   ├── F.png                   # Logo Open Graph
│   └── ORIGINALES/             # Assets design originaux
│
├── vercel.json                 # Config Vercel (timeout functions, headers micro)
├── package.json                # Dépendance unique : @supabase/supabase-js
└── package-lock.json
```

---

## 2. Stack technique

| Couche       | Technologie                              |
|--------------|------------------------------------------|
| Frontend     | HTML / CSS / JavaScript vanilla (pas de framework) |
| Backend      | Supabase (PostgreSQL + Auth + RLS)       |
| API          | Vercel Serverless Functions (Node.js)    |
| Auth         | Google OAuth via Supabase Auth           |
| IA           | Anthropic Claude (parsing, génération) + OpenAI Whisper (transcription) |
| Hébergement  | Vercel (auto-deploy depuis GitHub `main`) |
| Repo         | `github.com/RomainChollet69/IZIMMO`     |

---

## 3. Flux de données

### 3.1 Création de fiche par dictée vocale

```
Utilisateur parle
    │
    ▼
AudioRecorder (navigateur)
  ├── MediaRecorder API (WebM Opus / MP4)
  └── Détection de silence (AudioContext, seuil 0.01, timeout 5s)
    │
    ▼
POST /api/transcribe (audio blob)
  └── OpenAI Whisper (modèle whisper-1, langue=fr)
    │
    ▼
Transcript texte retourné au client
    │
    ▼
POST /api/parse-lead { text, type: "seller"|"buyer" }
  └── Claude extrait un JSON structuré (nom, tel, adresse, budget…)
    │
    ▼
INSERT dans `sellers` ou `buyers` (Supabase)
    │
    ▼
Rendu carte Kanban + Création workflow_steps associés
```

### 3.2 Déplacement de fiche (drag-and-drop)

```
Drag carte de Colonne A → Colonne B
    │
    ▼
UPDATE status dans `sellers` / `buyers`
    │
    ▼
onLeadStatusChange() — workflows.js
  ├── Clôture ancien workflow (steps → 'skipped')
  └── Création nouveau workflow (INSERT workflow_steps)
    │
    ▼
Rendu prochaine étape en attente sur la carte
```

### 3.3 Génération de messages IA

```
Clic "Générer message" sur une étape workflow
    │
    ▼
Sélection : canal (SMS / WhatsApp / Email) + scénario
    │
    ▼
POST /api/generate-message { channel, scenario, leadData, leadType }
  └── Claude génère un message contextuel adapté au canal
    │
    ▼
Affichage dans modale → copie manuelle par l'utilisateur
```

### 3.4 Système de relances

```
Chargement de page
    │
    ▼
Query sellers + buyers WHERE reminder <= today AND reminder IS NOT NULL
    │
    ▼
Comptage → Badge sur icône cloche (#alertBadge)
    │
    ▼
Clic cloche → Panel relance-widget (slide-in droite)
  ├── Filtres : En retard / Aujourd'hui / 7 jours / Toutes
  └── Clic item → navigation vers la fiche
```

### 3.5 To-do list

```
Saisie texte ou dictée vocale
    │
    ▼
(si vocal) POST /api/transcribe → découpage par délimiteurs ("et", ",", "puis"…)
    │
    ▼
INSERT dans `todos` (Supabase)
    │
    ▼
Affichage dans panel flottant avec drag-reorder (ordre en localStorage)
```

---

## 4. Schéma de la base de données

### Table `sellers`

| Colonne         | Type        | Description                                             |
|-----------------|-------------|---------------------------------------------------------|
| `id`            | UUID (PK)   | Identifiant unique                                      |
| `user_id`       | UUID (FK)   | Référence `auth.users(id)`                              |
| `first_name`    | TEXT        | Prénom                                                   |
| `last_name`     | TEXT        | Nom                                                      |
| `phone`         | TEXT        | Téléphone                                                |
| `email`         | TEXT        | Email                                                    |
| `address`       | TEXT        | Adresse du bien                                          |
| `property_type` | TEXT        | `appartement` \| `maison` \| `terrain` \| `immeuble`    |
| `budget`        | NUMERIC     | Prix estimé (EUR)                                        |
| `surface`       | NUMERIC     | Surface en m²                                            |
| `description`   | TEXT        | Description physique du bien                             |
| `annexes`       | TEXT[]      | `parking`, `cave`, `balcon`, `jardin`, `garage`, `piscine`, `ascenseur` |
| `status`        | TEXT        | `hot` \| `warm` \| `cold` \| `off_market` …             |
| `source`        | TEXT        | `boitage` \| `recommandation` \| `pige` \| `siteimmo` \| `efficity` \| `internet` \| `ancien_client` \| `acquereur` \| `autre` |
| `referrer_name` | TEXT        | Nom du recommandant (si source = recommandation)         |
| `notes`         | TEXT        | Notes relationnelles / commerciales                      |
| `reminder`      | DATE        | Date de prochaine relance                                |
| `position`      | INT         | Ordre dans la colonne du pipeline                        |
| `created_at`    | TIMESTAMPTZ | Date de création                                         |
| `updated_at`    | TIMESTAMPTZ | Dernière modification (trigger auto)                     |

### Table `buyers`

| Colonne         | Type        | Description                                             |
|-----------------|-------------|---------------------------------------------------------|
| `id`            | UUID (PK)   | Identifiant unique                                      |
| `user_id`       | UUID (FK)   | Référence `auth.users(id)`                              |
| `first_name`    | TEXT        | Prénom                                                   |
| `last_name`     | TEXT        | Nom                                                      |
| `phone`         | TEXT        | Téléphone                                                |
| `email`         | TEXT        | Email                                                    |
| `property_type` | TEXT        | Type de bien recherché                                   |
| `sector`        | TEXT        | Villes / quartiers de recherche                          |
| `budget_min`    | NUMERIC     | Budget minimum (EUR)                                     |
| `budget_max`    | NUMERIC     | Budget maximum (EUR)                                     |
| `status`        | TEXT        | `nouveau` \| `actif` \| `achete_avec_moi`               |
| `source`        | TEXT        | `site_annonce` \| `efficity` \| `recommandation` \| `appel_entrant` \| `reseaux_sociaux` \| `autre` |
| `notes`         | TEXT        | Notes                                                    |
| `reminder`      | DATE        | Date de prochaine relance                                |
| `position`      | INT         | Ordre dans la colonne                                    |
| `created_at`    | TIMESTAMPTZ | Date de création                                         |
| `updated_at`    | TIMESTAMPTZ | Dernière modification                                    |

### Table `workflow_steps`

| Colonne          | Type        | Description                                            |
|------------------|-------------|--------------------------------------------------------|
| `id`             | UUID (PK)   | Identifiant unique                                     |
| `user_id`        | UUID (FK)   | Référence `auth.users(id)`                             |
| `seller_id`      | UUID (FK)   | Référence `sellers(id)` — CASCADE DELETE               |
| `buyer_id`       | UUID (FK)   | Référence `buyers(id)` — CASCADE DELETE                |
| `workflow_type`  | TEXT        | `warm_seller` \| `mandate` \| `post_sale` \| `active_buyer` \| `competitor_watch` \| `post_purchase` |
| `step_key`       | TEXT        | Identifiant unique de l'étape                          |
| `step_label`     | TEXT        | Question affichée (ex: "Premier contact effectué ?")   |
| `sort_order`     | INT         | Ordre d'affichage                                      |
| `status`         | TEXT        | `pending` \| `done` \| `skipped`                       |
| `due_date`       | TIMESTAMPTZ | Échéance prévue                                        |
| `completed_at`   | TIMESTAMPTZ | Date de complétion                                     |
| `ai_suggestion`  | TEXT        | Suggestion IA contextuelle                             |
| `ai_action`      | TEXT        | Action IA proposée (`generate_message`, `generate_listing`…) |
| `agent_response` | TEXT        | Réponse de l'agent (texte ou dictée)                   |
| `created_at`     | TIMESTAMPTZ | Date de création                                       |
| `updated_at`     | TIMESTAMPTZ | Dernière modification (trigger auto)                   |

**Contrainte** : `seller_id IS NOT NULL OR buyer_id IS NOT NULL`

**Index** :
- `idx_workflow_steps_user_pending` — `(user_id, status)` WHERE `status = 'pending'`
- `idx_workflow_steps_seller` — `(seller_id)` WHERE `seller_id IS NOT NULL`
- `idx_workflow_steps_buyer` — `(buyer_id)` WHERE `buyer_id IS NOT NULL`
- `idx_workflow_steps_due` — `(user_id, due_date)` WHERE `status = 'pending'`

### Table `todos`

| Colonne      | Type        | Description               |
|--------------|-------------|---------------------------|
| `id`         | UUID (PK)   | Identifiant unique        |
| `user_id`    | UUID (FK)   | Référence `auth.users(id)`|
| `text`       | TEXT        | Contenu de la tâche        |
| `done`       | BOOLEAN     | Terminée ? (default false) |
| `created_at` | TIMESTAMPTZ | Date de création           |

### Table `contacts`

| Colonne   | Type      | Description                              |
|-----------|-----------|------------------------------------------|
| `id`      | UUID (PK) | Identifiant unique                       |
| `user_id` | UUID (FK) | Référence `auth.users(id)`               |
| `name`    | TEXT      | Nom complet                              |
| `phone`   | TEXT      | Téléphone                                |
| `email`   | TEXT      | Email                                    |

Utilisée pour l'autocomplétion dans les formulaires de création de fiches.

### Sécurité (RLS)

Toutes les tables ont **Row Level Security activé**. Politique unique :

```sql
CREATE POLICY "Users see own records" ON <table>
  FOR ALL USING (auth.uid() = user_id);
```

Chaque utilisateur ne voit et ne manipule que ses propres données.

---

## 5. Dépendances externes

### Librairies CDN (frontend)

| Librairie                | Version | Usage                                  |
|--------------------------|---------|----------------------------------------|
| `@supabase/supabase-js`  | 2.97.0  | Client Supabase (DB + Auth)            |
| Google Fonts             | —       | Barlow Semi Condensed (titres), Inter (corps) |
| Font Awesome             | 6.5.1   | Icônes                                 |
| pdf.js                   | 3.11.174| Lecture de PDF côté client              |

### Dépendance npm

| Package                  | Version | Usage                                  |
|--------------------------|---------|----------------------------------------|
| `@supabase/supabase-js`  | ^2.97.0 | Utilisé par les Vercel Functions (`api/`) |

### APIs externes

| API                              | Usage                                           | Fichier(s) concerné(s)              |
|----------------------------------|--------------------------------------------------|-------------------------------------|
| **Supabase**                     | Base de données PostgreSQL, Auth, RLS            | `js/supabase-config.js`, toutes pages |
| **Google OAuth** (via Supabase)  | Authentification utilisateur                     | `login.html`, `js/auth.js`          |
| **Google Maps**                  | Cartographie (DVF, localisation)                 | `js/maps-config.js`, `dvf.html`     |
| **OpenAI Whisper**               | Transcription audio → texte (français)           | `api/transcribe.js`                 |
| **Anthropic Claude**             | Extraction données, génération messages/contenu  | `api/parse-lead.js`, `api/generate-message.js`, `api/generate-social-post.js`, `api/parse-workflow-response.js` |
| **api-adresse.data.gouv.fr**     | Géocodage adresses françaises (gratuit)          | `js/supabase-config.js`             |
| **DVF (data.gouv.fr)**           | Données de ventes immobilières françaises         | `dvf.html`                          |
| **ADEME (DPE)**                  | Diagnostics de performance énergétique            | `dvf.html`                          |

### Variables d'environnement (Vercel)

| Variable            | Usage                              |
|---------------------|------------------------------------|
| `OPENAI_API_KEY`    | Transcription Whisper              |
| `ANTHROPIC_API_KEY` | Génération IA (Claude)             |

> Les clés Supabase (URL + anon key) sont en dur dans `js/supabase-config.js` (standard pour les clients publics avec RLS).

---

## 6. Workflows métier

### Vendeurs

| Workflow           | Déclencheur                    | Étapes |
|--------------------|--------------------------------|--------|
| `warm_seller`      | Fiche passe en "Chauds"       | 8 — du premier contact au mandat proposé |
| `mandate`          | Fiche passe en "Mandats"      | 10 — des documents à la publication + matching |
| `post_sale`        | Fiche passe en "Vendus"       | 5 — remerciement, avis Google, recommandations à 3 et 6 mois |
| `competitor_watch` | Fiche passe en "Concurrents"  | 5 — suivi prix à 2 sem / 1 mois / 3 mois |

### Acquéreurs

| Workflow           | Déclencheur                        | Étapes |
|--------------------|------------------------------------|--------|
| `active_buyer`     | Fiche passe en "Actifs"           | 4 — critères, financement, sélection, première visite |
| `post_purchase`    | Fiche passe en "Achetés avec moi" | 4 — félicitations, avis Google, suivi à 3 et 6 mois |

---

## 7. Fichiers JS — rôle et fonctions principales

### `supabase-config.js`
Client Supabase + utilitaires partagés par toutes les pages.

| Fonction                      | Rôle                                          |
|-------------------------------|-----------------------------------------------|
| `getSourceTag(source)`        | Badge HTML coloré pour source vendeur          |
| `getBuyerSourceTag(source)`   | Badge HTML coloré pour source acquéreur        |
| `setupContactAutocomplete()`  | Autocomplétion nom depuis table `contacts`     |
| `setupAddressAutocomplete()`  | Géocodage adresse via api-adresse.data.gouv.fr |
| `setupSectorAutocomplete()`   | Sélection multi-villes pour acquéreurs         |
| `compressImage(file)`         | Compression image avant upload (Canvas API)    |
| `formatEuro(amount)`          | Formatage monétaire EUR                        |
| `parseAmount(val)`            | Parsing chaîne monétaire → nombre              |
| `getAuthHeaders()`            | Headers Bearer token pour appels API           |
| `escapeHtml(str)`             | Protection XSS                                 |

### `auth.js`
Guard de session + rendu profil utilisateur dans le header.
- Redirige vers `login.html` si non authentifié
- Écoute `onAuthStateChange` pour les changements de session
- Gère le header mobile responsive

### `workflows.js`
Définitions des 6 workflows + gestion CRUD des étapes.

| Fonction                    | Rôle                                           |
|-----------------------------|-------------------------------------------------|
| `createWorkflowSteps()`    | Insère toutes les étapes d'un workflow en DB     |
| `closeWorkflow()`          | Marque les étapes pending → skipped              |
| `getNextPendingStep()`     | Retourne la prochaine étape à traiter            |
| `completeStep(stepId)`     | Marque une étape done + timestamp                |
| `onLeadStatusChange()`     | Gère les transitions de statut (clôture + création) |
| `getOverdueSteps()`        | Étapes en retard (pour briefing matinal)         |
| `getTodaySteps()`          | Étapes dues dans les 3 prochains jours           |

### `relance-widget.js`
Panel flottant (slide-in droite) listant les relances dues.
- Fusionne vendeurs + acquéreurs triés par date de relance
- Filtres : En retard / Aujourd'hui / 7 jours / Toutes
- Met à jour le badge compteur sur la cloche `#alertBadge`

### `todo-widget.js`
Liste de tâches personnelle avec dictée vocale + drag-reorder.
- FAB avec badge compteur
- Saisie texte ou vocale (découpage automatique par délimiteurs)
- Drag-and-drop pour réordonner (ordre persisté en localStorage)
- CRUD sur table `todos`

### `audio-recorder.js`
Classe `AudioRecorder` — enregistrement micro + transcription.
- MediaRecorder API (WebM Opus / MP4)
- Détection de silence (AudioContext, seuil configurable)
- POST vers `/api/transcribe` pour transcription Whisper
- États : `idle` → `recording` → `transcribing` → `done`

### `onboarding.js`
Tour guidé en 4 étapes pour les nouveaux utilisateurs du pipeline vendeurs.
- Spotlight overlay + tooltip positionné dynamiquement
- Auto-skip si 3+ vraies fiches existent
- Suivi via localStorage (one-time)

### `social.js`
Moteur de contenu réseaux sociaux.
- Mode "J'ai un truc à raconter" (dictée vocale)
- Calendrier hebdomadaire (LinkedIn, Instagram, Facebook, TikTok)
- Templates de contenu enrichis avec données CRM
- Historique de publications

---

## 8. Pages HTML — scripts chargés

| Page                 | Scripts JS                                                                   |
|----------------------|------------------------------------------------------------------------------|
| `index.html`         | supabase-config, auth, workflows, audio-recorder, relance-widget, todo-widget, onboarding |
| `acquereurs.html`    | supabase-config, auth, workflows, audio-recorder, relance-widget, todo-widget |
| `formulaire.html`    | supabase-config (pas d'auth — page publique)                                |
| `login.html`         | supabase-config                                                              |
| `social.html`        | supabase-config, auth, social, audio-recorder                                |
| `parametres.html`    | supabase-config, auth                                                        |
| `micro.html`         | supabase-config, auth, audio-recorder                                        |
| `dvf.html`           | supabase-config, auth, maps-config                                           |
| `landing.html`       | (aucun — page statique marketing)                                            |

---

## 9. Configuration Vercel

```json
{
  "functions": {
    "api/parse-import-batch.js": { "maxDuration": 60 },
    "api/generate-social-post.js": { "maxDuration": 60 }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Permissions-Policy", "value": "microphone=(self)" }
      ]
    }
  ]
}
```

- Timeout étendu à 60s pour l'import batch et la génération sociale (vs 10s par défaut)
- Header `Permissions-Policy: microphone=(self)` sur toutes les pages pour autoriser la dictée vocale

---

## 10. Charte graphique

| Élément      | Valeur                                                  |
|--------------|---------------------------------------------------------|
| Gradient     | `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`    |
| Typo titres  | Barlow Semi Condensed, 800, uppercase, letter-spacing 0.5px |
| Typo corps   | Inter, 400-700                                          |
| Texte foncé  | `#2C3E50`                                               |
| Texte gris   | `#7F8C8D`                                               |
| Fond clair   | `#f8f9fa`                                               |
| Bordures     | `#E1E8ED`                                               |
| Alerte rouge | `#FF4757`                                               |
| Succès vert  | `#66BB6A`                                               |
| Border-radius| 8-20px (cartes: 12px, boutons: 10px)                    |
| Ombres       | `0 4px 12px rgba(0,0,0,0.15)` (standard)               |
| Breakpoint   | 768px (mobile)                                          |
