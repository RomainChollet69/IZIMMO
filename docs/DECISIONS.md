# DECISIONS — Journal des choix techniques

> Chaque décision non triviale est documentée ici avec le contexte, les alternatives envisagées et le raisonnement.

---

## D001 — Frontend en vanilla JS (pas de framework)

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Choix de la stack frontend pour un CRM utilisé par des agents immobiliers.

**Décision** : HTML / CSS / JavaScript vanilla, sans React, Vue ni Angular.

**Pourquoi** :
- Déploiement instantané (fichiers statiques, pas de build step)
- Zéro dépendance frontend = pas de `npm install` côté client
- Les API modernes du navigateur (MediaRecorder, AudioContext, Fetch, Drag-and-Drop) sont utilisées directement
- La cible utilisateur (agents immobiliers) n'a pas besoin d'une SPA complexe
- Supabase JS est la seule lib nécessaire, chargée en CDN

**Alternatives rejetées** :
- **React** : Overhead de build, complexité inutile pour un projet sans routing dynamique
- **Vue** : Bonne option mais ajoute une couche d'abstraction non nécessaire
- **Next.js** : SSR inutile, les pages sont simples et l'auth est côté client

**Conséquences** :
- Code dupliqué entre `index.html` et `acquereurs.html` (pas de composants réutilisables)
- Fichiers HTML volumineux (8000+ lignes pour index.html)
- Pas de hot reload en développement

---

## D002 — Supabase comme backend (pas Firebase ni custom)

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Besoin d'une base de données relationnelle avec auth et sécurité par utilisateur.

**Décision** : Supabase (PostgreSQL + Auth + RLS + Storage).

**Pourquoi** :
- **Row Level Security (RLS)** : chaque utilisateur ne voit que ses données, sans logique applicative
- **PostgreSQL** : requêtes relationnelles complexes (joins sellers/buyers/workflows)
- **Auth intégré** : Google OAuth prêt à l'emploi
- **Storage** : hébergement des données DVF/DPE en JSON statique
- **Gratuit** pour les volumes actuels

**Alternatives rejetées** :
- **Firebase** : Firestore (document model) moins adapté aux données relationnelles ; RLS moins mature
- **Backend custom (Express/NestJS)** : Trop de code à maintenir pour une équipe réduite
- **PlanetScale / Neon** : Bons mais sans auth ni storage intégrés

---

## D003 — Google OAuth uniquement (pas d'email/password)

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Simplifier l'authentification pour des agents immobiliers peu techniques.

**Décision** : Connexion unique via Google OAuth, pas de formulaire email/mot de passe.

**Pourquoi** :
- Un seul clic pour se connecter (zéro friction)
- Google fournit automatiquement `avatar_url` et `full_name` (pas de formulaire de profil)
- Pas de gestion de mots de passe (reset, hashing, stockage)
- Sécurité déléguée à Google (2FA, détection fraude)
- Tous les agents ont un compte Google

**Conséquences** :
- Impossible de se connecter sans compte Google
- `reset-password.html` est un artefact inutilisé

---

## D004 — OpenAI Whisper pour la transcription (pas Google Speech-to-Text)

**Date** : Début du projet
**Statut** : Actif

**Contexte** : La dictée vocale est le mode de saisie principal — la qualité de transcription est critique.

**Décision** : OpenAI Whisper via API (`whisper-1`, langue forcée `fr`).

**Pourquoi** :
- Excellente qualité sur le français oral avec accents régionaux
- Ponctuation automatique (pas juste du texte brut)
- Coût prévisible (~0.006$/minute)
- `language=fr` optimise la reconnaissance sans ambiguïté

**Alternatives rejetées** :
- **Google Speech-to-Text** : Plus cher, quota complexe, dépendance Google supplémentaire
- **Web Speech API (navigateur)** : Qualité insuffisante, pas de support offline, résultats incohérents entre navigateurs

---

## D005 — Anthropic Claude Haiku pour l'IA (pas GPT-4)

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Extraction de données structurées depuis du texte libre + génération de messages contextuels.

**Décision** : Claude Haiku (`claude-haiku-4-5-20251001`) pour tous les endpoints IA.

**Pourquoi** :
- Excellent en extraction JSON structuré depuis du texte désordonné (dictée d'agent)
- Coût très bas (1/3 de GPT-3.5-turbo) pour des tâches de classification/génération
- Latence faible (< 2s pour la plupart des requêtes)
- Bon en français (vocabulaire immobilier, adresses, formats téléphone)
- Constitutional AI réduit les générations hors-sujet

**Alternatives rejetées** :
- **GPT-4** : 10x plus cher, overkill pour ces tâches
- **GPT-3.5-turbo** : Plus cher que Haiku, qualité comparable
- **LLMs locaux (Ollama/Llama)** : Nécessite un serveur GPU, qualité inférieure en français

---

## D006 — Vercel pour l'hébergement

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Héberger un site statique + des fonctions serverless avec CI/CD automatique.

**Décision** : Vercel avec déploiement auto depuis GitHub `main`.

**Pourquoi** :
- Push → deploy automatique (zéro CI/CD à configurer)
- Fichiers statiques + Serverless Functions dans un seul projet
- Variables d'environnement sécurisées (clés API jamais dans le code)
- Free tier suffisant pour le volume actuel
- CDN global pour les fichiers statiques

**Alternatives rejetées** :
- **AWS (S3 + Lambda)** : Complexité infrastructure disproportionnée
- **Netlify** : Similaire mais Functions moins matures que Vercel
- **Self-hosted** : Demande du DevOps (SSL, scaling, monitoring)

---

## D007 — Clés Supabase en dur dans le client

**Date** : Début du projet
**Statut** : Actif — c'est sûr

**Contexte** : La clé anon Supabase est visible dans `js/supabase-config.js`.

**Décision** : Garder les clés publiques en dur côté client.

**Pourquoi c'est sûr** :
- C'est le fonctionnement standard de Supabase (et Firebase)
- La clé `anon` est intentionnellement faible — toute la sécurité repose sur les politiques RLS
- Chaque table a `POLICY ... USING (auth.uid() = user_id)` → impossible d'accéder aux données d'un autre utilisateur
- La vraie clé (`SUPABASE_SERVICE_ROLE_KEY`) reste dans les variables d'environnement Vercel

---

## D008 — localStorage pour l'état UI non critique

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Certains états UI (ordre des todos, flag onboarding, dernière vue briefing) doivent persister.

**Décision** : Utiliser `localStorage` plutôt que la base de données.

**Données concernées** :
- `onboarding_pipeline_done` — tour guidé déjà vu
- `todo_order` — ordre personnalisé des tâches
- `lea_briefing_last_seen` — dernier briefing affiché

**Pourquoi** :
- Lecture instantanée (pas de round-trip réseau)
- Réduit les requêtes Supabase au chargement de page
- Ce ne sont pas des données métier critiques
- Un seul appareil par agent (pas besoin de sync multi-device)

---

## D009 — AudioRecorder en classe séparée

**Date** : Ajout de la dictée vocale
**Statut** : Actif

**Contexte** : L'enregistrement audio est utilisé sur 4+ pages différentes.

**Décision** : Encapsuler dans une classe `AudioRecorder` dans `js/audio-recorder.js`.

**Pourquoi** :
- Réutilisable : index.html, acquereurs.html, social.html, micro.html, todo-widget
- Machine à états claire : `idle` → `recording` → `transcribing` → `done`
- Configurable : `silenceTimeout`, `silenceThreshold`, `maxDuration`
- Testable indépendamment du DOM

---

## D010 — Workflows créés en totalité à l'avance (pas à la demande)

**Date** : Implémentation workflows
**Statut** : Actif

**Contexte** : Quand un lead change de statut, faut-il créer toutes les étapes d'un coup ou une par une ?

**Décision** : Toutes les étapes du workflow sont insérées en DB dès le changement de statut.

**Pourquoi** :
- L'agent voit immédiatement tout ce qu'il doit faire (checklist complète)
- Chaque étape a un `due_date` pré-calculé pour les rappels
- Audit trail : on sait ce qui était prévu même si des étapes sont sautées
- Requête simple pour le briefing matinal : `SELECT * FROM workflow_steps WHERE status='pending' AND due_date <= today`
- Si la définition du workflow change, les anciens leads gardent leurs étapes originales

**Alternative rejetée** :
- **Création à la demande** : Plus léger en DB mais impossible de planifier, pas d'audit trail

---

## D011 — api-adresse.data.gouv.fr (pas Google Geocoding)

**Date** : Début du projet
**Statut** : Actif

**Contexte** : Autocomplétion d'adresses françaises dans les formulaires.

**Décision** : API publique de l'État français.

**Pourquoi** :
- Totalement gratuit (service public)
- Optimisé pour les adresses françaises (codes postaux, noms de rues, communes)
- Aucune limite de requêtes
- Pas de tracking utilisateur
- Réponses rapides pour l'autocomplétion temps réel

**Alternative rejetée** :
- **Google Geocoding** : $5/1000 requêtes, overkill pour des adresses françaises

---

## D012 — pdf.js côté client (pas de traitement serveur)

**Date** : Ajout analyse de documents
**Statut** : Actif

**Contexte** : Les agents doivent pouvoir visualiser des PDF (diagnostics, mandats).

**Décision** : pdf.js chargé en CDN, rendu dans le navigateur.

**Pourquoi** :
- Affichage instantané sans upload
- Le PDF reste sur l'appareil de l'agent (confidentialité)
- Pas de coût serveur pour le parsing
- `api/analyze-document.js` n'est appelé que si l'agent veut extraire du texte via l'IA

---

## D013 — Pipeline asymétrique : 6 colonnes vendeurs vs 4 colonnes acquéreurs

**Date** : Architecture pipeline
**Statut** : Actif

**Contexte** : Le parcours vendeur et le parcours acquéreur ont des complexités différentes.

**Décision** : 6 colonnes pour les vendeurs, 4 pour les acquéreurs.

**Colonnes vendeurs** : Prospects → Chauds → Mandats → Vendus → Concurrents → Archives
**Colonnes acquéreurs** : Nouveaux → Actifs → Achetés avec moi → Archives

**Pourquoi** :
- La vente (côté vendeur) implique plus d'étapes : estimation → négociation → mandat → marketing → visites → offres → compromis
- L'achat est plus linéaire : profil → recherche → visite → offre
- Les agents ont besoin de plus de granularité côté vendeurs (gestion du stock)
- La colonne "Concurrents" est spécifique aux vendeurs (suivi des prix de la concurrence)

---

## D014 — Table `contacts` séparée pour l'autocomplétion

**Date** : Ajout autocomplétion
**Statut** : Actif

**Contexte** : Pré-remplir les formulaires avec des contacts connus.

**Décision** : Table dédiée `contacts` (name, phone, email) plutôt que recherche dans sellers + buyers.

**Pourquoi** :
- Requête plus rapide (table légère, 3 champs indexés)
- Un contact peut apparaître dans plusieurs fiches
- Prévu pour l'import VCF (carnet d'adresses téléphone)
- Pas de UNION entre sellers et buyers nécessaire

---

## D015 — Widgets flottants pour relances et todos

**Date** : Ajout relances et todos
**Statut** : Actif

**Contexte** : Les relances et la to-do list doivent être accessibles sans quitter le pipeline.

**Décision** : Panels flottants (slide-in droite) plutôt que pages séparées.

**Pourquoi** :
- Zéro changement de contexte (l'agent reste sur sa fiche en cours)
- Chaque widget est un fichier JS autonome (encapsulation CSS + HTML + logique)
- Mobile-friendly (FAB + panels plein écran)
- Extensible : facile d'ajouter d'autres widgets (matching, statistiques…)

---

## D016 — Google Calendar API directe (pas de librairie tierce)

**Date** : 2026-02-24
**Statut** : Actif

**Contexte** : L'assistant organisationnel de Léon a besoin de lire et écrire dans Google Calendar.

**Décision** : Appeler l'API Google Calendar v3 directement via fetch(), sans librairie tierce (googleapis, google-auth-library).

**Pourquoi** :
- Vercel Serverless Functions ont un cold start sensible à la taille des dépendances
- On n'utilise que 5 opérations Calendar (list, find_slots, create, update, delete)
- L'API REST Google Calendar est simple et bien documentée
- Le refresh token est géré manuellement (simple POST vers oauth2.googleapis.com/token)
- Zéro dépendance supplémentaire = déploiement plus rapide

**Alternatives rejetées** :
- **googleapis** npm package : 300+ MB de code, cold start +2s, overkill pour 5 endpoints
- **google-auth-library** : plus propre mais ajoute une dépendance pour 20 lignes de code

---

## D017 — assistant.html séparé de micro.html

**Date** : 2026-02-24
**Statut** : Actif

**Contexte** : L'assistant organisationnel (agenda, messages) et le mode micro (notes CRM vocales) sont deux features IA vocales.

**Décision** : Deux pages séparées avec liens croisés, pas une extension de micro.html.

**Pourquoi** :
- micro.html est le mode terrain (quick voice in/out, mobile-first, 1667 lignes stables)
- assistant.html est le mode bureau (conversationnel, multi-turn, consultation agenda)
- Les cas d'usage sont fondamentalement différents : dictée rapide vs dialogue structuré
- Séparation = zéro risque de régression sur micro.html
- Navigation fluide via tab bar et liens croisés

**Alternatives rejetées** :
- **Extension de micro.html** : trop risqué, fichier déjà dense, UX différente
- **Modal/panel dans micro.html** : écran trop petit sur mobile pour deux UX concurrentes

---

## D018 — Nonce CSRF pour OAuth Google Calendar (pas de token en state)

**Date** : 2026-02-24
**Statut** : Actif

**Contexte** : Le flux OAuth Google renvoie un paramètre `state` visible dans l'URL de callback.

**Décision** : Utiliser un nonce aléatoire stocké en base comme `state`, pas le Supabase access token.

**Pourquoi** :
- Le `state` est visible dans l'URL, les logs serveur, l'historique navigateur
- Y mettre un access token serait une fuite de credentials
- Le nonce sert de protection CSRF (standard OAuth 2.0)
- La table `oauth_states` fait le lien nonce → user_id côté serveur
- Nonces à usage unique (supprimés après le callback) et expirés après 15 min

---

## D020 — Card deck mobile dans index.html (pas de page séparée)

**Date** : 2026-02-25
**Statut** : Actif

**Contexte** : Le pipeline vendeurs mobile devait passer d'une liste verticale à un card deck style Tinder.

**Décision** : Modifier le rendu mobile DANS `index.html` plutôt que créer un fichier `mobile-vendeurs.html` séparé.

**Pourquoi** :
- Toute la logique métier est déjà dans index.html (load, create, edit, delete, move, workflows)
- Créer un fichier séparé dupliquerait ~3000+ lignes de JS
- Les changements CSS sont scopés sous `@media (max-width: 768px)` → zéro impact desktop
- Les nouvelles fonctions JS sont gated par `isMobile()` → zéro impact desktop
- Le pipeline Kanban desktop est caché sur mobile (`display: none !important`)
- Le card deck est caché sur desktop (`.mobile-card-deck { display: none; }`)

**Alternatives rejetées** :
- **Fichier `mobile-vendeurs.html` séparé** : duplication massive de code, maintenance double
- **CSS-only responsive** : impossible pour le swipe touch et le card deck

---

## D019 — Commission sur net vendeur (pas sur prix FAI)

**Date** : 2026-02-24
**Statut** : Actif

**Contexte** : Le calcul de commission `prix × taux%` revenait à prendre des honoraires sur les honoraires.

**Décision** : `commission = prix FAI - (prix FAI / (1 + taux/100))`. Fonctions centralisées `calcCommission()` et `calcRateFromAmount()` dans `supabase-config.js`.

**Pourquoi** :
- En immobilier, le taux de commission s'applique sur le net vendeur, pas sur le prix FAI
- Exemple : 200 000€ à 4% → commission = 7 692€ (pas 8 000€)
- La différence est significative sur les gros montants
- Label "TTC" sur tous les affichages (briefing + cartes + formulaire)

---

## D021 — DPE : extraction depuis le dump SQL (pas l'API ADEME)

**Date** : 2026-02-26
**Statut** : Actif

**Contexte** : L'API ADEME (data.ademe.fr) est limitée en volume et ne fournit pas toutes les données nécessaires (date du DPE, adresse, complément). Le dump PostgreSQL complet (63 Go) contient toutes les tables croisées.

**Décision** : Extraction single-pass via `extract-dpe-from-dump.py` depuis le dump SQL gzippé, en croisant 5 tables (dpe, caracteristique_generale, emission_ges, ep_conso, geolocalisation).

**Pourquoi** :
- L'API ADEME rate-limited (600 req/60s) = des jours pour 14M DPE
- Le dump contient les adresses (`ban_label`), compléments (étage/porte), et dates exactes
- Extraction complète en 45 min vs plusieurs jours via API
- Format compact (13 champs par DPE) pour un poids raisonnable (1.34 Go)

**Alternatives rejetées** :
- **API ADEME paginée** (`download-dpe-ademe.py`) : trop lent, données incomplètes
- **Import PostgreSQL local** : nécessite 100+ Go de disque et une instance PostgreSQL

---

## D022 — DPE : split des gros départements (pas d'augmentation de limite Supabase)

**Date** : 2026-02-26
**Statut** : Actif

**Contexte** : Le plan Supabase gratuit limite les fichiers Storage à 50 Mo. Le Nord (59) fait 52 Mo et Paris (75) fait 66 Mo.

**Décision** : Splitter les départements > 50 Mo en 2 fichiers (`{dept}_1.json`, `{dept}_2.json`). L'index.json contient une clé `splits` qui map les départements vers leurs fichiers. Le front-end charge les parties en parallèle et les merge.

**Pourquoi** :
- Pas de surcoût (reste sur le plan gratuit Supabase)
- Chargement parallèle des 2 parties = quasi aucun impact sur les perfs
- Seuls 2 départements sur 96 sont concernés
- Solution extensible si d'autres départements grossissent

**Alternatives rejetées** :
- **Passer au plan Supabase Pro** : 25$/mois pour un problème qui touche 2 fichiers
- **Compression gzip côté client** : complexité inutile, les fichiers non-splittés passent

---

## D023 — Images dans notes via Supabase Storage (pas base64 en DB)

**Date** : 2026-02-25
**Statut** : Actif

**Contexte** : Permettre de coller des captures d'écran dans les notes des fiches leads (utile lors de la pige immobilière).

**Décision** : Stocker les images dans le bucket Supabase Storage `lead-files` (sous-dossier `notes/`) et ajouter une colonne `image_url` (text) à la table `lead_notes` contenant le chemin Storage. Les images sont affichées via URL signée (1h d'expiration).

**Pourquoi** :
- Le bucket `lead-files` existe déjà pour les documents joints
- `compressImage()` (canvas JPEG 1600px, 70%) est déjà disponible — screenshots réduits à ~200-500 Ko
- Pas de bloat en DB : une URL texte vs des Mo de base64
- Les URLs signées garantissent la sécurité (pas d'accès public direct)

**Alternatives rejetées** :
- **Base64 dans le champ `content`** : Bloaterait la table `lead_notes`, ralentirait toutes les requêtes de notes
- **Table séparée `note_images`** : Over-engineering pour un besoin simple (1 image par note)
- **Bucket Storage séparé** : Inutile, le bucket `lead-files` gère déjà les fichiers par utilisateur

---

## D024 — Suppression de l'icône Paramètres du header

**Date** : 2026-02-25
**Statut** : Actif

**Contexte** : L'icône ⚙ dans le header poussait le bouton "Briefing" sur deux lignes et alourdissait visuellement la barre de navigation.

**Décision** : Supprimer l'icône des 7 pages. Les paramètres restent accessibles via le menu déroulant du profil utilisateur (`js/auth.js` → dropdown "Paramètres").

**Pourquoi** :
- Le header doit rester identique et léger sur toutes les pages
- Le lien vers les paramètres existe déjà dans le dropdown du profil
- Doublon = confusion UX

## D025 — Headers anti-cache pour HTML et JS (vercel.json)

**Date** : 2026-02-25
**Statut** : Actif

**Contexte** : Chrome iOS maintient un cache interne très agressif qui ne se vide pas avec les méthodes classiques (vidage cache/cookies, cache-busting). Après modification du code, les utilisateurs sur Chrome iOS voyaient toujours l'ancienne version.

**Décision** : Ajouter des headers `Cache-Control` dans `vercel.json` : `no-cache, no-store, must-revalidate` pour les fichiers HTML, `no-cache, must-revalidate` pour les fichiers JS. Plus meta tags anti-cache dans le `<head>` et cache-busting `?v=YYMMDD` sur les scripts locaux.

**Alternatives envisagées** :
- Service Worker avec stratégie network-first → trop complexe pour le projet
- ETags seuls → insuffisants, Chrome iOS les ignore parfois
- Redirect entre pages → effets de bord (casse l'accès aux pages redirigées)

**Pourquoi** :
- Les headers serveur sont la méthode la plus fiable côté réseau
- Les meta tags et cache-busting sont des filets de sécurité côté client
- Impact minime sur les performances (les fichiers sont petits, pas de CDN statique nécessaire)
- En dernier recours, les utilisateurs doivent supprimer/réinstaller Chrome sur iOS

---

## D026 — Visites dans l'onglet Matching (pas un onglet séparé)

**Date** : 2026-02-25
**Statut** : Actif

**Contexte** : Le système de visites acquéreur ↔ vendeur devait être accessible facilement. Deux options : un nouvel onglet "Visites" ou une section intégrée dans l'onglet Matching.

**Décision** : Les visites sont affichées directement dans l'onglet Matching, au-dessus des suggestions automatiques. Pas de 4ème onglet.

**Alternatives envisagées** :
- Onglet "Visites" séparé → plus de navigation, sépare la visite du contexte matching
- Section dans les notes → perd la structure (date, statut, feedback)

**Pourquoi** :
- Tout au même endroit : on voit les matchs ET les visites en cours dans la même vue
- Réduit les clics : pas besoin de changer d'onglet pour voir les visites
- Contexte préservé : en voyant les matchs automatiques, on voit aussi les visites déjà planifiées
- Le bouton "Planifier une visite" sur les cartes match crée un raccourci naturel

---

## D027 — ALTER TABLE visits (pas DROP/CREATE)

**Date** : 2026-02-25
**Statut** : Actif

**Contexte** : La table `visits` existait déjà avec des données (buyer_name texte, rating 1-5). La nouvelle version nécessite buyer_id FK, status, feedback_rating, price_perception.

**Décision** : ALTER TABLE pour ajouter les nouvelles colonnes, avec migration des données existantes.

**Pourquoi** :
- Préserve les visites déjà enregistrées
- `buyer_name` reste en fallback pour les anciens enregistrements sans `buyer_id`
- `rating` 1-5 est migré automatiquement vers `feedback_rating`
- Les CHECK constraints garantissent l'intégrité des nouvelles données

---

## D028 — Import screenshot fusionné dans analyze-document (pas de nouvel endpoint)

**Date** : 2026-02-26
**Statut** : Actif

**Contexte** : Nouvelle fonctionnalité d'import de lead depuis capture d'écran de plateformes immobilières. Le plan Vercel Hobby limite à 12 fonctions serverless, on était déjà à 12.

**Décision** : Ajouter un paramètre `mode: 'screenshot_import'` à `/api/analyze-document` plutôt que de créer un endpoint séparé.

**Pourquoi** :
- `analyze-document` fait déjà du Claude Vision sur des images — même infra technique
- Économise un slot de fonction serverless (critique sur Hobby plan)
- Le routage par `mode` est propre et extensible
- Les prompts sont spécialisés par mode (document vs screenshot) donc pas de compromis qualité

**Alternative rejetée** : Endpoint séparé `/api/extract-lead-from-screenshot` — créé puis supprimé car dépassait la limite de 12 fonctions Vercel Hobby

---

## D029 — Auto-relance basée sur appointment_date (pas de système d'alerte parallèle)

**Date** : 2026-02-26
**Statut** : Actif

**Contexte** : La consultante veut être alertée si aucun suivi n'est fait dans les 15 jours suivant un RDV vendeur. Le champ `rdv_done` (boolean) existe mais ne capture pas la date.

**Décision** : Ajouter une colonne `appointment_date DATE` à la table `sellers`. Quand elle est renseignée et qu'aucune relance manuelle n'existe, auto-calculer `reminder = appointment_date + 15 jours`. Le système de relances existant (followup-overdue, relance-widget.js) prend le relais automatiquement.

**Pourquoi** :
- Zéro nouvelle infrastructure (pas de cron, pas de nouveau widget, pas de nouvelle CSS)
- Réutilise le système de relances mature et déjà testé
- L'utilisateur peut toujours surcharger la relance manuellement
- Un seul champ DB supplémentaire
- Constante `DAYS_AUTO_REMINDER_AFTER_RDV = 15` facilement ajustable

**Alternative rejetée** : Système d'alertes parallèle avec badge dédié et panneau séparé — complexité disproportionnée, duplication de logique existante

---

## D030 — Création de lead directe depuis micro (pas de redirection vers le formulaire pipeline)

**Date** : 2026-02-28
**Statut** : Actif

**Contexte** : Quand l'utilisateur dicte une note vocale mentionnant un contact inconnu, le système doit proposer de créer un lead. Deux options : rediriger vers le formulaire pipeline (index.html / acquereurs.html) ou insérer directement depuis micro.html.

**Décision** : Création directe via `createNewLeadFromMicro()` dans micro.html. INSERT dans `buyers` ou `sellers` + ajout de la transcription comme première note (`lead_notes`). Pas de navigation vers une autre page.

**Pourquoi** :
- Le micro est utilisé sur le terrain (en voiture, entre deux visites) — changer de page casse le flux
- Les données essentielles sont déjà extraites par le parsing vocal (nom, budget, type, secteur, critères)
- L'utilisateur choisit juste "Acquéreur" ou "Vendeur" — un seul tap
- La fiche peut être complétée plus tard depuis le pipeline (informations manquantes)
- La transcription est automatiquement ajoutée comme note → contexte préservé

**Alternatives rejetées** :
- **Redirection vers le formulaire pipeline** : casse le flux mobile, perte du contexte vocal, 3+ taps supplémentaires
- **Pré-remplissage du formulaire via URL params** : fragile (encoding, longueur URL), nécessite de gérer le retour

---

## D031 — Parsing vocal : distinction contact à créer vs mention contextuelle

**Date** : 2026-02-28
**Statut** : Actif

**Contexte** : Le parsing de notes vocales via `/api/parse-voice-note` identifiait tous les noms propres comme des contacts potentiels. Problème : "J'ai visité le bien de Madame Dupont avec Monsieur Martin" créait un lead pour Dupont (propriétaire, simple mention) en plus de Martin (l'acquéreur, le vrai sujet).

**Décision** : Ajouter des règles de prompt explicites pour ne créer des leads (`unmatched_contacts`) que pour les contacts explicitement demandés dans la dictée. Les propriétaires, notaires, agents concurrents, etc. mentionnés en contexte sont ignorés.

**Pourquoi** :
- Réduit les faux positifs (leads inutiles créés par erreur)
- L'utilisateur n'a pas à rejeter des suggestions non pertinentes
- La logique métier est claire : "ajouter une note pour X" = X est un lead, "le bien de Y" = Y est un contexte
- Les objets structurés dans `unmatched_contacts` (au lieu de simples strings) permettent de pré-remplir la carte de création

**Conséquences** :
- `unmatched_contacts` retourne des objets `{ name, suggested_type, first_name, last_name, budget_max, ... }` au lieu de `["Nom"]`
- `max_tokens` augmenté à 1200 pour accommoder les réponses plus riches
- Le front-end (micro.html) gère les deux formats pour rétro-compatibilité

---

## D032 — Recherche leads côté client (pas de requête Supabase)

**Date** : 2026-02-28
**Statut** : Actif

**Contexte** : Besoin de chercher rapidement un lead dans le pipeline (par nom, ville, téléphone…). Deux approches possibles : filtrage côté serveur via Supabase `.ilike()`, ou filtrage côté client sur les données déjà chargées.

**Décision** : Filtrage côté client — on masque/affiche les cards DOM existantes en cherchant dans les arrays `sellers[]` / `buyers[]` déjà en mémoire. Pas de re-render, pas de requête réseau.

**Pourquoi** :
- Les données sont déjà entièrement chargées en mémoire (pas de pagination)
- Volume faible (< 500 leads par agent) — itération instantanée
- Zéro latence : résultats immédiats à chaque frappe
- Pas de dépendance réseau pour la recherche
- Implémentation simple : `show/hide` via `style.display`

**Alternatives rejetées** :
- Recherche serveur Supabase : latence inutile, les données sont déjà là
- Re-render complet : plus lourd, perte d'état des cards dépliées

**Conséquences** :
- `filterLeads()` / `filterBuyers()` cherchent dans les propriétés des objets (nom, adresse, téléphone, email, source)
- `updateCounts()` modifié pour compter les cards DOM visibles quand un filtre est actif
- Raccourci `Cmd+K` / `Ctrl+K` pour accès rapide

---

## D033 — InfoWindows Google Maps : styles inline obligatoires (pas de classes CSS)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : Les InfoWindows de la carte DVF avaient été refactorées pour utiliser des classes CSS (`.iw-*`) au lieu de styles inline. Résultat : le contenu apparaissait sans aucun style.

**Décision** : Utiliser exclusivement des styles inline dans le HTML des InfoWindows. Les classes CSS définies dans `<style>` ne fonctionnent pas de manière fiable dans les InfoWindows Google Maps.

**Pourquoi** :
- Google Maps injecte le contenu des InfoWindows dans un Shadow DOM ou un conteneur isolé
- Les règles CSS de la page parente ne sont pas héritées de façon fiable
- Les styles inline sont la seule méthode garantie pour styler le contenu d'une InfoWindow
- Seules les overrides `.gm-style-iw-*` (sur le conteneur externe) fonctionnent en CSS car elles ciblent le DOM créé par Google Maps lui-même

**Alternatives rejetées** :
- Classes CSS `.iw-*` : Ne fonctionnent pas (testées et échouées)
- Injection de `<style>` dans l'InfoWindow : Hacky et non garanti

---

## D034 — Sélection de ventes (pas de comparaison côte à côte)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : Le système de comparaison (max 3 biens côte à côte en tableau) a été implémenté mais jugé peu utile par l'utilisateur. Le vrai besoin : mettre de côté des ventes pendant l'exploration pour constituer une étude de marché.

**Décision** : Remplacer le système de comparaison par un système de sélection (panier). Panel flottant à droite avec les ventes bookmarkées, export CSV, suppression individuelle ou globale.

**Pourquoi** :
- L'agent explore la carte et repère des ventes intéressantes — il veut les "sauvegarder" sans perdre le contexte
- La comparaison tableau était rigide (max 3, même colonnes) et peu naturelle
- Le panier est extensible (max 20) et exportable vers Excel pour un rapport client
- Le bouton "Sélectionner" est intégré aux InfoWindows : zéro friction

**Alternatives rejetées** :
- Comparaison côte à côte (implémentée puis supprimée) : peu naturelle, limite à 3, UX lourde

---

## D035 — Gamification client-side (pas de server-side validation)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : Ajout d'un système de points pour motiver les agents immobiliers à utiliser le CRM.

**Décision** : Les points sont calculés côté client et écrits directement en DB via Supabase. Pas de validation serveur.

**Pourquoi** :
- C'est un outil de motivation, pas une monnaie — la triche n'a aucun impact business
- Chaque `awardPoints()` est appelé après un succès DB réel (l'action a bien eu lieu)
- Simplicit maximale : pas de serverless function supplémentaire
- Pattern cohérent avec le reste du projet (tout est client-side)

**Alternatives rejetées** :
- **Edge Function** pour valider les points : overhead inutile, latence ajoutée, complexité sans bénéfice
- **Trigger PostgreSQL** sur les tables : couplage fort, difficile à maintenir, pas de feedback UI immédiat

---

## D036 — Module IIFE autonome pour la gamification (pas de modification du header HTML)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : Le compteur de points et le badge streak doivent apparaître dans le header de toutes les pages.

**Décision** : Le module `js/gamification.js` injecte dynamiquement ses éléments DOM et ses styles CSS, sans modifier le HTML statique des 8 pages.

**Pourquoi** :
- Un seul fichier à maintenir au lieu de 8 HTML
- Pattern identique à `todo-widget.js` et `relance-widget.js` (cohérence)
- Le compteur s'insère avant `.header-separator` — position cohérente sur toutes les pages
- Les styles CSS sont encapsulés dans le module (pas de pollution du CSS global)

---

## D037 — Page d'accueil HOME comme cockpit (pas de landing directe sur le pipeline)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : L'utilisateur arrivait directement sur le pipeline vendeurs (index.html) sans vision globale des modules disponibles.

**Décision** : Créer `home.html` comme point d'entrée principal avec 7 tuiles métiers. Tous les logos et redirections login pointent vers `home.html`.

**Pourquoi** :
- Donne une vision globale de l'écosystème Léon en 1 seconde
- Réduit le temps de découverte des modules (social, assistant, paramètres…)
- Sert de tableau de bord quotidien — le conseiller sait où aller dès l'ouverture
- Prépare le terrain pour un contexte personnalisé futur (relances du jour, leads urgents)

**Alternatives rejetées** :
- **Dashboard chiffré** : Trop complexe pour la V1, les métriques ne sont pas encore consolidées
- **Rester sur index.html** : L'app reste une "collection de pages" sans cohérence

**Navigation** : Le logo sur toutes les pages ramène à `home.html`. Pas d'onglet "Accueil" dans la nav des autres pages (le logo suffit).

---

## D038 — System prompt retour visite avec exemples réels (few-shot)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : Le premier essai de génération de message retour de visite produisait un texte très "IA" — formules creuses, listes à puces, ton corporate. L'utilisateur a fourni 3 exemples de ses vrais messages aux vendeurs.

**Décision** : Créer un system prompt dédié pour le scénario `retour_visite` (comme `redaction_annonce` et `repositionnement_prix`), avec les vrais messages de l'agent comme exemples de ton à imiter. Interdiction explicite des formules IA.

**Pourquoi** :
- Le few-shot avec de vrais exemples est le moyen le plus efficace de calibrer le ton
- Les interdictions explicites ("INTERDIT : suite à la visite de votre bien") sont plus fiables que les instructions vagues
- Le style narratif ("tu RACONTES") produit des messages naturels vs les listes structurées

**Alternatives rejetées** :
- **Prompt générique** : Produisait du texte corporate malgré les instructions "sois naturel"
- **Post-processing** : Trop fragile, mieux de bien cadrer en amont

---

## D039 — Popup tu/vous avant génération (pas de toggle inline)

**Date** : 2026-03-01
**Statut** : Actif

**Contexte** : Le choix tutoiement/vouvoiement est nécessaire car l'agent tutoie certains clients. D'abord implémenté en boutons inline dans la barre de canal, jugés trop discrets et encombrants.

**Décision** : Popup modale "Tu ou vous ?" qui apparaît à chaque clic "Générer". Deux gros boutons. Clic hors popup = annulation.

**Pourquoi** :
- Ne surcharge pas l'UI (pas de boutons permanents)
- Force le choix conscient à chaque génération
- Pas de risque d'oubli (vs un toggle qu'on oublie en position "tu")

**Alternatives rejetées** :
- **Boutons inline** : Quasi-invisibles, surchargent la barre canal, testés et rejetés par l'utilisateur

---

## D040 — Prompt retour_visite séparé buyer/seller (pas un prompt unique)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Le scénario `retour_visite` avait un seul system prompt, conçu pour le vendeur (narration de la visite). Or côté acquéreur, l'usage est très différent : on demande au buyer son ressenti, on ne raconte pas la visite.

**Décision** : Séparer en deux prompts distincts selon `leadType` :
- `isRetourVisiteSeller` : prompt narratif existant (few-shot avec 3 exemples réels d'agent)
- `isRetourVisiteBuyer` : prompt court et direct, demande le ressenti, mentionne le bien visité (ville/type via `customPrompt`)

**Pourquoi** :
- L'intention est opposée : raconter (vendeur) vs demander (acquéreur)
- Le prompt vendeur avec des exemples de 5 lignes narratives ne convient pas pour un SMS de 2 phrases à un acquéreur
- Le contexte visite (ville, type de bien) est passé via `customPrompt` depuis le popup, ce qui personnalise le message

**Alternatives rejetées** :
- **Un seul prompt avec branchement** : Trop complexe, le style demandé est radicalement différent

---

## D041 — Bouton retour visite sur la carte (pas via l'onglet Messages IA)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Pour demander un retour de visite à un acquéreur, l'utilisateur devait aller dans l'onglet Messages IA, choisir le scénario "Retour visite", et le message généré n'avait aucun contexte sur le bien visité.

**Décision** : Bouton `💬 Demander un retour` directement sur la carte de visite effectuée, dans l'onglet Matching. Popup dédié avec sélection canal + génération + ouverture auto de l'appli.

**Pourquoi** :
- Le contexte de la visite (bien, ville, type) est disponible sur la carte → injecté automatiquement dans le prompt
- Raccourcit le parcours utilisateur : 1 clic au lieu de changer d'onglet + chercher le scénario
- L'ouverture automatique de l'appli (SMS/WhatsApp/Email) après génération évite un clic supplémentaire
- Le scénario via Messages IA reste disponible pour les cas où l'utilisateur n'a pas de visite liée

## D042 — Étude de marché : 2 passes Claude Sonnet (pas un seul appel)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : L'étude de marché nécessite à la fois des calculs statistiques précis (prix/m², comparables, estimation) et une rédaction narrative de qualité professionnelle.

**Décision** : Architecture en 2 passes séquentielles via Claude Sonnet (`claude-sonnet-4-20250514`) :
- **Passe 1** : Analyse structurée → JSON strict (comparables, stats, estimation chiffrée)
- **Passe 2** : Rédaction narrative → HTML (présentation, marché, estimation argumentée, recommandation)

**Pourquoi** :
- Un seul appel "calcule ET rédige" produit des hallucinations sur les chiffres (constaté en tests)
- La séparation garantit la fiabilité : la passe 2 reçoit les vrais chiffres de la passe 1
- Claude Sonnet plutôt que Haiku : la qualité narrative est critique pour un document client (~0.15-0.30€/étude)
- Les données DVF/DPE sont collectées côté client (même pattern que dvf.html) puis envoyées à l'API

**Alternatives rejetées** :
- **Un seul appel** : Hallucinations fréquentes sur les chiffres quand on demande calculs + rédaction
- **Claude Haiku** : Qualité narrative insuffisante pour un rapport remis au vendeur
- **Streaming (SSE)** : Inconsistant avec le reste du codebase (tous les endpoints sont batch), et l'étude produit du HTML structuré, pas du texte incrémental

## D043 — Collecte DVF/DPE côté client (pas côté serveur)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Pour l'étude de marché, il faut charger les données DVF et DPE du secteur.

**Décision** : Collecte côté client (même pattern que dvf.html), puis envoi des données filtrées à l'API.

**Pourquoi** :
- Les données DVF/DPE sont dans des buckets Supabase Storage publics → pas besoin d'auth serveur
- Le code de chargement existe déjà (dvf.html lignes 2070-2256) → copie directe
- Côté serveur, les fonctions Vercel ont un timeout de 60s — charger un département de 15 Mo prendrait trop de temps
- Le client peut cacher les données (loadedDepts) entre plusieurs études

---

## D044 — Landing page v2 : narration Apple-style (pas feature-list)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : La landing v1 (`landing.html`) listait les features avec tutoiement décontracté. Besoin d'un positionnement plus premium mettant en avant la dictée vocale et l'IA.

**Décision** : Nouvelle page `landing-v2.html` avec narration émotionnelle en 8 actes, vouvoiement, typographie Barlow SC 800 comme élément de design principal.

**Pourquoi** :
- La v1 ressemblait à une page SaaS générique — pas de différenciation
- L'approche Apple (problème → révélation → preuve → désir) crée un arc émotionnel plus convaincant
- Le vouvoiement positionne Léon comme un outil professionnel, pas un side-project
- La typo géante + gradient text capte l'attention sans avoir besoin d'illustrations complexes
- Les mockups HTML/CSS (section 5) montrent le produit mieux qu'un screenshot statique

**Alternatives rejetées** :
- **Modifier la v1** : Trop de changements structurels, préférable de repartir de zéro
- **Framework landing (Framer, Webflow)** : Ajouterait une dépendance externe et casserait le workflow Vercel auto-deploy
- **Vidéo hero** : Pas encore de contenu vidéo produit, la typo seule est plus impactante pour l'instant

**Conséquences** :
- Deux fichiers landing coexistent temporairement (v1 et v2)
- 7 placeholders screenshots à remplacer par de vraies captures
- Le ton vouvoiement est différent du reste de l'app (tutoiement) — c'est volontaire pour le positionnement externe

---

## D045 — Cockpit Léon : priorisation client-side (pas de nouvel endpoint API)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Création d'un guide quotidien intelligent (`leon.html`) qui analyse les données CRM + Google Calendar pour proposer un parcours de tâches priorisées.

**Décision** : Le moteur de priorisation tourne côté client. Les données Supabase sont fetchées directement via `supabaseClient` et les événements Calendar via l'endpoint `/api/assistant` existant (`list_events`). Pas de nouvel endpoint API.

**Pourquoi** :
- Réutilise les patterns existants (toutes les pages fetchent Supabase côté client)
- Évite un nouvel endpoint Vercel à maintenir
- Le token Calendar est déjà géré par `/api/assistant` avec refresh automatique
- Les 8 requêtes en parallèle (`Promise.all`) chargent en < 1s
- La priorisation est déterministe (règles métier P1→P6), pas besoin d'IA

**Alternatives rejetées** :
- **Endpoint `/api/leon-cockpit`** : Aurait centralisé la logique mais ajouté un cold-start Vercel et de la complexité
- **IA (Claude) pour prioriser** : Overkill — les règles métier sont simples et prévisibles
- **Intégrer dans home.html** : Surchargerait la page d'accueil, mieux vaut une page dédiée

**Conséquences** :
- L'état de session est dans localStorage (éphémère, par jour, expire après 4h)
- Le matching Calendar → lead est approximatif (score nom + adresse) — acceptable car l'utilisateur peut corriger manuellement

---

## D046 — Paramètres étude en localStorage (pas Supabase)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Les études de marché doivent être personnalisables (logo, couleurs, signature, coordonnées). Où stocker ces préférences ?

**Décision** : Stockage dans `localStorage` sous la clé `leon_study_settings`. Logo en base64 compressé (400px max).

**Pourquoi** :
- Instantané (pas de requête réseau)
- Cohérent avec les autres prefs UI du projet (`leon_mobile_tab_sellers`, `onboarding_pipeline_done`)
- Un seul utilisateur par navigateur dans le use case cible
- Le logo compressé à 400px pèse ~20-50 Ko en base64, bien sous la limite localStorage (~5 Mo)

**Alternatives rejetées** :
- **Supabase** : Plus pérenne mais nécessite une table dédiée, un endpoint, et de la gestion de migration. À faire en V2 si multi-device devient critique
- **Cookie** : Trop petit (4 Ko), pas adapté pour un logo

**Conséquences** :
- Les settings sont par navigateur (pas synchronisés entre devices)
- Un clear de cache perd les settings → acceptable pour V1

---

## D047 — Photos du bien côté client uniquement (pas d'upload Supabase)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : L'étude de marché peut inclure des photos du bien. Où les stocker ?

**Décision** : Photos compressées (1200px, 75%) stockées en mémoire JS (`studyPhotos[]`) sous forme de base64. Pas de persistence — elles sont perdues au rechargement.

**Pourquoi** :
- Simplifie l'implémentation V1 (pas de Storage, pas de cleanup)
- Les photos ne sont utiles que le temps de la génération + export PDF
- L'export PDF via html2pdf.js inclut les images base64 directement
- Phase 2 prévue : envoi à Claude Vision pour analyse (~0.01€/étude)

**Alternatives rejetées** :
- **Supabase Storage** : Overkill pour des images éphémères — nécessite upload, URL signées, cleanup
- **IndexedDB** : Persistant mais complexe, pas nécessaire à ce stade

---

## D048 — Prompt IA adaptatif densité urbaine/rurale (pas de seuils fixes)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Les études de marché donnaient des résultats aberrants en zone rurale (médiane sur 1-2 ventes, variations de -51%, rayon trop restrictif).

**Décision** : Section "ADAPTATION À LA DENSITÉ DU MARCHÉ" dans le prompt d'analyse. L'IA adapte ses critères selon le volume de données reçu :
- Zone dense (>30 ventes) : rayon <500m, surface ±20%
- Zone intermédiaire (10-30) : rayon <1km, surface ±30%
- Zone rurale (<10) : rayon complet, surface ±50%

Côté front-end, le seuil minimum de ventes/an pour le graphe d'évolution est aussi adaptatif (2 si <15 ventes totales, 3 sinon).

**Pourquoi** :
- À Paris, 100m d'écart change le prix. En Creuse, les prix sont homogènes sur des km
- Un seuil fixe de 3 ventes/an éliminait toutes les données en zone rurale
- Laisser l'IA décider selon le volume est plus souple qu'un paramètre utilisateur

---

## D050 — Passe 1 Haiku + photos limitées à 3 (fix timeout 504)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : Après l'ajout de la Phase 3 (environnement), l'étude de marché dépassait systématiquement les 60s Vercel. 2 appels Claude Sonnet séquentiels + Vision (5 photos) + prompt environnement enrichi = 40-65s.

**Décision** :
1. Passe 1 (analyse JSON) migrée de Sonnet → Haiku (`claude-haiku-4-5`)
2. Photos Vision limitées à 3 au lieu de 5
3. DVF limité à 30 ventes au lieu de 50

**Pourquoi** :
- Haiku est 5-10× plus rapide pour du JSON structuré (3-5s vs 15-25s)
- La qualité d'analyse JSON de Haiku est suffisante (nombres, statistiques, catégorisation)
- 3 photos donnent assez de contexte visuel à Sonnet pour la rédaction
- 30 DVF suffisent pour une estimation fiable (médiane stabilisée à ~20 comparables)

**Alternatives envisagées** :
- Augmenter `maxDuration` Vercel → nécessite plan Pro, ne résout pas le fond
- Passer Passe 2 en streaming → complexité frontend importante pour gain marginal
- Tout en Haiku → perte de qualité rédactionnelle inacceptable

**Impact** : Budget temps estimé passe de 40-65s → 23-35s, marge confortable sous les 60s.

---

## D049 — Données environnement via Overpass + API Géo côté serveur (pas côté client)

**Date** : 2026-03-02
**Statut** : Actif

**Contexte** : L'étude de marché manquait de données concrètes sur l'environnement du bien (commerces, transports, écoles, espaces verts, bruit). L'utilisateur a demandé l'intégration de données INSEE/POI.

**Décision** : Fetch POI (Overpass API) et données communales (API Géo) **côté serveur** dans `api/generate-study.js`, **en parallèle avec la passe 1 Claude** via `Promise.all`. Les données sont injectées dans le prompt de la passe 2 et renvoyées au client pour affichage visuel.

**Pourquoi** :
- Overpass API n'a pas de headers CORS → appel client-side impossible
- L'exécution en parallèle avec la passe 1 (10-20s) ne rajoute aucun temps (Overpass: 1-3s, API Géo: 0.1-0.3s)
- Pas besoin d'un nouvel endpoint API, tout est intégré dans generate-study
- Dégradation gracieuse : si Overpass/API Géo échoue, l'étude se génère normalement sans la section

**Alternatives rejetées** :
- **Nouvel endpoint `/api/poi-data`** : complexité inutile, une requête en plus côté client
- **Appel client-side** : bloqué par CORS pour Overpass
- **INSEE Données Locales** : nécessite inscription et clé API, complexité disproportionnée

**APIs utilisées** :
- `https://overpass-api.de/api/interpreter` : POIs OpenStreetMap (commerces, transport, écoles, santé, parcs, routes/rail pour bruit)
- `https://geo.api.gouv.fr/communes` : nom, code INSEE, population, département, région

---

## D051 — Repositionnement Léon : assistant vocal, pas outil de data

**Date** : 2026-03-06
**Statut** : Actif

**Contexte** : Analyse stratégique déclenchée par un retour utilisateur réel ("c'est très très cool mais ça va faire beaucoup pour quelqu'un qui arrive demain"). L'analyse concurrentielle a révélé que Cadastre.com et Cityscoring proposent déjà des outils de data (DVF, DPE, scoring quartier, et même CRM en cours d'intégration pour Cityscoring). Léon s'était dispersé sur trop de surfaces : cockpit Léon, assistant agenda, pipeline, social, DVF/DPE, études de marché.

**Décision** : Repositionner Léon autour d'un concept unique et différenciant : **"Léon fait les choses à ta place"** (vs "Léon te montre des données"). Le cœur du produit devient la dictée vocale dans `micro.html`. Réorganisation en 3 surfaces :
- **Core** : micro.html (voix → action CRM), pipeline vendeurs, pipeline acquéreurs
- **Frozen** : DVF, DPE, études de marché, social (existants mais non prioritaires)
- **Archivé** : leon.html, assistant.html, pipeline-acquereurs.html, reset-password.html, bonmatin.html → `_archive/`

**Pourquoi** :
- Cadastre.com et Cityscoring dominent la data immobilière — se battre sur ce terrain est perdant
- La dictée vocale est une vraie différenciation : aucun CRM réseau (IADS, SAFTI) ne propose ça
- La complexité produit (13 pages actives) est une friction pour l'acquisition — un nouvel utilisateur doit comprendre le produit en 30 secondes
- La cible mandataires indépendants (IAD, SAFTI, Optimhome) a un CRM réseau imposé — Léon doit être un **complément d'action** rapide, pas un CRM de plus
- L'onboarding vocal sur micro.html réduit le "time to first value" à 1 interaction

**Cible** : Mandataires indépendants, ~10€/mois. Léon comme assistant de terrain — voix → lead créé en 10 secondes.

**Alternatives rejetées** :
- **Continuer l'expansion** (plus de features, plus de pages) : la complexité nuisait déjà à l'adoption
- **Pivoter vers la data** : terrain occupé par des acteurs établis avec bien plus de données
- **Supprimer DVF/études** : ces outils ont une vraie valeur — mieux vaut les geler que les supprimer

**Conséquences** :
- `home.html` redirige les mobiles vers `micro.html` (mobile redirect script)
- `micro.html` renommé "Vocal" dans tous les headers/titres
- `js/mobile-nav.js` : suppression des liens vers les pages archivées
- Onboarding overlay sur `micro.html` pour la première connexion (`leon_onboarded_v1` en localStorage)
- `js/gamification.js` supprimé de toutes les pages (feature non-core)
- `parametres.html` : suppression du lien vers assistant.html


---

## D011 — Requêtes DVF vocales via Nominatim + bucket Supabase

**Date** : 2026-03-09
**Statut** : Actif

**Contexte** : L'utilisateur veut interroger les données DVF par la voix ("Dis Léon, à combien se sont vendus les T3 à Tassin ?").

**Décision** : Geocoding via Nominatim (OpenStreetMap), données DVF pré-stockées dans un bucket Supabase Storage (`dvf-data`), filtrage côté client par distance (Haversine) et surface.

**Pourquoi** :
- Nominatim est gratuit et sans API key (vs Google Geocoding payant)
- Les données DVF sont déjà dans le bucket, pas besoin de requête API externe supplémentaire
- Le mapping pièces → surface (T3 = 50-80m²) est une approximation raisonnable pour le marché français

**Alternatives rejetées** :
- Google Geocoding API : payant, nécessite une clé
- Requête DVF en temps réel via API gouvernementale : lent et rate-limited

---

## D012 — Validation UUID pour dataset HTML

**Date** : 2026-03-09
**Statut** : Actif

**Contexte** : `element.dataset.someId = null` stocke la string `"null"` (pas `null`), ce qui passe les tests truthy JS et provoque des erreurs 400 Supabase (UUID invalide).

**Décision** : Validation explicite `isValidUUID(v)` avant tout insert Supabase utilisant des IDs provenant de `dataset`.

**Pourquoi** :
- Le DOM dataset convertit toute valeur en string — piège classique
- Un simple `|| null` ne suffit pas car `"null"` est truthy
- Mieux vaut valider à la sortie (avant insert) qu'espérer que l'entrée soit propre

---

## D054 — Touch drag & drop via polyfill tactile (pas de lib externe)

**Date** : 2026-03-10
**Statut** : Actif

**Contexte** : Le drag & drop HTML5 natif ne fonctionne pas sur iPad/tablettes tactiles. Les conseillers testant Léon sur iPad ne pouvaient pas déplacer les cartes entre colonnes.

**Décision** : Polyfill maison (`js/touch-drag-drop.js`) avec `touchstart`/`touchmove`/`touchend`, limité aux tablettes (>= 768px).

**Pourquoi** :
- Pas de dépendance externe (cohérent avec D001 — vanilla JS)
- Le code réutilise les fonctions existantes (`getDropPosition`, `showDropIndicator`)
- Long press (200ms) pour ne pas interférer avec le scroll
- Pas besoin sur smartphone (écran trop petit pour le Kanban multi-colonnes)

**Alternatives rejetées** :
- **mobile-drag-drop (polyfill CDN)** : Dépendance externe, comportement moins contrôlable
- **Sortable.js** : Librairie lourde, remplacerait tout le système DnD existant
- **Activation sur tous les écrans tactiles** : Inutile sur smartphone, risque de conflits avec le scroll

---

## D055 — Colonnes pipeline personnalisables : JSONB Supabase (pas extension du schéma sellers/buyers)

**Date** : 2026-03-10
**Statut** : Actif

**Contexte** : Les conseillers veulent pouvoir renommer, masquer et réordonner les colonnes de leurs pipelines vendeurs et acquéreurs. Les colonnes étaient hardcodées en HTML et JS.

**Décision** : Stocker la config d'affichage (labels, visibilité, ordre) dans une table `pipeline_configs` avec un champ JSONB, sans modifier les tables `sellers`/`buyers`. Module partagé `js/pipeline-config.js` qui charge/sauvegarde/fusionne config user + defaults.

**Pourquoi** :
- Zéro migration sur les tables métier — le champ `status` garde les mêmes valeurs
- JSONB flexible : forward-compatible pour le Niveau 2 (colonnes 100% custom)
- Module partagé réutilisable par les deux pipelines (vendeurs + acquéreurs)
- Config persiste cross-device (Supabase, pas localStorage)
- Fallback gracieux : si Supabase échoue, colonnes par défaut affichées

**Alternatives rejetées** :
- **localStorage** : Pas cross-device, perte de config si cache vidé
- **Colonnes dans user_integrations** : Couplage avec Google Calendar, pas extensible
- **Colonnes dynamiques en BDD (Niveau 2)** : Trop ambitieux pour le premier itération, risque de complexité prématurée

---

## D053 — FABs pipeline injectés via mobile-nav.js (pas dans le HTML des pages)

**Date** : 2026-03-10
**Statut** : Actif

**Contexte** : Les pipelines vendeurs/acquéreurs n'avaient aucun bouton "+" visible en mobile pour ajouter une lead. Il fallait aussi un bouton import screenshot sur le pipeline acquéreurs.

**Décision** : Injecter les FABs via `mobile-nav.js` (createElement + click delegation vers les boutons existants), avec SVG inline. Le bouton todo passe à gauche, les FABs pipeline à droite.

**Pourquoi** :
- Zéro modification dans `vendeurs.html` / `acquereurs.html` — tout est centralisé dans `mobile-nav.js`
- Les boutons existants (`addLeadBtn`, `addBuyerBtn`, `importScreenshotBtn`) sont déjà câblés — on délègue le click
- SVG inline évite des requêtes HTTP supplémentaires et permet le gradient Léon
- L'animation pulse CSS est légère (pas de JS, pas de timer)

**Alternatives rejetées** :
- **Modifier chaque HTML** : Duplication, maintenance plus lourde
- **Image PNG/SVG externe** : Requête HTTP supplémentaire, moins de contrôle sur le style

---

## D057 — Suppression de la redirection automatique home → micro sur mobile

**Date** : 2026-03-12
**Statut** : Actif

**Contexte** : Sur mobile, cliquer sur le logo renvoyait vers `home.html` qui redirigeait automatiquement vers `micro.html`. L'utilisateur ne pouvait jamais voir la page d'accueil sur mobile.

**Décision** : Supprimer le `window.location.replace('micro.html')` dans `home.html`. La page d'accueil est désormais accessible sur mobile (responsive déjà en place). Le micro reste accessible via le bouton central de la bottom nav.

**Pourquoi** :
- `home.html` a un design responsive fonctionnel (grille 2 colonnes, tuiles adaptées)
- Le micro n'est pas toujours la destination souhaitée
- La bottom nav offre un accès direct au micro sans forcer la redirection

---

## D056 — 3 colonnes custom par pipeline (slots pré-définis, pas colonnes libres)

**Date** : 2026-03-12
**Statut** : Actif

**Contexte** : Les conseillers veulent pouvoir ajouter des colonnes à leurs pipelines pour des usages spécifiques (ex: "Estimation en cours", "Visite prévue").

**Décision** : 3 slots custom (`custom_1`, `custom_2`, `custom_3`) pré-définis dans chaque pipeline, masqués par défaut via `hiddenByDefault: true`. Le conseiller les active, renomme et positionne depuis la modale settings.

**Pourquoi** :
- Zéro migration BDD — les `custom_*` sont des valeurs `status` TEXT libres, pas de CHECK constraint
- Pas de gestion de création/suppression dynamique de colonnes (complexité évitée)
- 3 slots suffisent pour 99% des cas d'usage terrain
- Le flag `hiddenByDefault` évite de polluer les pipelines des utilisateurs existants
- Le select statut dans les fiches lead est dynamisé pour inclure les colonnes custom actives

**Alternatives rejetées** :
- **Colonnes 100% libres** : Trop complexe (validation, garbage collection, impact stats)
- **Plus de 3 slots** : Risque de surcharge visuelle du pipeline

---

## D052 — Confirmation visite vocale via orchestrateur + generate-message

**Date** : 2026-03-09
**Statut** : Actif

**Contexte** : L'utilisateur veut pouvoir dire "Dis Léon envoie un message de confirmation de visite à Mme X par SMS" et que le message soit généré puis l'app SMS/WhatsApp ouverte automatiquement.

**Décision** : Nouvel intent `send_confirmation_visite` dans l'orchestrateur (`api/assistant.js`) + handler dédié dans `micro.html` qui cherche la prochaine visite du contact, génère le message via `/api/generate-message` (scenario `confirmation_visite`), et ouvre l'app canal demandée.

**Pourquoi** :
- Réutilise l'infra existante (orchestrateur IA + generate-message API) plutôt que de créer un nouveau flux
- L'orchestrateur identifie le contact + canal, le handler frontend se charge de la logique métier (trouver la visite, composer le contexte)
- Le vouvoiement est forcé par défaut pour les confirmations (professionnel), sans popup tu/vous
- "ce jour" au lieu de la date quand visite = aujourd'hui (instruction côté API avec date serveur)

**Alternatives rejetées** :
- **Tout dans l'orchestrateur** : Aurait nécessité de passer les visites dans le contexte → trop lourd
- **Popup tu/vous** : Interrompt le flux vocal → forcer le vouvoiement (approprié pour une confirmation)
