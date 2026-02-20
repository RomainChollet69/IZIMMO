# BRIEF WAIMMO — Document de contexte complet

> Ce document est à fournir à Claude Code ou toute nouvelle conversation Claude pour donner le contexte complet du projet WAIMMO.
> Dernière mise à jour : 20 février 2026

---

## 🎯 Vision du projet

**WAIMMO** est un CRM spécialisé pour les agents immobiliers indépendants et mandataires immobiliers en France. L'objectif est de créer un outil indispensable au quotidien, différencié des solutions génériques (Trello, Excel, ChatGPT) grâce à des automatisations hyper contextuelles basées sur les données réelles du CRM.

**Principe fondamental** : Zero effort + hyper contextuel + automatique = dépendance quotidienne.

**Cible** : Mandataires immobiliers indépendants (Efficity, IAD, Safti, Capifrance, etc.) et agents d'agences traditionnelles.

**URL** : https://waimmo.vercel.app
**Landing page** : https://waimmo.vercel.app/landing.html

---

## 🏗️ Architecture technique

### Stack
- **Frontend** : HTML/CSS/JS vanilla (pas de framework)
- **Backend** : Supabase (PostgreSQL, Auth, Storage, RLS)
- **Hosting** : Vercel (site + Edge Functions)
- **IA** : Claude Haiku via Anthropic API (structuration, génération messages, import, posts sociaux), Whisper via OpenAI API (transcription audio)
- **Éditeur** : Visual Studio Code sur Mac

### Pages du site
```
WAIMMO/
├── index.html          ← Pipeline vendeurs (page principale + briefing du matin)
├── acquereurs.html     ← Pipeline acquéreurs
├── parametres.html     ← Paramètres, import Excel/CSV, import contacts VCF
├── contacts.html       ← Carnet de contacts (autocomplétion)
├── social.html         ← Réseaux sociaux / posts IA (à implémenter)
├── landing.html        ← Page marketing
├── js/
│   ├── supabase-config.js  ← Config Supabase + getAuthHeaders()
│   └── audio-recorder.js   ← Classe AudioRecorder (MediaRecorder + envoi Whisper)
└── api/
    ├── _auth.js              ← Helper auth partagé (verifyAuth + withCORS)
    ├── transcribe.js         ← Whisper transcription audio
    ├── parse-lead.js         ← Claude : dictée vocale → champs lead structurés
    ├── generate-message.js   ← Claude : génération messages SMS/WhatsApp/Email contextuels
    ├── scrape-listing.js     ← Scraping annonce concurrente (URL → Claude → JSON)
    ├── map-columns.js        ← Claude : mapping colonnes Excel vers champs CRM
    ├── analyze-document.js   ← Claude : analyse PDF/images pour pré-remplissage lead
    ├── parse-import-batch.js ← Claude : import Excel par batch de 10 lignes
    └── generate-social-post.js ← Claude : génération posts réseaux sociaux (à créer)
```

### Variables d'environnement Vercel
- `ANTHROPIC_API_KEY` — Clé API Claude (Haiku)
- `OPENAI_API_KEY` — Clé API Whisper
- `SUPABASE_URL` — URL du projet Supabase
- `SUPABASE_ANON_KEY` — Clé anon Supabase

### Sécurité
- **Toutes les Edge Functions** vérifient l'authentification Supabase via `_auth.js` (token Bearer dans header Authorization)
- Le frontend envoie le token via `getAuthHeaders()` dans `supabase-config.js`
- **RLS** (Row Level Security) sur toutes les tables : chaque user ne voit que ses données
- **Auth** : Google OAuth + Email/mot de passe + réinitialisation mot de passe
- Les appels non authentifiés retournent 401

---

## 📊 Base de données Supabase

### Tables principales

**sellers** — Leads vendeurs
- id, user_id, first_name, last_name, phone, email, address
- budget (prix du bien), surface, property_type, rooms, annexes (TEXT[])
- description (description physique du bien uniquement)
- source (boitage/recommandation/pige/internet/appel_direct/autre), referrer_name
- status (warm/mild/cold/off_market/mandate/competitor/sold/lost)
- contact_date, reminder_date, reminder_reason, last_activity_at
- commission_rate, commission, mandate_type, mandate_start_date, mandate_end_date, mandate_price
- competitor_url, competitor_agency, competitor_price

**buyers** — Leads acquéreurs
- id, user_id, first_name, last_name, phone, email
- budget (budget max HFN), surface_min, property_type, rooms, annexes (TEXT[])
- search_city (villes recherchées, multi-villes en tags)
- source, referrer_name, status (warm/mild/cold/active/inactive/lost)
- contact_date, reminder_date, reminder_reason, last_activity_at

**lead_notes** — Notes horodatées (seller_id OU buyer_id)
**lead_files** — Documents uploadés (avec compression images)
**price_history** — Historique des changements de prix
**ai_messages** — Messages IA générés et sauvegardés
**dismissed_matches** — Matchs acquéreur/vendeur écartés par l'agent
**visits** — Historique des visites (seller_id + buyer_id + feedback + rating)
**todos** — Todo list
**contacts** — Carnet de contacts pour autocomplétion
**social_profiles** — Profil style réseaux sociaux (tone, style, sector, sample_posts)
**social_posts** — Posts générés par jour (category, content, platform, status)

---

## ✅ Fonctionnalités implémentées

### Pipeline vendeurs (index.html)
- **8 colonnes** drag & drop : Chaudes → Tièdes → Froides → Off Market → Sous Mandats → Chez Concurrent → Vendus → Perdus
- Cartes compactes (badge source + nom + type·surface·prix + 📍ville) avec toggle étendu au clic
- Images de fond sur chaque en-tête, compteur de leads, format euros auto, commissions auto
- Colonne Off Market (biens visitables hors mandats, style violet premium)
- Colonne Chez Concurrent (avec scraping d'annonce URL)

### Pipeline acquéreurs (acquereurs.html)
- 6 colonnes drag & drop avec mêmes fonctionnalités
- Budget max (HFN), surface min, annexes souhaitées (checkboxes), villes recherchées (multi-tags)

### Dictée vocale (toutes les pages)
- MediaRecorder → Whisper (transcription) → Claude (structuration en champs lead)
- Distinction description (bien physique) vs notes (relation commerciale) dans le prompt parse-lead.js
- Notes vocales et todo vocale (transcription seule, pas de structuration)

### Messages IA (modales vendeur ET acquéreur)
- Onglet "✨ Messages IA" — 3 canaux (SMS court/WhatsApp conversationnel/Email formel)
- 9 scénarios vendeurs + 7 scénarios acquéreurs + message libre
- Boutons : Copier, Ouvrir SMS/WhatsApp/Email, Régénérer, Sauvegarder comme note
- Edge Function generate-message.js avec prompt contextuel (données lead + notes + visites + historique prix)

### Import Excel/CSV (parametres.html)
- Parsing IA par batch de 10 lignes (parse-import-batch.js)
- Gestion : colonnes vides, dates serial Excel, civilités, prix K€, surfaces, en-têtes multi-lignes
- 4 étapes : Aperçu → Mapping IA vérifié → Options → Import avec barre de progression

### Matching acquéreurs ↔ vendeurs
- Algorithme côté client (instantané, gratuit, pas d'IA)
- **Critères éliminatoires** : budget > +20% → score 0, localisation incompatible → score 0, type incompatible → score 0
- Score pondéré : Budget 30%, Localisation 25%, Type 15%, Surface 15%, Pièces 10%, Annexes bonus (+5%/annexe, max +15%)
- Bidirectionnel : onglet 🎯 Matching dans fiches vendeur ET acquéreur
- Badge "🎯 X matchs/biens" en haut à droite des cartes (cliquable → ouvre onglet matching)
- Notification popup au drop en Sous Mandats si matchs ≥ 70%
- Possibilité d'écarter un match (table dismissed_matches), restaurable
- Seuil affichage : ≥ 50% dans onglet, ≥ 70% pour notification

### Autres fonctionnalités
- Todo list flottante avec badge compteur
- Export CSV vendeurs et acquéreurs (avec notes horodatées)
- Documents : upload drag & drop, compression images (Canvas API, 1600px, quality 0.7), analyse IA
- Notes horodatées : ajout, édition (✏️), suppression (🗑️), sauvegarde auto à la création/modification du lead
- Liens d'annonces sur fiches vendeur
- Autocomplétion adresse via API adresse.data.gouv.fr
- Carnet de contacts avec import VCF (iPhone/Android/Google)
- Prénom non obligatoire (au moins nom OU prénom requis)

---

## 🚀 Roadmap

### En cours d'implémentation
- **Relances automatiques** : calcul auto de la prochaine relance selon événements (création, note, visite, statut, message)
- **Briefing du matin** : écran à l'ouverture avec relances du jour, nouveaux matchs, alertes mandats, stats du mois
- **Posts réseaux sociaux IA** : page social.html, calendrier éditorial (Lun=conseil, Mar=bien, Mer=coulisses, Jeu=témoignage, Ven=marché, Sam=lifestyle), profil de style agent, génération contextuelle avec données CRM

### Priorité haute
- Onboarding premier lead (dictée avec exemple, transcription éditable, preview des champs)
- Scoring automatique des leads (Chaude → Tiède → Froide selon activité)
- Suivi de mandat automatique (workflow J0/J7/J21/J30/J60/J75 avec messages pré-rédigés)
- Messages IA en file d'attente ("📬 4 messages en attente" dans le briefing)

### Priorité moyenne
- Rapport hebdomadaire (stats semaine dans l'app + par email)
- Tableau de bord commissions
- PWA (manifest.json + service-worker.js)
- Redesign progressif (un élément à la fois)

### Future
- Matching inter-agents (réseau WAIMMO — biens partagés entre agents)
- Intégration API pige (Yanport ou autre agrégateur)

---

## 💰 Modèle économique

- **Gratuit** : 10 leads max
- **Pro** : 9.90€/mois (leads illimités + toutes fonctionnalités IA)

### Coûts infrastructure
- Vercel gratuit → Pro 20$/mois si > 200 users actifs
- Supabase gratuit (500 Mo DB, 1 Go storage) → Pro 25$/mois si > 30 users
- Claude Haiku : ~0.01-0.03€ par appel IA
- Whisper : ~0.01€ par dictée

---

## 🎨 Design & UX

- Style clean, blanc, border-radius 16px, ombres légères
- Couleurs : turquoise #2DD4BF (accent), violet/indigo dégradé (CTA), gris texte
- Landing page : design sombre premium #0F1419, accents turquoise/or
- Mobile first : tab bar en bas, swipe entre colonnes, responsive
- Pas de framework CSS (vanilla)
- Animations : slide-down pour cartes étendues, pulse pour micro, fade-in scroll landing

---

## ⚡ Différenciation vs ChatGPT / Trello

Ce que WAIMMO fait et que les outils génériques NE PEUVENT PAS faire :

1. **Pipeline spécifique immobilier** avec 8 statuts vendeurs incluant Off Market et Chez Concurrent
2. **Matching bidirectionnel** acquéreurs ↔ vendeurs en temps réel avec données CRM réelles
3. **Messages IA contextuels** utilisant les vraies données du dossier (notes, visites, prix, historique)
4. **Relances automatiques intelligentes** calculées selon l'activité réelle du lead
5. **Briefing du matin** avec données CRM agrégées (relances, matchs, alertes mandats, stats)
6. **Posts réseaux sociaux** personnalisés au style de l'agent avec ses vrais biens en portefeuille
7. **Import intelligent** de fichiers Excel bordéliques grâce à l'IA
8. **Dictée vocale** structurée automatiquement en fiche lead complète

**Le principe** : l'IA est intégrée dans un workflow métier spécifique, pas exposée comme un chatbot générique. Chaque fonctionnalité IA utilise les données réelles du CRM pour produire un résultat que ChatGPT ne peut pas reproduire.
