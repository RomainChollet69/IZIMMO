# ARCHITECTURE — Léon. (IZIMMO)

> CRM immobilier voice-first avec pipeline Kanban, workflows automatisés et IA intégrée.

---

## 1. Arborescence du projet

```
IZIMMO/
│
├── CLAUDE.md                   # Règles de comportement Claude Code
├── home.html                   # Page d'accueil / Cockpit — 8 tuiles métiers, recherche globale, bienvenue personnalisée
├── index.html                  # Pipeline Vendeurs — Kanban 8 colonnes desktop + Card Deck mobile + recherche (table `sellers`)
├── acquereurs.html             # Pipeline Acquéreurs — Kanban 5 colonnes + recherche (table `buyers`)
├── formulaire.html             # Formulaire public acquéreur (sans auth)
├── login.html                  # Page de connexion Google OAuth (redirige vers home.html)
├── landing.html                # Page marketing / vitrine (v1, tutoiement)
├── landing-v2.html             # Landing page premium Apple-style (v2, vouvoiement, scroll-reveal)
├── social.html                 # Moteur de contenu réseaux sociaux
├── parametres.html             # Paramètres utilisateur (profil, Calendar, préférences — gamification retirée)
├── micro.html                  # Assistant vocal — notes CRM, visites, agenda, commandes Léon, requêtes DVF
├── dvf.html                    # Visualiseur données DVF + DPE
├── etude-marche.html           # Étude de marché IA — formulaire + interview express + photos + paramètres + génération 2 passes Claude Sonnet + DVF
├── tutoriels.html              # Centre de formation & onboarding (placeholder, contenu à venir)
├── leon.html                   # Cockpit quotidien — Guide intelligent Léon (priorisation tâches, debrief visites, relances)
├── visites.html                # Gestion des visites — Vue groupée par bien, visiteurs libres, feedback, promotion en acquéreur
├── reset-password.html         # Réinitialisation mot de passe (redirige vers home.html)
├── pipeline-acquereurs.html    # ⚠️ DEPRECATED — ancien fichier à nettoyer
│
├── js/
│   ├── supabase-config.js      # Client Supabase + utilitaires partagés
│   ├── auth.js                 # Guard d'authentification + profil header
│   ├── workflows.js            # Définitions workflows + gestion des étapes
│   ├── relance-widget.js       # Widget flottant des relances (cloche)
│   ├── todo-widget.js          # Widget to-do avec dictée vocale
│   ├── gamification.js         # ⚠️ GELÉ — Système de points (retiré de parametres.html)
│   ├── audio-recorder.js       # Enregistrement micro + détection silence
│   ├── onboarding.js           # Tour guidé première utilisation
│   ├── social.js               # Logique calendrier social + IA
│   ├── mobile-nav.js            # Bottom navigation mobile + menu "Plus..." (injecté dynamiquement)
│   ├── touch-drag-drop.js      # Polyfill tactile drag & drop pour iPad (tablettes >= 768px)
│   └── maps-config.js          # Clé API Google Maps
│
├── api/                        # Vercel Serverless Functions
│   ├── _auth.js                # Helper auth partagé (verifyAuth + withCORS + getSupabaseAdmin)
│   ├── transcribe.js           # Transcription audio → texte (OpenAI Whisper)
│   ├── parse-lead.js           # Extraction données structurées d'une dictée (Claude)
│   ├── parse-import-batch.js   # Parsing import Excel/CSV de contacts
│   ├── generate-message.js     # Génération SMS/WhatsApp/Email contextuel (Claude)
│   ├── generate-social-post.js # Génération contenu réseaux sociaux (Claude)
│   ├── inbound-email.js         # Webhook Mailgun : emails portails → visit_requests (Claude Haiku)
│   ├── analyze-document.js     # Analyse de documents PDF
│   ├── parse-voice-note.js     # Parsing notes vocales
│   ├── map-columns.js          # Mapping colonnes pour imports
│   ├── scrape-listing.js       # Scraping d'annonces immobilières
│   ├── generate-study.js       # Génération étude de marché IA (2 passes Claude Sonnet, prompt adaptatif densité)
│   ├── google-auth.js           # OAuth Google Calendar (POST=init nonce, GET=callback tokens)
│   └── assistant.js             # Assistant unifié (orchestrate, draft_message, parse_workflow_response, calendar CRUD, visit requests)
│
├── assistant.html              # Assistant organisationnel IA (agenda + messages)
│
├── sql/
│   ├── 001_workflow_steps.sql  # Migration table workflow_steps + RLS + indexes
│   ├── 002_user_integrations.sql # Migration tables user_integrations + oauth_states
│   ├── 009_gamification.sql    # Migration tables gamification_log + gamification_profiles
│   ├── 010_gamification_monthly.sql  # ALTER TABLE : ajout monthly_points + month_year
│   ├── 011_sellers_rooms.sql   # ALTER TABLE : ajout champ rooms sur sellers (T1-T5+)
│   └── 012_visit_requests.sql # Table visit_requests + colonnes inbound_email sur user_integrations
│
├── img/
│   ├── Logo_leon.svg           # Logo vectoriel
│   ├── logo_200.png            # Logo header (toutes pages)
│   ├── F.png                   # Logo Open Graph
│   └── ORIGINALES/             # Assets design originaux
│
├── docs/                       # Documentation vivante
│   ├── ARCHITECTURE.md         # Ce fichier
│   ├── DECISIONS.md            # Journal des choix techniques
│   ├── CHANGELOG.md            # Historique horodaté des modifications
│   └── API-MAP.md              # Cartographie des endpoints et APIs
│
├── tasks/                      # Gestion des tâches
│   ├── todo.md                 # Plan & suivi des tâches en cours
│   └── lessons.md              # Erreurs passées & règles apprises
│
├── scripts/                    # Scripts data pipeline (Python)
│   ├── extract-dpe-from-dump.py  # Extraction DPE depuis dump ADEME SQL (63 Go)
│   ├── generate-dpe-json.py      # DPE CSV → JSON par département
│   ├── download-dpe-ademe.py     # Téléchargement DPE depuis API ADEME
│   ├── upload-dpe-storage.py     # Upload JSON DPE → Supabase Storage
│   ├── generate-dvf-json.py      # DVF CSV → JSON par département
│   └── upload-dvf-storage.py     # Upload JSON DVF → Supabase Storage
│
├── vercel.json                 # Config Vercel (timeout functions, headers micro)
├── package.json                # Dépendances : @supabase/supabase-js, busboy
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
| IA           | Anthropic Claude Haiku (parsing, génération) + OpenAI Whisper (transcription) |
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
  └── Claude Haiku extrait un JSON structuré (nom, tel, adresse, budget…)
    │
    ▼
INSERT dans `sellers` ou `buyers` (Supabase)
    │
    ▼
Rendu carte Kanban + Création workflow_steps associés
```

### 3.2 Import lead depuis capture d'écran / texte (acquéreurs)

```
Utilisateur fait une capture d'écran (SeLoger, LBC, Jinka, Efficity...)
    │
    ▼
Bouton "Import" dans header acquéreurs → Modal d'import
  ├── Onglet Image : Cmd+V (clipboard), drag & drop, ou file picker (mobile)
  └── Onglet Texte : collage de texte brut
    │
    ▼
Compression image (compressImage, 1600px, JPEG 80%)
    │
    ▼
POST /api/analyze-document { mode: 'screenshot_import', leadType: 'buyer', image?, text? }
  └── Claude Haiku Vision : détection plateforme + extraction JSON structuré
      (first_name, last_name, email, phone, property_type, rooms, sector,
       surface_min, budget_max, criteria, source, source_platform, notes)
    │
    ▼
Modal import se ferme → Modal création acquéreur s'ouvre pré-rempli
  └── Animation flash sur chaque champ rempli
    │
    ▼
Utilisateur vérifie/corrige → Créer l'Acquéreur → INSERT `buyers`
```

### 3.3 Création de lead depuis note vocale (micro)

```
Utilisateur dicte une note vocale (ex: "Note pour Elsa Martin, T3 Lyon budget 300k")
    |
    v
AudioRecorder -> POST /api/transcribe -> transcript texte
    |
    v
POST /api/parse-voice-note { transcription, leads: [...], today }
  |-- Claude Haiku identifie les contacts mentionnés
  |-- Match contre les leads existants (sellers + buyers)
  |-- Classement : matched / ambiguous / unmatched
    |
    v
MATCHED -> note ajoutée au lead existant (INSERT lead_notes + UPDATE reminder)
AMBIGUOUS -> choix utilisateur parmi les suggestions
UNMATCHED -> Carte de création avec données extraites
    |
    v
Carte "Nouveau contact" (micro.html - showNoMatch)
  |-- Affiche : nom, budget, type de bien, secteur, critères en tags
  |-- Boutons : "Acquéreur" / "Vendeur"
    |
    v
createNewLeadFromMicro(contact, leadType)
  |-- INSERT dans `buyers` ou `sellers` (Supabase)
  |-- contact_date = aujourd'hui
  |-- INSERT transcription comme première note (lead_notes)
    |
    v
Confirmation + lien vers la fiche créée
```

**Différence avec le flux pipeline (3.1)** :
- Le flux micro est conçu pour le terrain (mobile, quick in/out)
- Le parsing vocal identifie les contacts dans du texte libre (pas un formulaire structuré)
- `unmatched_contacts` retourne des objets structurés (nom, budget, type, secteur, critères)
- La création est directe (pas de formulaire intermédiaire)

### 3.4 Pipeline vendeurs mobile (card deck)

```
Chargement index.html (mobile, <= 768px)
    │
    ▼
loadSellers() — Supabase query
    │
    ▼
renderSellers() → renderMobileCardDeck()
  ├── Filtre sellers par tab actif (mobileActiveTab)
  ├── Auto-sélection du premier tab avec des leads si courant vide
  ├── Lazy render : ±2 cartes autour de l'index courant
  └── Indicateur de position (N/M)
    │
    ▼
Navigation : swipe gauche/droite (initDeckSwipe)
  ├── Seuil : 50px ou vélocité 0.3px/ms
  ├── Rubber-band aux extrémités
  └── navigateDeck(±1) → re-render
    │
    ▼
Tap carte → openMobileDetail(sellerId)
  ├── Bottom sheet slide-up (92vh max)
  ├── Sections : bien, contact, mandat, concurrent, notes, commission
  ├── Actions : Modifier, Déplacer, Supprimer
  └── Fermeture : swipe-down (seuil 120px) ou tap backdrop

État persisté : localStorage (tab + index)
Couleurs colonnes : COLUMN_COLORS (8 statuts → hex)
```

### 3.5 Déplacement de fiche (drag-and-drop)

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

### 3.6 Génération de messages IA

```
Clic "Générer message" sur une étape workflow
    │
    ▼
Sélection : canal (SMS / WhatsApp / Email) + scénario
    │
    ▼
POST /api/generate-message { channel, scenario, leadData, leadType }
  └── Claude Haiku génère un message contextuel adapté au canal
    │
    ▼
Affichage dans modale → copie manuelle par l'utilisateur
```

### 3.7 Système de relances

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

### 3.8 To-do list

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

### 3.9 Contenu social

```
Utilisateur choisit "J'ai un truc à raconter" ou sélectionne un template
    │
    ▼
(si vocal) POST /api/transcribe → transcript
    │
    ▼
POST /api/generate-social-post { mode, platform, user_input }
  └── Claude Haiku génère hook + contenu + recommandation visuelle
    │
    ▼
INSERT dans `social_posts` (Supabase)
    │
    ▼
Affichage dans calendrier social avec historique
```

### 3.10 Carte DVF + DPE

```
Chargement dvf.html
    │
    ▼
Google Maps initialisé (maps-config.js)
    │
    ├── DVF (actif par défaut) ──────────────────────────────────────
    │     Recherche adresse → geocode → centre + rayon
    │         │
    │         ▼
    │     Fetch index.json (Supabase Storage bucket dvf-data)
    │       → Sélection départements par intersection bbox/rayon
    │         │
    │         ▼
    │     Fetch {dept}.json → filtrage local (année, type, prix, surface)
    │       → Clustering par parcelle (même coordonnées)
    │       → MarkerClusterer (@googlemaps/markerclusterer CDN)
    │       → Markers couleur par prix/m² + InfoWindow détaillée
    │           ├── Single-sale : type, surfaces (bâtie + terrain pour maisons),
    │           │   prix, prix/m², date, distance, bouton Sélectionner
    │           └── Multi-sale : liste dépliable par vente (chevron → détail inline)
    │
    │     Sélection de ventes (étude de marché) :
    │       → Panel flottant droite (max 20 ventes)
    │       → Suppression individuelle ou globale
    │       → Export CSV (séparateur ;, BOM UTF-8)
    │
    └── DPE (inactif par défaut) ────────────────────────────────────
          Activation toggle → Fetch index.json (bucket dpe-data)
            │
            ▼
          Fetch {dept}.json (ou {dept}_1.json + {dept}_2.json si splittés)
            → Filtrage : classe DPE (A-G), DPE récents (3/6/12 mois)
            → Markers couleur par classe énergie
            → InfoWindow : badge DPE, type, surface, conso, GES
              └── Section dépliable : adresse (reverse geocoding si absente),
                  complément (étage/porte), date DPE, alerte passoire
```

**Pipeline de données DPE** :
```
Dump ADEME (63 Go gzip SQL)
    │
    ▼
scripts/extract-dpe-from-dump.py
  └── Streaming single-pass, filtre date >= 2022, desactive = false
  └── Croise 5 tables : dpe, caracteristique_generale, emission_ges, ep_conso, geolocalisation
    │
    ▼
96 fichiers JSON par département + index.json
  Format compact : [dpe_class, ges_class, conso, ges, surface, type, year, postal, lng, lat, date, addr, complement]
    │
    ▼
scripts/upload-dpe-storage.py → Supabase Storage (bucket dpe-data, public)
  └── Départements > 50 Mo splittés (index.json contient clé "splits")
```

### 3.11 Demandes de visite portails (email forwarding)

```
Agent reçoit un email portail (SeLoger, LeBonCoin, BienIci, PAP...)
    │
    ├── Règle de transfert auto (Gmail/Outlook)
    │
    ▼
romain-a1b2@inbound.avecleon.fr (Mailgun Inbound Parse)
    │
    ├── POST webhook multipart/form-data
    │
    ▼
POST /api/inbound-email
  ├── 1. Vérification signature HMAC SHA256 Mailgun
  ├── 2. Résolution agent : recipient → user_integrations.inbound_email
  ├── 3. Déduplication : UNIQUE(user_id, email_message_id)
  ├── 4. Claude Haiku : extraction structurée (nom, tél, email, adresse, portail)
  ├── 5. Matching sellers par adresse (waterfall : adresse > type+prix)
  └── 6. INSERT visit_requests (status: pending)
    │
    ▼
visites.html — Bandeau "Nouvelles demandes"
  ├── Affichage : portail, nom visiteur, téléphone, bien matché
  ├── Actions : "Planifier la visite" → process_visit_request(accept)
  │             "Ignorer" → process_visit_request(dismiss)
  └── Stats par bien dans les accordéons : contacts / traités / visités
```

**Configuration agent** (parametres.html) :
1. Adresse inbound générée automatiquement (prénom-token@inbound.avecleon.fr)
2. L'agent crée une règle de transfert dans sa messagerie

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
| `rooms`         | TEXT        | Nombre de pièces (`T1`, `T2`, `T3`, `T4`, `T5+`)        |
| `description`   | TEXT        | Description physique du bien                             |
| `annexes`       | TEXT[]      | `parking`, `cave`, `balcon`, `jardin`, `garage`, `piscine`, `ascenseur` |
| `status`        | TEXT        | `hot` \| `warm` \| `cold` \| `off_market` …             |
| `source`        | TEXT        | `boitage` \| `recommandation` \| `pige` \| `siteimmo` \| `efficity` \| `internet` \| `ancien_client` \| `acquereur` \| `autre` |
| `referrer_name` | TEXT        | Nom du recommandant (si source = recommandation)         |
| `notes`         | TEXT        | Notes relationnelles / commerciales                      |
| `reminder`      | DATE        | Date de prochaine relance                                |
| `appointment_date` | DATE     | Date du RDV physique vendeur (auto-relance J+15)         |
| `contact_date`  | DATE        | Date du premier contact                                  |
| `mandate_start_date` | DATE   | Date de début du mandat                                  |
| `last_activity_at` | TIMESTAMPTZ | Dernière activité enregistrée                         |
| `position`      | INT         | Ordre dans la colonne du pipeline                        |
| `created_at`    | TIMESTAMPTZ | Date de création                                         |
| `estimated_works` | NUMERIC   | Estimation travaux (€) — impacte le matching budget      |
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
| `rooms`         | NUMERIC     | Nombre de pièces souhaitées                              |
| `surface_min`   | NUMERIC     | Surface minimum souhaitée (m²)                           |
| `budget_min`    | NUMERIC     | Budget minimum (EUR)                                     |
| `budget_max`    | NUMERIC     | Budget maximum (EUR)                                     |
| `status`        | TEXT        | `nouveau` \| `actif` \| `achete_avec_moi`               |
| `source`        | TEXT        | `site_annonce` \| `efficity` \| `recommandation` \| `appel_entrant` \| `reseaux_sociaux` \| `autre` |
| `criteria`      | TEXT        | Critères de recherche détaillés                          |
| `dealbreakers`  | TEXT        | Critères éliminatoires                                   |
| `notes`         | TEXT        | Notes                                                    |
| `reminder`      | DATE        | Date de prochaine relance                                |
| `contact_date`  | DATE        | Date du premier contact                                  |
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

### Table `social_profiles`

| Colonne            | Type      | Description                                  |
|--------------------|-----------|----------------------------------------------|
| `user_id`          | UUID (FK) | Référence `auth.users(id)`                   |
| `platform`         | TEXT      | Plateforme principale                        |
| `neighborhoods`    | TEXT      | Quartiers / zones d'activité                 |
| `network`          | TEXT      | Type de réseau                               |
| `tone`             | TEXT      | Ton de communication                         |
| `tutoiement`       | BOOLEAN   | Tutoyer ou vouvoyer                          |
| `signature_phrases`| TEXT      | Expressions signatures                       |
| `objectives`       | TEXT      | Objectifs de contenu                         |

### Table `social_posts`

| Colonne       | Type        | Description                              |
|---------------|-------------|------------------------------------------|
| `id`          | UUID (PK)   | Identifiant unique                       |
| `user_id`     | UUID (FK)   | Référence `auth.users(id)`               |
| `platform`    | TEXT        | linkedin / instagram / facebook / tiktok |
| `content`     | TEXT        | Contenu du post                          |
| `hook`        | TEXT        | Accroche d'ouverture                     |
| `hook_pattern`| TEXT        | Type de pattern d'accroche               |
| `status`      | TEXT        | Statut du post                           |
| `generated_at`| TIMESTAMPTZ | Date de génération                       |
| `template_id` | TEXT        | Template utilisé                         |
| `category`    | TEXT        | Catégorie de contenu                     |
| `source_type` | TEXT        | Source (free_input / suggestion)         |

### Table `visits`

Liaison acquéreur ↔ vendeur pour le suivi des visites de biens.
Visible dans l'onglet Matching des deux fiches (vendeur et acquéreur).

| Colonne            | Type        | Description                                          |
|--------------------|-------------|------------------------------------------------------|
| `id`               | UUID (PK)   | Identifiant unique                                   |
| `user_id`          | UUID (FK)   | Référence `auth.users(id)`                           |
| `seller_id`        | UUID (FK)   | Référence `sellers(id)` — le bien visité             |
| `buyer_id`         | UUID (FK)   | Référence `buyers(id)` — l'acquéreur visiteur        |
| `buyer_name`       | TEXT        | Nom acquéreur (fallback texte libre, legacy)         |
| `visit_date`       | DATE        | Date de la visite                                    |
| `visit_time`       | TIME        | Heure de la visite (optionnel)                       |
| `status`           | TEXT        | `planifiee` / `effectuee` / `annulee`                |
| `feedback_rating`  | TEXT        | `coup_de_coeur` / `interessant` / `pas_convaincu` / `pas_du_tout` |
| `price_perception` | TEXT        | `adapte` / `un_peu_eleve` / `trop_eleve`             |
| `rating`           | INT         | Note de visite (legacy 1-5, remplacé par feedback_rating) |
| `notes`            | TEXT        | Observations libres                                  |
| `feedback`         | TEXT        | Retour de visite (legacy)                            |
| `created_at`       | TIMESTAMPTZ | Date de création                                     |
| `updated_at`       | TIMESTAMPTZ | Dernière modification                                |

### Table `lead_notes`

| Colonne      | Type        | Description                              |
|--------------|-------------|------------------------------------------|
| `id`         | UUID (PK)   | Identifiant unique                       |
| `user_id`    | UUID (FK)   | Référence `auth.users(id)`               |
| `lead_id`    | UUID (FK)   | Référence seller ou buyer                |
| `content`    | TEXT        | Contenu de la note                       |
| `created_at` | TIMESTAMPTZ | Date de création                         |

### Table `gamification_log`

| Colonne       | Type        | Description                                     |
|---------------|-------------|-------------------------------------------------|
| `id`          | UUID (PK)   | Identifiant unique                              |
| `user_id`     | UUID (FK)   | Référence `auth.users(id)`                      |
| `action_type` | TEXT        | Type d'action (`create_lead`, `add_note`, etc.) |
| `points`      | INT         | Points attribués (après multiplicateur)         |
| `multiplier`  | REAL        | 1.0 normal, 2.0 si bonus aléatoire             |
| `context`     | JSONB       | Métadonnées (lead_id, lead_type, etc.)          |
| `created_at`  | TIMESTAMPTZ | Date de l'événement                             |

### Table `gamification_profiles`

| Colonne           | Type        | Description                                  |
|-------------------|-------------|----------------------------------------------|
| `id`              | UUID (PK)   | Identifiant unique                           |
| `user_id`         | UUID (FK)   | Référence `auth.users(id)` (UNIQUE)          |
| `total_points`    | INT         | Score total cumulé                           |
| `current_streak`  | INT         | Jours consécutifs avec ≥3 actions            |
| `longest_streak`  | INT         | Record personnel de streak                   |
| `last_active_date`| DATE        | Dernière date avec ≥3 actions                |
| `level`           | INT         | Niveau (1-5)                                 |
| `actions_today`   | INT         | Compteur d'actions du jour                   |
| `today_date`      | DATE        | Date courante (reset quotidien)              |
| `monthly_points`  | INT         | Score du mois en cours (reset au 1er)        |
| `month_year`      | TEXT        | Mois courant "YYYY-MM" (détection reset)     |

### Table `visit_requests`

| Colonne              | Type          | Description                                          |
|----------------------|---------------|------------------------------------------------------|
| `id`                 | UUID (PK)     | Identifiant unique                                   |
| `user_id`            | UUID (FK)     | Référence `auth.users(id)`                           |
| `email_message_id`   | TEXT          | ID unique email pour déduplication                   |
| `email_from`         | TEXT          | Expéditeur (noreply@seloger.com, etc.)               |
| `email_subject`      | TEXT          | Objet du mail                                        |
| `email_date`         | TIMESTAMPTZ   | Date de réception                                    |
| `email_snippet`      | TEXT          | Extrait brut (debug/audit)                           |
| `portal_name`        | TEXT          | seloger, leboncoin, bienici, pap, etc.               |
| `visitor_name`       | TEXT          | Nom complet du visiteur                              |
| `visitor_first_name` | TEXT          | Prénom extrait                                       |
| `visitor_last_name`  | TEXT          | Nom extrait                                          |
| `visitor_phone`      | TEXT          | Téléphone du visiteur                                |
| `visitor_email`      | TEXT          | Email du visiteur                                    |
| `visitor_message`    | TEXT          | Message accompagnant la demande                      |
| `property_address`   | TEXT          | Adresse du bien concerné                             |
| `property_reference` | TEXT          | Référence annonce portail                            |
| `property_type`      | TEXT          | appartement, maison, etc.                            |
| `property_price`     | NUMERIC       | Prix du bien                                         |
| `matched_seller_id`  | UUID (FK)     | Référence `sellers(id)` — matching auto              |
| `match_confidence`   | TEXT          | high, medium, low, none                              |
| `status`             | TEXT          | pending, accepted, dismissed                         |
| `created_visit_id`   | UUID (FK)     | Référence `visits(id)` — visite créée si accepted    |
| `created_buyer_id`   | UUID (FK)     | Référence `buyers(id)` — acquéreur créé si accepted  |
| `parsed_data`        | JSONB         | Données brutes Claude pour debug                     |

**Contraintes** : UNIQUE(user_id, email_message_id), CHECK status IN (pending, accepted, dismissed)
**Index** : (user_id, status), (user_id, matched_seller_id), (user_id, created_at DESC)

### Colonnes ajoutées sur `user_integrations` (012)

| Colonne                    | Type    | Description                            |
|----------------------------|---------|----------------------------------------|
| `inbound_email`            | TEXT    | Adresse de transfert unique par agent  |
| `inbound_email_token`      | TEXT    | Token secret pour validation webhook   |
| `email_forwarding_active`  | BOOLEAN | Transfert actif ou non                 |

### Sécurité (RLS)

Toutes les tables ont **Row Level Security activé**. Politique commune :

```sql
CREATE POLICY "Users see own records" ON <table>
  FOR ALL USING (auth.uid() = user_id);
```

Chaque utilisateur ne voit et ne manipule que ses propres données.

### Supabase Storage

| Bucket      | Usage                                       | Accès    |
|-------------|---------------------------------------------|----------|
| `dvf-data`  | Fichiers JSON des ventes DVF par département | Public   |
| `dpe-data`  | Fichiers JSON des diagnostics DPE            | Public   |

---

## 5. Dépendances externes

### Librairies CDN (frontend)

| Librairie                | Version  | Usage                                  |
|--------------------------|----------|----------------------------------------|
| `@supabase/supabase-js`  | 2.97.0   | Client Supabase (DB + Auth)            |
| Google Fonts             | —        | Barlow Semi Condensed (titres), Inter (corps) |
| Font Awesome             | 6.5.1    | Icônes                                 |
| pdf.js                   | 3.11.174 | Lecture de PDF côté client              |

### Dépendances npm (backend)

| Package                  | Version | Usage                                  |
|--------------------------|---------|----------------------------------------|
| `@supabase/supabase-js`  | ^2.97.0 | Utilisé par les Vercel Functions (`api/`) |
| `busboy`                 | ^1.6.0  | Parsing multipart/form-data (Mailgun webhook) |

### APIs externes

| API                              | Usage                                            | Fichier(s) concerné(s)              |
|----------------------------------|-------------------------------------------------|-------------------------------------|
| **Supabase**                     | Base de données PostgreSQL, Auth, RLS, Storage   | `js/supabase-config.js`, toutes pages |
| **Google OAuth** (via Supabase)  | Authentification utilisateur                     | `login.html`, `js/auth.js`          |
| **Google Maps**                  | Cartographie (DVF, localisation)                 | `js/maps-config.js`, `dvf.html`     |
| **OpenAI Whisper**               | Transcription audio → texte (français)           | `api/transcribe.js`                 |
| **Anthropic Claude**             | Extraction données, génération messages/contenu  | `api/parse-lead.js`, `api/generate-message.js`, `api/generate-social-post.js`, `api/inbound-email.js`, etc. |
| **Mailgun Inbound Parse**        | Réception emails portails transférés (webhook)   | `api/inbound-email.js`              |
| **api-adresse.data.gouv.fr**     | Géocodage adresses françaises (gratuit)          | `js/supabase-config.js`             |
| **DVF (data.gouv.fr)**           | Données de ventes immobilières françaises         | `dvf.html`                          |
| **ADEME (DPE)**                  | Diagnostics de performance énergétique            | `dvf.html`                          |

### Variables d'environnement (Vercel)

| Variable            | Usage                              |
|---------------------|------------------------------------|
| `OPENAI_API_KEY`    | Transcription Whisper              |
| `ANTHROPIC_API_KEY` | Génération IA (Claude)             |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Validation signature webhook Mailgun |
| `SUPABASE_SERVICE_ROLE_KEY` | Client admin Supabase (OAuth, visit requests) |

> Les clés Supabase (URL + anon key) sont en dur dans `js/supabase-config.js` — c'est le standard pour les clients publics protégés par RLS.

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
- Gère le header mobile responsive (< 768px)

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

### `gamification.js`
Système de gamification dopaminergique — points, streaks, toasts, milestones.
- IIFE auto-exécutant (même pattern que todo-widget.js)
- Injecte ses propres styles CSS + éléments DOM (compteur header, toasts)
- Expose `window.awardPoints(actionType, context)` comme API globale
- 18 types d'actions gamifiées avec barème de points
- Bonus aléatoire x2 (10% de chance)
- Streak journalier (≥3 actions/jour) avec badge visuel
- Célébrations à 100, 500, 1000, 5000 points (overlay + confettis)
- Tables DB : `gamification_log` (audit) + `gamification_profiles` (agrégé)

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
| `index.html`         | supabase-config, auth, gamification, workflows, audio-recorder, relance-widget, todo-widget, onboarding |
| `acquereurs.html`    | supabase-config, auth, gamification, workflows, audio-recorder, relance-widget, todo-widget |
| `formulaire.html`    | supabase-config (pas d'auth — page publique)                                |
| `login.html`         | supabase-config                                                              |
| `social.html`        | supabase-config, auth, gamification, social, audio-recorder                  |
| `parametres.html`    | supabase-config, auth, gamification                                          |
| `micro.html`         | supabase-config, auth, gamification, audio-recorder                          |
| `dvf.html`           | supabase-config, auth, gamification, maps-config                             |
| `assistant.html`     | supabase-config, auth, gamification, audio-recorder                          |
| `home.html`          | supabase-config, auth, gamification                                          |
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
