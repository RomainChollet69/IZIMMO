# CHANGELOG — Historique des modifications

> Log horodaté de chaque session de travail avec fichiers touchés et décisions prises.

---

## Session 2026-02-26b — Import lead acquéreur depuis capture d'écran / texte

### Résumé
Nouvelle fonctionnalité permettant d'importer un lead acquéreur en collant une capture d'écran (Cmd+V) ou du texte depuis une plateforme immobilière (SeLoger, LeBonCoin, Jinka, Efficity, etc.). Claude Vision analyse l'image et pré-remplit automatiquement le formulaire de création.

### Modifications

**`api/analyze-document.js`** :
- Ajout du mode `screenshot_import` avec prompts dédiés vendeur/acquéreur
- Détection automatique de la plateforme source (logo, mise en page)
- Extraction structurée : nom, email, téléphone, budget, surface, secteur, critères, etc.
- Fusionné dans analyze-document.js (pas de nouvelle fonction) pour rester dans la limite de 12 fonctions Vercel Hobby

**`acquereurs.html`** :
- Bouton "Import" dans le header (entre Exporter et le séparateur)
- Modal d'import dédié avec 2 onglets : Capture d'écran / Texte
- Collage image via clipboard (Cmd+V), drag & drop, ou file picker (photothèque mobile)
- Compression image avant envoi (compressImage existante)
- Après analyse : fermeture modal import → ouverture formulaire pré-rempli avec animation flash
- Positionnement CSS grid mobile du bouton import

**`vercel.json`** :
- Nettoyage de l'entrée `extract-lead-from-screenshot.js` supprimée

### Fichiers créés/modifiés
- `api/analyze-document.js` (mode screenshot_import ajouté)
- `acquereurs.html` (bouton + modal + JS import)
- `vercel.json` (nettoyage)

### Points d'attention
- Limite Vercel Hobby = 12 fonctions serverless — on est pile à 12
- Coût Claude Vision : ~0.01-0.03€ par image analysée
- Le mode texte est ~20x moins cher que l'image

### Prochaines étapes prioritaires
- Tester avec différentes plateformes (LeBonCoin, Jinka, BienIci, PAP)
- Éventuellement ajouter l'import côté vendeurs si besoin

---

## Session 2026-02-25d — Système de visites acquéreur ↔ vendeur

### Résumé
Ajout d'un système complet de suivi des visites reliant acquéreurs et vendeurs. Chaque visite est visible des deux côtés (fiche vendeur ET fiche acquéreur) dans l'onglet Matching, avec statut planifiée/effectuée/annulée et feedback structuré post-visite.

### Modifications

**Migration BDD (`sql/003_visits_upgrade.sql`)** :
- Ajout colonnes `buyer_id` (FK), `status`, `feedback_rating`, `price_perception`, `visit_time`, `updated_at`
- Index sur `buyer_id`, `seller_id`, `status`
- CHECK constraints sur les valeurs autorisées
- Migration des anciens `rating` 1-5 vers `feedback_rating`

**Côté vendeur (`index.html`)** :
- Section "Visites" ajoutée dans l'onglet Matching, au-dessus des suggestions de match
- Bouton "+ Planifier une visite" avec formulaire inline (autocomplete acquéreurs, date, heure, notes)
- Bouton 📅 sur chaque carte match pour planifier rapidement une visite
- Actions : marquer comme effectuée (ouvre feedback), annuler, supprimer
- Modale feedback post-visite : chips ressenti (😍→😞) + perception prix + notes
- Suppression de l'ancien formulaire de visites dans l'onglet Gestion Mandat
- Compteur visites dans la vue mobile détail

**Côté acquéreur (`acquereurs.html`)** :
- Même système miroir : section Visites dans l'onglet Matching
- Autocomplete vendeurs (par nom ou adresse)
- Bouton 📅 sur chaque carte match vendeur
- Même modale feedback

### Fichiers créés/modifiés
- `sql/003_visits_upgrade.sql` (nouveau)
- `index.html` (HTML tabMatching + JS visites + CSS + cleanup ancien système)
- `acquereurs.html` (HTML tabMatching + JS visites + CSS)
- `docs/ARCHITECTURE.md` (schéma table visits mis à jour)
- `docs/CHANGELOG.md` (ce fichier)

### Points d'attention
- La migration SQL doit être exécutée dans Supabase SQL Editor AVANT de déployer
- Les anciennes visites (buyer_name texte sans buyer_id) restent affichées en fallback
- Les visites créées côté acquéreur nécessitent un seller_id pour apparaître côté vendeur

### Prochaines étapes prioritaires
- Exécuter `sql/003_visits_upgrade.sql` dans Supabase
- Tester le flow complet : création → feedback → cross-référence

---

## Session 2026-02-25c — Fix iOS card deck, mobile logout, OAuth login, cache Chrome iOS

### Résumé
Corrections multiples sur la version mobile : CSS iOS WebKit pour le card deck, ajout du dropdown de déconnexion au header mobile, diagnostic et résolution du bug de login OAuth (client secret Google changé), et gestion du cache agressif de Chrome iOS via headers anti-cache et cache-busting.

### Modifications

**Fix CSS iOS WebKit pour card deck (index.html)** :
- Supprimé `overflow: hidden`, `flex: 1`, `height: 100%`, `will-change`, `calc(100vh - 200px)` — tous problématiques sur WebKit iOS
- Ajouté préfixes `-webkit-transform`, `-webkit-transition`, `-webkit-backface-visibility`
- Augmenté `min-height` viewport de 400px à 450px

**Dropdown déconnexion mobile (js/auth.js)** :
- Le header mobile (logo + prénom + avatar) n'avait aucun menu
- Ajouté dropdown avec Paramètres + Déconnexion au tap sur la zone utilisateur
- CSS du dropdown injecté dynamiquement avec animation `dropdownSlide`

**Diagnostic OAuth login cassé (js/auth.js, login.html)** :
- Ajout de debug visible (alert) pour diagnostiquer le flow OAuth
- Découverte : erreur `Unable to exchange external code` côté Supabase
- Cause : le Client Secret Google avait été changé sans mise à jour dans Supabase Dashboard
- Résolution : utilisateur a mis à jour le secret dans Supabase → login restauré
- Tentative de fix race condition OAuth (revertée) — `getSession()` attend déjà l'init Supabase

**Headers anti-cache (vercel.json, index.html)** :
- `vercel.json` : HTML → `no-cache, no-store, must-revalidate`, JS → `no-cache, must-revalidate`
- Meta tags `Cache-Control`, `Pragma`, `Expires` dans `<head>` d'index.html
- Cache-busting `?v=250225` sur les scripts locaux
- Chrome iOS nécessite suppression/réinstallation pour vider son cache agressif

### Fichiers créés/modifiés
- `index.html` (CSS iOS, meta cache, cache-busting scripts)
- `js/auth.js` (dropdown mobile, debug temporaire retiré)
- `login.html` (debug temporaire retiré)
- `vercel.json` (headers anti-cache)

### Points d'attention / bugs connus
- Chrome iOS a un cache extrêmement agressif — la seule solution fiable est supprimer/réinstaller l'app
- Les console.log de debug dans `renderMobileCardDeck()` et `loadSellers()` sont toujours présents
- Le card deck fonctionne sur Safari iOS, Chrome iOS (après réinstall), et desktop responsive

### Prochaines étapes prioritaires
- Retirer les console.log de debug mobile
- Tester le card deck sur différents appareils
- Envisager la refonte card deck pour le pipeline acquéreurs mobile

---

## Session 2026-02-25b — Images dans notes + arrondissements + nettoyage header

### Résumé
Ajout du collage d'images (screenshots) dans les notes des fiches leads (vendeurs + acquéreurs), affichage des arrondissements sur les cartes leads pour Paris/Lyon/Marseille, et suppression de l'icône Paramètres des headers de toutes les pages.

### Modifications

**Collage d'images dans les notes (index.html, acquereurs.html)** :
- Ajout d'un listener `paste` sur le textarea des notes pour détecter les images du presse-papiers
- Compression automatique via `compressImage()` (1600px, JPEG 70%) avant upload
- Zone de prévisualisation avec bouton de suppression sous le textarea
- Upload vers Supabase Storage (`lead-files` bucket, path `{userId}/notes/seller_{id}/`)
- Affichage inline dans la timeline des notes avec URLs signées
- Support des notes en attente (pending) pour leads non encore créés (vendeurs)
- Suppression du fichier Storage à la suppression d'une note
- Code résilient : si l'upload échoue, la note texte est quand même sauvegardée
- Fallback si colonne `image_url` inexistante : retry de l'insert sans le champ

**Arrondissements sur les cartes leads (index.html)** :
- Nouvelle fonction `addArrondissement(city, postalCode)` dans `extractCity()`
- Paris (75001-75020), Lyon (69001-69009), Marseille (13001-13016) affichent maintenant l'arrondissement
- Ex: `75008 Paris` → "Paris 8ème", `69003 Lyon` → "Lyon 3ème"

**Suppression icône Paramètres du header (7 fichiers)** :
- Retrait du `<a class="settings-btn">` et du CSS associé de toutes les pages
- Les paramètres restent accessibles via le menu déroulant du profil utilisateur

### Fichiers créés/modifiés
- `index.html` (image notes, CSS preview, JS paste/upload/render, arrondissements, header nettoyé)
- `acquereurs.html` (image notes, CSS preview, JS paste/upload/render, header nettoyé)
- `social.html` (header nettoyé)
- `dvf.html` (header nettoyé)
- `micro.html` (header nettoyé)
- `assistant.html` (header nettoyé)
- `parametres.html` (header nettoyé)

### Migration DB requise
```sql
ALTER TABLE lead_notes ADD COLUMN image_url text;
```

### Points d'attention / bugs connus
- La colonne `image_url` doit être ajoutée manuellement dans Supabase SQL Editor
- Sans cette migration, les images ne sont pas persistées (mais les notes texte fonctionnent)
- Les URLs signées expirent après 1h (rechargement de la modale les renouvelle)

### Prochaines étapes prioritaires
- Exécuter la migration SQL `image_url`
- Tester le collage d'image sur mobile (iOS Safari / Android Chrome)
- Vérifier que le bucket `lead-files` accepte les uploads dans le sous-dossier `notes/`

---

## Session 2026-02-26 — DVF/DPE : filtres, InfoWindow, extraction complète + documentation

### Résumé
Correction des filtres DPE invisibles, réduction de l'espace blanc InfoWindow, sidebar scrollable, extraction complète des 14M DPE avec nouveaux champs (date, adresse, complément), upload Supabase Storage, et ajout des en-têtes de documentation sur tous les fichiers.

### Modifications

**Carte DVF/DPE (dvf.html)** :
- Fix InfoWindow whitespace : CSS agressif sur `.gm-style-iw-c` (padding:0), `.gm-style-iw-tc` (masqué)
- Fix filtres DPE invisibles : sortis du panel repliable `#filterPanel` vers un conteneur indépendant `#dpeFiltersContainer`
- Fix sidebar overflow : `overflow: hidden` → `overflow-y: auto` + `flex-shrink: 0` sur toutes les sections
- Support fichiers DPE splittés : `dpeSplits` map dans `index.json`, chargement parallèle des parties
- Garde `if (!info.bbox) continue` dans `findDpeDepts()` pour ignorer les clés non-département

**Pipeline DPE (scripts/)** :
- `extract-dpe-from-dump.py` : extraction des 14,155,763 DPE depuis le dump 63 Go (45 min)
- Nouveaux champs extraits : `date_etablissement_dpe`, `ban_label`/`adresse_brut`, `complement_adresse`
- Upload 97 fichiers (1.34 Go) vers Supabase Storage bucket `dpe-data`
- Split départements > 50 Mo : 59 (Nord) et 75 (Paris) en 2 fichiers chacun

**Documentation** :
- En-têtes HTML ajoutés sur 10 fichiers (commentaire descriptif avant `<!DOCTYPE html>`)
- En-têtes JS enrichis sur 4 fichiers (supabase-config, relance-widget, onboarding, todo-widget)

### Fichiers créés/modifiés
- `dvf.html` (CSS InfoWindow, filtres DPE, sidebar scroll, split DPE)
- `index.html`, `acquereurs.html`, `formulaire.html`, `login.html`, `landing.html`, `social.html`, `parametres.html`, `micro.html`, `reset-password.html` (en-têtes HTML)
- `js/supabase-config.js`, `js/relance-widget.js`, `js/onboarding.js`, `js/todo-widget.js` (en-têtes JS)

### Points d'attention / bugs connus
- Limite Supabase Storage : 50 Mo par fichier (plan gratuit) — départements volumineux doivent être splittés
- Les nouveaux champs DPE (date, adresse, complément) ne seront visibles dans les InfoWindows que si les fichiers JSON contiennent ces données (extraction depuis le dump ADEME)

### Prochaines étapes prioritaires
- Tester les filtres DPE (classe A-G + DPE récents) en production
- Vérifier le chargement des départements splittés (59, 75)
- SQL migrations en attente : `rdv_done`, `contact2_name/phone/email` sur sellers

---

## Session 2026-02-25 — Refonte Pipeline Vendeurs Mobile (Card Deck)

### Résumé
Refonte complète de l'expérience mobile du pipeline vendeurs. Remplacement de la vue liste par un card deck style Tinder/Apple Cards avec swipe horizontal, vue détail bottom sheet, et header simplifié.

### Modifications

**Pipeline mobile — Card Deck** :
- `index.html` : Nouveau système de cartes deck (une seule carte visible, swipe gauche/droite entre fiches)
- `index.html` : 9 nouvelles fonctions JS : `createMobileCard`, `renderMobileCardDeck`, `navigateDeck`, `initDeckSwipe`, `openMobileDetail`, `closeMobileDetail`, `initDetailSwipeClose`, `saveDeckState`, `restoreDeckState`
- `index.html` : ~250 lignes CSS ajoutées (card deck, animations, vue détail, indicateur de position)
- `index.html` : Tab bar mobile corrigée : ajout du tab Off Market manquant + couleur active dynamique par colonne
- `index.html` : Constante `COLUMN_COLORS` (8 statuts → couleur hex) pour cohérence visuelle

**Vue détail mobile (bottom sheet)** :
- `index.html` : Overlay fullscreen slide-up au tap sur une carte
- `index.html` : Swipe-down pour fermer (seuil 120px, seulement si scrollTop ≈ 0)
- `index.html` : Sections structurées : bien, contact, mandat, concurrent, notes, commission, actions

**Header mobile simplifié** :
- `index.html` : Boutons Briefing et Exporter cachés sur mobile (`display: none !important`)
- `index.html` : Séparateur header caché sur mobile

**Redirect mobile supprimé** :
- `index.html` : Suppression du redirect automatique `index.html` → `micro.html` sur mobile
- `index.html` : Nettoyage des liens `index.html?v=1` → `index.html`

**Robustesse rendu mobile** :
- `index.html` : `renderMobileCardDeck()` appelé EN PREMIER dans `renderSellers()` (avant le rendu desktop)
- `index.html` : try-catch autour de `loadVisitCounts`/`loadNotePreviews`/`loadFileCounts`
- `index.html` : Auto-sélection du premier tab avec des leads si le tab courant est vide
- `index.html` : Console logs de debug `[MobileCardDeck]` et `[loadSellers]`

### Fichiers créés/modifiés
- `index.html` (+830 lignes, -73 lignes)

### Points d'attention / bugs connus
- Cache navigateur iOS (Chrome/Safari) : l'ancien HTML peut rester en cache après déploiement → vider le cache manuellement
- Console logs de debug restent en place (à retirer quand le mobile est stabilisé)

### Prochaines étapes prioritaires
- Retirer les console.log de debug une fois le mobile stabilisé
- Tester le swipe sur différents appareils iOS et Android
- Envisager la même refonte pour le pipeline acquéreurs mobile

---

## Session 2026-02-25 — Corrections Assistant + Header

### Résumé
Alignement du header de la page assistant sur le standard des autres pages, correction de 2 bugs fonctionnels (micro + créneaux), et amélioration du prompt orchestrateur pour de meilleures réponses IA.

### Modifications

**Header assistant.html — Alignement standard** :
- `assistant.html` : Remplacement du double header (`.header-desktop` + `.header-mobile`) par un unique `.header` identique à dvf.html/index.html
- `assistant.html` : Ajout alert-bell + header-separator + user-profile complet dans header-actions
- `assistant.html` : Ajout CSS `.user-dropdown`, `.user-dropdown.active`, `.user-dropdown-item` (menu Paramètres/Déconnexion était affiché en texte brut)
- `assistant.html` : Suppression du bottom-navigation mobile (aucune autre page n'en a)
- `assistant.html` : CSS responsive en grid 2 colonnes pour mobile (pattern standard)
- `assistant.html` : Suppression du tab "Assistant" dans le header (cohérent avec les autres pages)

**Bug micro assistant** :
- `assistant.html` : `recorder.record()` retourne une string, le code faisait `result.text` (toujours `undefined`) → corrigé en `const text = await recorder.record()` (même pattern que micro.html)

**Bug créneaux non transmis au draft_message** :
- `assistant.html` : Ajout variable `lastFoundSlots` pour stocker les derniers créneaux trouvés
- `assistant.html` : Le case `draft_message` standalone passe désormais `lastFoundSlots` au lieu de `null`
- `assistant.html` : `regenerateMessage()` passe aussi `lastFoundSlots`

**Amélioration orchestrateur IA** :
- `api/assistant.js` : Règle anti-clarification — ne demande jamais "c'est lequel ?" quand l'utilisateur dit "mon courtier/ma notaire"
- `api/assistant.js` : Règle `find_slots_and_draft` — toujours choisir cet intent quand créneaux + message demandés ensemble
- `api/assistant.js` : `leon_response` ne pose jamais de question (sauf intent `unknown`)
- `api/assistant.js` : Règle CONTEXT — le champ `context` doit capturer la situation complète (qui a initié, pourquoi), pas juste "déjeuner"

**Flow find_slots_and_draft revu** :
- `assistant.html` : Le message WhatsApp n'est plus généré automatiquement avec TOUS les créneaux
- `assistant.html` : La carte créneaux affiche un bouton "Proposer par WhatsApp" en plus de "Bloquer"
- `assistant.html` : Nouvelle fonction `draftWithSelectedSlots()` — génère le message avec uniquement les créneaux cochés

### Fichiers modifiés
- `assistant.html`
- `api/assistant.js`

### Points d'attention
- Les corrections du prompt orchestrateur améliorent le comportement IA mais ne le garantissent pas à 100% (modèle probabiliste)
- Le bouton "Proposer par WhatsApp" n'apparaît que sur les cartes créneaux issues de `find_slots_and_draft` (pas `find_slots` seul)

---

## Session 2026-02-24 (d) — Bugs Micro + Commission

### Résumé
Correction de 6 bugs sur la page Micro (enregistrement vocal) et refonte du calcul de commission immobilière sur le pipeline vendeurs.

### Modifications

**Page Micro — Transcription et édition** :
- `micro.html` : Texte de transcription rendu cliquable pour entrer en mode édition (+ bouton "Corriger" agrandi pour mobile)
- `micro.html` : Fix textarea invisible — `style.display = 'block'` au lieu de `''` (le CSS avait `display: none` par défaut)
- `micro.html` : Fix texte invisible après 2e dictée — `showTranscription()` remet maintenant `transcriptionText.style.display`

**Page Micro — Enregistrement** :
- `micro.html` : silenceTimeout 3s→6s, maxDuration 30s→2min (permet de dicter longtemps)
- `js/audio-recorder.js` : apiTimeout transcription 15s→30s

**Page Micro — Analyse mobile** :
- `micro.html` : Fix cache `loadUserLeads()` — `[]` est truthy en JS, le cache vide empoisonnait toutes les analyses
- `micro.html` : Garde `userId` avant enregistrement (retry session si null)
- `micro.html` : Auto-scroll vers les résultats (confirmation/erreur/ambiguïté) sur mobile
- `micro.html` : Timeout client 25s sur l'appel API d'analyse
- `micro.html` : Logs d'erreur Supabase pour debug

**Commission immobilière** :
- `js/supabase-config.js` : Ajout `calcCommission(prixFAI, taux)` et `calcRateFromAmount(prixFAI, commission)` — formule correcte : honoraires sur net vendeur
- `index.html` : Remplacement de `prix × taux / 100` par `calcCommission()` dans 8 endroits (cartes pipeline, inline edit, formulaire modal, sauvegarde, changement prix, exports CSV, listeners auto-calcul)
- `index.html` : Briefing stats — "€ HT" → "€ TTC" pour cohérence

### Fichiers modifiés
- `micro.html`
- `js/audio-recorder.js`
- `js/supabase-config.js`
- `index.html`

### Points d'attention
- Les commissions déjà enregistrées en BDD (avec l'ancienne formule) ne sont PAS recalculées automatiquement — seuls les nouveaux calculs/affichages utilisent la bonne formule
- Les leads existants avec `commission_amount` en dur gardent leur valeur

### Prochaines étapes prioritaires
- Vérifier que l'analyse mobile fonctionne maintenant (tester sur iPhone Safari)
- Éventuellement recalculer les commissions existantes en BDD si nécessaire

---

## Session 2026-02-24 (c) — Consolidation API (limite Vercel)

### Résumé
Refactoring : 5 fichiers API → 2 pour respecter la limite de 12 Serverless Functions Vercel (passé au plan Pro ensuite mais consolidation conservée car meilleure architecture).

### Modifications
- `api/google-auth-init.js` + `api/google-auth-callback.js` → **`api/google-auth.js`** (POST=init, GET=callback)
- `api/assistant-orchestrator.js` + `api/assistant-draft-message.js` + `api/calendar.js` → **`api/assistant.js`** (action switch unifié)
- `assistant.html` : URLs mises à jour (`/api/assistant` + champ `action`)
- `parametres.html` : URL mise à jour (`/api/google-auth`)
- `vercel.json` : Timeouts consolidés
- `docs/ARCHITECTURE.md`, `docs/API-MAP.md` : Mis à jour

### Impact
- `GOOGLE_REDIRECT_URI` change : `https://avecleon.fr/api/google-auth` (plus `/api/google-auth-callback`)
- URI de redirection Google Cloud Console à mettre à jour aussi

---

## Session 2026-02-24 (b) — Assistant Organisationnel Léon

### Résumé
Implémentation complète de l'assistant organisationnel IA (spec v2.1). L'agent immobilier peut désormais gérer son agenda Google Calendar et rédiger des messages en langage naturel (texte ou vocal) via une interface conversationnelle.

### Modifications

**Spec & corrections pré-implémentation** :
- `SPEC-ASSISTANT-ORGANISATIONNEL-LEON.md` : Mise à jour v2.1 — corrections OAuth nonce CSRF, multi-turn, confirmation create/update/delete, disambiguation, working_days INT[], textarea au lieu de contenteditable, retrait create_reminder du scope v1

**Sprint 1 — Socle Calendar** :
- `sql/002_user_integrations.sql` (CRÉÉ) : Tables `user_integrations` + `oauth_states` avec RLS, trigger updated_at
- `api/_auth.js` (MODIFIÉ) : Ajout `getSupabaseAdmin()` — singleton Supabase avec SERVICE_ROLE_KEY
- `api/google-auth-init.js` (CRÉÉ) : Génère nonce CSRF + URL OAuth Google Calendar
- `api/google-auth-callback.js` (CRÉÉ) : GET endpoint — échange code→tokens, upsert intégration, redirect
- `api/calendar.js` (CRÉÉ) : 5 actions Calendar (list, find_slots, create, update, delete) + refresh token auto
- `parametres.html` (MODIFIÉ) : Section Google Calendar (connexion/déconnexion, préférences horaires, jours travaillés)
- `vercel.json` (MODIFIÉ) : Timeouts pour 5 nouvelles fonctions

**Sprint 2 — Orchestrateur IA** :
- `api/assistant-orchestrator.js` (CRÉÉ) : NLU multi-turn via Claude Haiku — 9 intents, confirmation, disambiguation
- `api/assistant-draft-message.js` (CRÉÉ) : Génération de messages WhatsApp/SMS/Email contextuels

**Sprint 3 — Page assistant** :
- `assistant.html` (CRÉÉ) : Interface conversationnelle complète (~850 lignes) — chat bubbles, 8 types de cartes, dictée vocale, quick chips, responsive

**Sprint 4 — Navigation & documentation** :
- `index.html`, `acquereurs.html`, `social.html`, `dvf.html`, `parametres.html` (MODIFIÉS) : Tab "Assistant" dans la navigation desktop + mobile
- `micro.html` (MODIFIÉ) : Tab Assistant desktop + bottom nav mobile
- `docs/DECISIONS.md` (MODIFIÉ) : Ajout D016 (Calendar API directe), D017 (page séparée), D018 (nonce CSRF)
- `docs/ARCHITECTURE.md` (MODIFIÉ) : 7 nouveaux fichiers dans l'arborescence
- `docs/API-MAP.md` (MODIFIÉ) : 5 endpoints, 4 env vars, 2 tables, helper getSupabaseAdmin
- `docs/CHANGELOG.md` (MODIFIÉ) : Cette entrée

### Fichiers créés
- `sql/002_user_integrations.sql`
- `api/google-auth-init.js`
- `api/google-auth-callback.js`
- `api/calendar.js`
- `api/assistant-orchestrator.js`
- `api/assistant-draft-message.js`
- `assistant.html`

### Fichiers modifiés
- `SPEC-ASSISTANT-ORGANISATIONNEL-LEON.md`
- `api/_auth.js`
- `vercel.json`
- `parametres.html`
- `index.html`
- `acquereurs.html`
- `social.html`
- `dvf.html`
- `micro.html`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/API-MAP.md`
- `docs/CHANGELOG.md`

### Points d'attention / prérequis manuels
- **Migration SQL** : Exécuter `sql/002_user_integrations.sql` dans Supabase SQL Editor
- **Variables Vercel** : Ajouter `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (`https://avecleon.fr/api/google-auth-callback`), `SUPABASE_SERVICE_ROLE_KEY`
- **Google Cloud Console** : Ajouter scopes `calendar.readonly` + `calendar.events`, URI de redirection OAuth
- Feature non testée en production — nécessite les prérequis ci-dessus

### Prochaines étapes prioritaires
- Configurer les prérequis manuels et tester le flux OAuth complet
- Tester le flux conversationnel multi-turn (créneaux → confirmation → création)
- Ajouter la gestion des rappels (`create_reminder`) dans une future version

---

## Session 2026-02-24 (a) — Documentation initiale

### Modifications
- **CLAUDE.md** (racine) : Créé par l'utilisateur — définit les règles de comportement Claude Code, les conventions de documentation, le nommage, le logging structuré et les checklists de session
- **docs/ARCHITECTURE.md** : Créé — documentation complète de l'architecture (arborescence, flux de données, schéma BDD 10 tables, APIs, workflows, charte graphique)
- **docs/DECISIONS.md** : Créé — 15 décisions techniques documentées (vanilla JS, Supabase, Google OAuth, Whisper, Claude Haiku, Vercel, RLS, localStorage, workflows, etc.)
- **docs/API-MAP.md** : Créé — cartographie de 10 endpoints backend + 3 APIs externes + opérations Supabase CRUD + variables d'environnement
- **docs/CHANGELOG.md** : Créé — ce fichier
- **tasks/todo.md** : Créé — plan de tâches initialisé
- **tasks/lessons.md** : Créé — fichier de leçons initialisé
- **ARCHITECTURE.md** (racine) : Supprimé — déplacé vers `docs/ARCHITECTURE.md`

### Fichiers créés/modifiés
- `CLAUDE.md` (par l'utilisateur)
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/API-MAP.md`
- `docs/CHANGELOG.md`
- `tasks/todo.md`
- `tasks/lessons.md`

### Points d'attention / bugs connus
- `pipeline-acquereurs.html` est toujours à nettoyer (fichier deprecated)
- `reset-password.html` est un artefact non utilisé (auth Google uniquement)
- Fichiers HTML volumineux (index.html ~8600 lignes, acquereurs.html ~5400 lignes) — refactoring à envisager

### Prochaines étapes prioritaires
- Ajouter les blocs commentaires de 2-5 lignes en tête de chaque fichier JS/HTML (convention CLAUDE.md)
- Mettre en place le logging structuré par module (`[DVF]`, `[Pipeline]`, etc.)
- Nettoyer `pipeline-acquereurs.html`
