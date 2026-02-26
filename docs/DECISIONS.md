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
