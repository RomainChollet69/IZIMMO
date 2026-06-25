# TODO — Plan & suivi des tâches

> Tâches en cours et à venir pour le projet Léon.

---

## Terminé récemment

### Refonte mobile (session 2026-06-19/20) ✅
- [x] Diagnostic desktop vs mobile (`docs/DIAGNOSTIC-MOBILE.md`)
- [x] Cibles tactiles : chips relances 38px, onglets colonnes 37px (cache-bust relance-widget)
- [x] Visites mobile V2 (`MOBILE_VISITS_V2`) : stats par bien, actions, section Contacts distincte
- [x] Pipelines mobile : bouton « déplacer » direct sur carte (`PIPELINE_MOBILE_V2`)
- [x] Mode Tuiles mobile (`MOBILE_TILES_V1`) : titre + recherche + tuiles carrées → répertoire → fiche (vendeurs + acquéreurs)
- [x] Barre de nav mobile : Accueil · Pipeline (entonnoir) · 🎙️ · Marché · Visites + toggle Vendeurs/Acquéreurs
- [x] Polish tuiles : icônes uniques (cleanColLabel), fond plus foncé, typo, carte répertoire
- [x] Fix Visites : sections qui se refermaient au scroll (resize en hauteur ignoré)
- [x] Swipe-left pour supprimer un contact (demande de visite)
- [x] Docs à jour (CHANGELOG, ARCHITECTURE 3.4/3.4b, DECISIONS D092, mémoire `mobile-tiles-direction`)

**Prochaines étapes mobile (à valider avec l'utilisateur)**
- [ ] Harmoniser la fiche acquéreur mobile : remplacer la modale `editBuyer` par une bottom sheet façon `openMobileDetail` (vendeurs). Bug pré-existant : titre « Nouvel acquéreur » même en édition.
- [ ] Nettoyer le code mort `createMobileCard` / `renderMobileCardDeck` / `.mobile-card-deck`.
- [ ] Décliner éventuellement l'esprit tuiles/recherche sur l'accueil ou Visites.
- [ ] (Optionnel) Étendre le swipe-delete aux lignes visite si souhaité.

### RDV vendeur planifiable depuis la fiche prospect (session 2026-06-24) ✅
- [x] Migration `016_sellers_rdv_planned.sql` : `rdv_scheduled_at`, `rdv_google_event_id` (appliquée)
- [x] Bouton « Planifier le RDV dans l'agenda » sur la fiche vendeur (au-dessus de « RDV physique effectué »)
- [x] Création / modification / annulation de l'événement Google Calendar (réutilise `/api/assistant`)
- [x] Affichage « RDV planifié le X à H » + Modifier / Annuler ; persistance + anti-doublon via event_id
- [x] Docs à jour (CHANGELOG, ARCHITECTURE, API-MAP, DECISIONS D091)
- [x] **Parité vocale (session 2026-06-25, D093)** : RDV vendeur dicté relié à la fiche (description + `rdv_scheduled_at`), avec confirmation du prospect si ambigu/introuvable (`micro.html` + params `who`/`who_role` dans `api/assistant.js`)
- [ ] **À tester en conditions réelles** (session connectée + agenda Google lié) : round-trip fiche (create/update/delete) + commande vocale « planifie un RDV vendeur avec X »
- [ ] Évolution possible : afficher « RDV planifié » sur la carte du pipeline ; auto-relance depuis `rdv_scheduled_at` ; côté vocal, update au lieu de doublon si RDV déjà planifié

---

## En cours

### Email de suivi automatique post-visite (session 2026-06-13)

> Objectif : 30 min après l'heure planifiée d'une visite, envoyer automatiquement
> au visiteur un email avec les liens du bien (documents, visite virtuelle, annonce).

**Décisions validées (utilisateur)**
- Déclencheur : heure planifiée (`visit_date` + `visit_time`) + 30 min.
- Garde-fou : ne jamais envoyer si `status = 'annulee'`.
- Envoi auto MAIS uniquement si ≥ 1 lien rempli ET email visiteur valide.
- Liens stockés sur la fiche du bien (`sellers`), réutilisés pour tous les visiteurs.
- Activation : flag global par agent (`profiles`), opt-in (false par défaut).

**Schéma Supabase**
- [ ] `sellers` : `link_documents TEXT`, `link_virtual_tour TEXT`, `link_listing TEXT`
- [ ] `visits` : `followup_sent_at TIMESTAMPTZ` (idempotence)
- [ ] `profiles` : `visit_followup_enabled BOOLEAN DEFAULT false`

**Backend — Cron Vercel**
- [ ] `vercel.json` : `"crons": [{ "path": "/api/cron-visit-followup", "schedule": "*/10 * * * *" }]` + maxDuration
- [ ] `api/cron-visit-followup.js` : auth `CRON_SECRET`, sélection visites éligibles
      (non envoyées, non annulées, now ≥ visit+30min, fenêtre ≤ 24h, Europe/Paris),
      join sellers/buyers, filtre liens+email, respect `visit_followup_enabled`,
      envoi via `lib/mailgun-send.js` puis `followup_sent_at = now()`
- [ ] `lib/visit-followup-email.js` : template HTML (boutons liens présents + signature + reply-to)

**Frontend**
- [ ] `vendeurs.html` : 3 champs liens dans la modale du bien (save/load) ; pré-remplir annonce depuis `links`
- [ ] `visites.html` : indicateur par visite (envoyé / à venir / liens manquants)
- [ ] `parametres.html` : interrupteur global « Email de suivi post-visite »

**Env / Docs**
- [ ] `CRON_SECRET` (Vercel) ; docs ARCHITECTURE / DECISIONS / CHANGELOG / API-MAP

**Découpage** : Phase 1 = migration + champs fiche + template + cron (cœur).
Phase 2 = toggle paramètres + indicateur visites + docs.

---

_(rien d'autre en cours)_

## À tester après déploiement (session 2026-05-26)

### Bien d'origine acquéreur (chantier A)
- [ ] Promouvoir une visite en acquéreur → vérifier la section "📍 Premier contact" affichée
- [ ] Accepter une demande portail avec création d'acquéreur → vérifier capture origin_seller_id
- [ ] Tester le lien formulaire pré-rempli : copier depuis la popup share d'un seller, ouvrir l'URL dans un onglet privé, soumettre, vérifier que le buyer créé a bien origin_seller_id
- [ ] Supprimer un seller et rouvrir un acquéreur qui pointait dessus → vérifier que le label cache s'affiche (FK SET NULL)

### Sélection multiple (chantier C)
- [ ] Cliquer "Sélectionner" → vérifier checkboxes visibles + neutralisation des autres boutons
- [ ] Sélectionner 3 acquéreurs et partager → vérifier le texte concaténé
- [ ] Filtrer par recherche pendant la sélection → vérifier que la sélection persiste

### Recherche multi-critères (chantier D)
- [ ] Tester "maison Caluire" — doit retourner les maisons à Caluire uniquement
- [ ] Tester "T3" — doit retourner les acquéreurs avec rooms=T3
- [ ] Tester "200k" — doit matcher budget_max entre 200000 et 209999

### Matching demandes visite (chantier E)
- [ ] Recevoir une nouvelle demande sans adresse claire → vérifier tag "Aucun bien matché"
- [ ] Cliquer ✏️ sur une demande mal matchée → vérifier la modale + recherche live + match manuel
- [ ] Détacher un match → vérifier que le tag repasse à "Aucun bien matché"

## À faire

### Tutoriels in-app (session 2026-06-20)
- [x] Lot "Premiers pas" : `tuto-vendeur.html`, `tuto-acquereurs.html`, `tuto-pipeline.html` + `css/tuto.css` — fait
- [x] Cartes "Premiers pas" cliquables + section remontée en tête de `tutoriels.html` — fait
- [x] Fix bottom-nav non stylée (charger `css/mobile.css` sur les guides + `aide-vocale.html`) — fait
- [ ] Lot "Fonctionnalités avancées" (même gabarit) : DVF, Réseaux/Léa, Assistant Léon, Import contacts, Google Agenda
- [ ] Passer les 4 cartes "Fonctionnalités avancées" en "Disponible" une fois rédigées
- [ ] (Option) Ajouter une carte d'accès direct au guide "Recevoir tes leads des portails" déjà inline dans `tutoriels.html`

### Matching / Visites
- [ ] Tester le rendu des chips visite avec différents retours (feedback, prix, points, décision)
- [ ] Vérifier le deep-link acquéreur depuis les cartes visite (clic nom → fiche)
- [ ] Tester le micro avec tous les champs vendeur (source recommandation + referrer_name)

### Messages IA
- [ ] Tester le retour visite avec différents feedback_rating (coup de coeur vs pas convaincu)
- [ ] Tester les 3 canaux (SMS, WhatsApp, Email) avec tu et vous
- [ ] Vérifier que la signature agent fonctionne sur les deux pages
- [ ] Tester le bouton "Demander un retour" depuis une visite effectuée (popup + génération)
- [ ] Vérifier que le vouvoiement ne produit plus de "Salut" / langage familier
- [ ] Tester l'ouverture auto de SMS/WhatsApp/Email sur mobile (iOS + Android)

### Acquéreurs
- [ ] Vérifier que l'import CSV acquéreurs fonctionne (jamais confirmé)

### Debug cleanup
- [x] Retirer les console.log de debug (index.html + acquereurs.html) — fait

### DVF
- [ ] Tester la page DVF sur mobile (responsive 375px) — responsive revu mais pas testé en conditions réelles
- [ ] Envisager d'augmenter `MAX_PARCELS` progressivement (actuellement 500, clustering supporte plus)
- [ ] Tester le clustering avec des zones à haute densité (Paris, Lyon centre)

### Pipeline
- [ ] Retirer les console.log de debug mobile une fois stabilisé
- [ ] Tester le card deck sur différents appareils iOS et Android
- [ ] Envisager la refonte card deck pour le pipeline acquéreurs mobile

### Migrations SQL en attente
- [x] Migration 005 sellers (appointment_date, rdv_done, contact2_*) — exécutée
- [x] Migration 006 visits (feedback_rating, price_perception, buyer_decision, etc.) — exécutée

### Nettoyage
- [ ] Nettoyer requête `gamification_profiles` dans parametres.html (table probablement inutilisée)
- [ ] Archiver bonmatin.html quand l'utilisateur le demande
- [ ] Mettre en place le logging structuré par module (`[DVF]`, `[Pipeline]`, `[Auth]`, `[Workflow]`)

### Assistant Vocal (micro.html) — Prochaines étapes
- [x] Gérer les cas vocaux agenda : "planifie une visite vendredi 14h avec M. Dupont" → Google Calendar + CRM (2026-06-02 : regex isLeonCommand + flow create_event existant déjà branché sur INSERT visits si buyer/seller identifiés)
- [ ] Gérer les cas vocaux visites : "visite faite ce matin chez Dupont" → table visits
- [ ] Gérer les cas vocaux rappels : "relance M. Martin dans 10 jours" → reminder_date
- [ ] Tester l'onboarding sur mobile iOS/Android en conditions réelles

## Terminé

- [x] Refonte visuelle onglet Matching : chips colorées, cartes aérées, boutons discrets, barres fines
- [x] Nom acquéreur cliquable dans cartes visite (deep-link openLead)
- [x] Match cards deep-link vers fiche acquéreur/vendeur
- [x] Champ rooms (pièces) vendeurs : formulaire, carte, micro, SQL migration
- [x] Fix ordering cartes (prepend → appendChild + nullsFirst)
- [x] Fix scroll chaining (overscroll-behavior-y: none)
- [x] Fix Leon doublon (FAB désactivé)
- [x] Auto-close micro modal après création lead
- [x] Card cleanup (suppression À RELANCER, match indicator compact, max-height 150px)
- [x] Header acquéreurs aligné sur vendeurs (bouton Lead dans search-bar-section)
- [x] Bouton + Lead positionné identique sur les deux pipelines
- [x] Actions rapides widget relances (snooze +7j / dismiss) + fix arrondissements 1er/2e
- [x] Date de RDV vendeur + auto-relance J+15 (appointment_date, badge vert, constante 15j)
- [x] Fix CSS iOS WebKit pour card deck (préfixes -webkit-, suppression propriétés problématiques)
- [x] Ajout dropdown déconnexion dans le header mobile (auth.js)
- [x] Diagnostic et résolution du bug login OAuth (Client Secret Google changé)
- [x] Headers anti-cache vercel.json + meta tags + cache-busting scripts
- [x] Résolution cache Chrome iOS (nécessite réinstallation de Chrome)
- [x] Créer `CLAUDE.md` — règles de comportement Claude Code
- [x] Créer `docs/ARCHITECTURE.md` — architecture complète du projet
- [x] Créer `docs/DECISIONS.md` — journal des choix techniques
- [x] Créer `docs/API-MAP.md` — cartographie des endpoints et APIs
- [x] Créer `docs/CHANGELOG.md` — historique horodaté
- [x] Créer `tasks/todo.md` et `tasks/lessons.md`
- [x] Fix InfoWindow whitespace DPE (CSS aggressif)
- [x] Fix filtres DPE invisibles (sortis du panel repliable)
- [x] Fix sidebar overflow quand DPE + DVF actifs ensemble
- [x] Extraction complète DPE (14.1M, 96 départements)
- [x] Upload DPE vers Supabase Storage (97 fichiers, 1.34 Go)
- [x] Support fichiers DPE splittés (59, 75)
- [x] En-têtes documentation sur tous les fichiers HTML/JS
- [x] Simplification produit : archivage pages obsolètes (leon, assistant, bonmatin, pipeline-acquereurs, reset-password)
- [x] Suppression js/gamification.js de toutes les pages
- [x] home.html : redirection mobile → micro.html, nettoyage tuiles
- [x] micro.html : renommage Micro → Vocal, onboarding première connexion
- [x] mobile-nav.js : nettoyage menu Plus (suppression pages archivées)
