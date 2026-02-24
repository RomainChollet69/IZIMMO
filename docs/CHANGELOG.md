# CHANGELOG — Historique des modifications

> Log horodaté de chaque session de travail avec fichiers touchés et décisions prises.

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
