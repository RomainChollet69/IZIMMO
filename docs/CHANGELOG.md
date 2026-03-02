# CHANGELOG — Historique des modifications

> Log horodaté de chaque session de travail avec fichiers touchés et décisions prises.

---

## Session 2026-03-02d — Bouton "Demander un retour" visite acquéreur + fix ton vouvoiement

### Résumé
Ajout d'un bouton `💬 Demander un retour` directement sur chaque visite effectuée dans l'onglet Matching de la fiche acquéreur. Ce bouton ouvre un popup dédié qui génère un message IA contextualisé (avec le bien visité : ville, type) et ouvre automatiquement l'appli correspondante (SMS/WhatsApp/Email) avec le message pré-rempli. Correction du ton vouvoiement qui produisait parfois un langage familier ("Salut !").

### Modifications

**`acquereurs.html`** :
- Requête visits enrichie : ajout `property_type` au join sellers (`sellers(first_name, last_name, address, property_type)`)
- Nouveau bouton `💬 Demander un retour` (classe `.visit-action-msg`, violet) dans `renderVisitCard()` pour les visites `effectuee`
- Styles CSS du popup retour visite (`.visit-retour-popup`, channel bar, output, actions)
- Nouvelle fonction `openVisitRetourPopup(visitId)` : popup complet avec sélection canal, génération IA, ouverture auto de l'appli, actions (copier, SMS, WhatsApp, Email, régénérer, sauver en note)
- Helper `openChannelApp(message)` : ouvre SMS/WhatsApp/Email avec numéro/email et message pré-remplis
- Fix z-index popup tu/vous : `10000` → `30000` pour passer au-dessus du popup retour visite (`25000`)

**`api/generate-message.js`** :
- Tone vouvoiement renforcé : interdit "Salut", "Hey", "Coucou", "Hello", impose "Bonjour" + prénom
- Séparation `isRetourVisite` en `isRetourVisiteSeller` (leadType !== 'buyer') et `isRetourVisiteBuyer` (leadType === 'buyer')
- Nouveau system prompt dédié acquéreur `retour_visite` : message court et naturel demandant le ressenti, mention du bien visité (ville/type)
- Ajout champ `agencyName` dans le body (signature agent complète : "Prénom Nom, Réseau")
- Signature `agentSignature` utilisée dans tous les prompts (remplace `agentFirstName`)

### Fichiers créés/modifiés
- `acquereurs.html` (bouton, popup, CSS, JS, requête visits)
- `api/generate-message.js` (prompt buyer, tone fix, signature)

### Points d'attention
- Le scénario `retour_visite` depuis l'onglet Messages IA (classique) fonctionne toujours mais sans le contexte spécifique du bien visité — seul le popup depuis la carte visite passe le `customPrompt` avec ville/type
- Le bouton n'apparaît que sur les visites `effectuee`, pas sur les planifiées ou annulées

### Prochaines étapes prioritaires
- Tester la génération retour visite avec les 3 canaux + tu/vous
- Vérifier que le vouvoiement ne produit plus de "Salut" après le fix
- Tester l'ouverture auto de l'appli sur mobile (iOS + Android)

---

## Session 2026-03-02c — Page Visites (vue centrée biens)

### Résumé
Création d'une page dédiée `visites.html` pour gérer les visites de biens, groupées par propriété vendeur. Permet d'enregistrer des visiteurs libres (non qualifiés) et de les promouvoir en acquéreurs. Accessible via un FAB sur la page acquéreurs et le menu "Plus..." mobile.

### Modifications

**`visites.html`** (NOUVEAU) :
- Vue accordéon groupée par bien vendeur avec badges (nb visites, prochaine date, effectuées)
- Stats rapides : visites aujourd'hui, cette semaine, retours en attente
- Filtres par statut, date range, recherche textuelle
- Modal création visite : choix visiteur libre (nom/tél/email) ou acquéreur existant
- Modal feedback post-visite : chips ressenti, points +/-, prix, quartier, décision
- Promotion visiteur libre → acquéreur avec liaison automatique des visites
- Responsive mobile complet (header caché, stats scrollables, bottom nav)
- Auth guard via getCurrentUserId() + redirection login

**`acquereurs.html`** :
- Ajout FAB flottant "Visites" en bas à droite avec compteur de visites planifiées
- CSS responsive du FAB (desktop : texte + icône, mobile : icône seule au-dessus de la bottom bar)

**`js/mobile-nav.js`** :
- Ajout "Visites" dans le menu "Plus..." de la navigation mobile

### Migration DB requise
```sql
ALTER TABLE visits ADD COLUMN IF NOT EXISTS visitor_phone text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS visitor_email text;
```

### Fichiers créés/modifiés
- `visites.html` (NOUVEAU)
- `acquereurs.html` (FAB + CSS + JS compteur)
- `js/mobile-nav.js` (MORE_ITEMS)

### Points d'attention
- Les constantes de feedback (FEEDBACK_LABELS, etc.) sont dupliquées entre acquereurs.html et visites.html — à extraire dans un fichier partagé lors d'un refactoring futur
- La migration DB (visitor_phone, visitor_email) doit être exécutée manuellement dans Supabase Dashboard

### Prochaines étapes prioritaires
- Exécuter la migration SQL dans Supabase
- Tester le flow complet : créer visite libre → retour → promotion → vérifier dans acquéreurs
- Ajouter un lien depuis les fiches vendeurs vers leurs visites (optionnel)

---

## Session 2026-03-02b — Cockpit quotidien Léon (Guide intelligent)

### Résumé
Création de `leon.html`, une page de coaching proactif qui analyse les données CRM (Supabase) et Google Agenda pour proposer un parcours de tâches priorisées chaque matin. Léon guide l'agent immobilier étape par étape : debriefs de visite, relances en retard, leads inactifs, workflows à compléter.

### Modifications

**`leon.html`** (NOUVEAU) :
- Page complète avec greeting personnalisé + avatar Léon
- Moteur de priorisation : P1 (debriefs visite via Calendar), P2 (relances retard), P3 (relances du jour), P4 (leads inactifs 5j+), P5 (workflows en retard), P6 (suggestions)
- 8 requêtes Supabase + Calendar en parallèle (`Promise.all`)
- Matching automatique événements Calendar → leads (score nom + adresse)
- Formulaire de debrief visite complet (ressenti, points +/-, prix, quartier, décision)
- Recherche autocomplete pour associer manuellement un lead quand pas de match
- Actions : appeler (tel:), reporter +7j, marquer fait, planifier relance +3j, compléter workflow step
- Barre de progression + état final "Bravo"
- Persistance localStorage (reprise dans les 4h)
- Responsive mobile + desktop
- Fallback gracieux si Calendar non connecté (P2-P6 fonctionnent)

**`home.html`** :
- Ajout 8ème tuile "Mon Guide" (icône compass, lien leon.html)
- Suppression centrage dernière tuile impaire (grille paire maintenant)

**`js/mobile-nav.js`** :
- Ajout "Mon Guide" en premier dans MORE_ITEMS

**`docs/ARCHITECTURE.md`** :
- Ajout leon.html et mobile-nav.js dans l'arborescence

### Fichiers créés/modifiés
- leon.html (NOUVEAU)
- home.html
- js/mobile-nav.js
- docs/ARCHITECTURE.md
- docs/CHANGELOG.md

### Points d'attention / bugs connus
- Le matching Calendar → lead repose sur des mots-clés dans le titre d'événement — si l'agent utilise des titres très différents, les visites ne seront pas détectées
- La table `visits` doit accepter les inserts sans `seller_id` ni `buyer_id` (retour libre sans association)
- Le cockpit ne récupère pas les workflow_steps liés à des leads spécifiques (pas de JOIN pour le nom du lead dans les cartes P5)

### Prochaines étapes prioritaires
- Améliorer les cartes workflow P5 en fetchant le nom du lead associé
- Ajouter des transitions animées entre les cartes
- Possibilité de choisir entre 2-3 parcours ("relances d'abord" vs "debriefs d'abord")
- Tester avec des données réelles sur l'environnement de production

---

## Session 2026-03-02a — Page tutoriels + recherche globale fonctionnelle

### Résumé
Création de la page `tutoriels.html` (centre de formation placeholder avec 8 cartes thématiques) et activation de la recherche globale depuis la home : le paramètre `?search=` est désormais lu par `index.html` au chargement pour pré-remplir et filtrer le pipeline vendeurs.

### Modifications

**`tutoriels.html`** (NOUVEAU) :
- Page complète avec header, icône graduation cap, titre "Tutoriels & Formation"
- 2 sections : "Premiers pas" (4 cartes) + "Fonctionnalités avancées" (4 cartes)
- Chaque carte a icône colorée, titre, description, badge "Bientôt"
- CTA "Retour à l'accueil" en bas de page
- Responsive (1 colonne mobile, 2 colonnes desktop)
- Inclut css/mobile.css, js/gamification.js, js/mobile-nav.js

**`index.html`** :
- Ajout lecture du paramètre URL `?search=<query>` au chargement
- Pré-remplit le champ de recherche et lance `filterLeads()` automatiquement
- Nettoie l'URL après lecture (`history.replaceState`)

**`home.html`** :
- Tuile Tutoriels pointe maintenant vers `tutoriels.html` (plus de toast placeholder)
- Suppression du JS `initTutoriels()` devenu inutile

### Fichiers créés/modifiés
- tutoriels.html (NOUVEAU)
- index.html
- home.html

### Prochaines étapes prioritaires
- Enrichir les tutoriels avec du contenu réel (vidéos, guides pas à pas)
- Ajouter des illustrations 3D dédiées pour les tuiles home sans image
- V2 : contexte personnalisé sur la home (relances du jour, leads urgents)

---

## Session 2026-03-01g — Fix message onboarding

### Résumé
Correction du message du bandeau d'accueil affiché aux nouveaux utilisateurs. L'ancien texte référençait le pipeline alors qu'il n'est pas visible à ce stade (seul l'écran micro est affiché).

### Modifications

**`index.html`** (modifié) :
- Bandeau `#welcomeBanner` : "Voici à quoi ressemblera ton pipeline…" → "Bienvenue ! Crée ton premier lead pour démarrer ton pipeline."

**`acquereurs.html`** (modifié) :
- Bandeau `#welcomeBanner` : même correction, adapté acquéreurs → "Bienvenue ! Crée ton premier acquéreur pour démarrer ton pipeline."

### Fichiers créés/modifiés
- `index.html`
- `acquereurs.html`

### Points d'attention / bugs connus
- Aucun

### Prochaines étapes prioritaires
- Aucune liée à cette modification

---

## Session 2026-03-01f — Retour visite IA + correctifs micro/pipeline

### Résumé
Correction de multiples bugs (transcription 502, création lead depuis micro, visites non affichées côté vendeur, messages IA acquéreurs), puis implémentation de la génération de message retour de visite pour les vendeurs avec popup tu/vous.

### Modifications

**`api/transcribe.js`** (modifié) :
- Fix 502 : nettoyage MIME type (strip `;codecs=opus` → `audio/webm`)
- Ajout du détail d'erreur OpenAI dans la réponse

**`api/generate-message.js`** (modifié) :
- Nouveau scénario `retour_visite` dans `sellerScenarios`
- System prompt dédié avec 3 exemples réels de messages d'agent immobilier
- Accepte `agentName` et `tone` (tu/vous) depuis le frontend
- `toneRule` dynamique remplace le vouvoiement en dur
- Signature automatique avec le prénom de l'agent

**`micro.html`** (modifié) :
- Fix `contact_date` : déplacé dans le bloc buyer-only (n'existe pas dans sellers)
- Fix statut par défaut : `hot` pour vendeurs, `nouveau` pour acquéreurs
- Ajout `postMessage` vers le parent après création de lead

**`index.html`** (modifié) :
- Listener `message` pour rafraîchir le pipeline après création micro
- Fix badge-alert / match-indicator overlap
- Fix ReferenceError `matchCount` (utilisé avant déclaration `const`)
- Fix doublon téléphone sur les cartes
- Ajout constantes manquantes (POSITIVE_POINTS, NEGATIVE_POINTS, NEIGHBORHOOD_LABELS)
- Bouton "💬 Message retour" sur les visites effectuées avec feedback
- Fonction `generateVisitRetourMessage(visitId)` : bascule vers Messages IA avec données pré-injectées
- Option `retour_visite` dans le select scénario
- Popup tu/vous (`askTone()`) avant chaque génération de message
- Bouton + Lead repositionné (`right: 32px`)

**`acquereurs.html`** (modifié) :
- Listener `message` pour rafraîchir après création micro
- Fix `getBuyerLeadData` null-safe (optional chaining)
- Passage `agentName` et `tone` à l'API
- Popup tu/vous avant génération

### Fichiers créés/modifiés
- `api/transcribe.js`
- `api/generate-message.js`
- `micro.html`
- `index.html`
- `acquereurs.html`

### Points d'attention / bugs connus
- Les console.log de debug visites sont toujours présents (diagnostic)
- Le CSV import acquéreurs n'a pas été vérifié par l'utilisateur

### Prochaines étapes prioritaires
- Tester le retour visite avec différents profils (coup de coeur vs pas convaincu)
- Nettoyer les console.log de debug
- Vérifier l'import CSV acquéreurs

---

## Session 2026-03-01e — Double compteur mensuel + page barème Paramètres

### Résumé
Ajout d'un compteur mensuel (reset au 1er du mois) en complément du score total carrière. Le header continue d'afficher uniquement le score total. Nouvelle section "Mes performances" dans la page Paramètres avec 3 cartes stats (total, mois, streak) et le barème complet des 18 actions gamifiées.

### Modifications

**`sql/010_gamification_monthly.sql`** (NOUVEAU) :
- ALTER TABLE `gamification_profiles` : ajout `monthly_points` (INT) + `month_year` (TEXT)
- Le reset se fait côté client au chargement, même pattern que le reset quotidien

**`js/gamification.js`** (modifié) :
- Ajout `monthStr()` helper + champs `monthly_points`/`month_year` dans `createProfile()` et `saveProfile()`
- Reset mensuel dans `initGamification()` quand `month_year` change
- Incrémentation `monthly_points` dans `awardPoints()` et `awardDailyStreak()`

**`parametres.html`** (modifié) :
- Nouvelle section "Mes performances" en première position (avant "Mon Profil")
- 3 cartes stats : score total (doré), mois en cours (violet), streak (orange si actif)
- Barème des 18 actions trié par points décroissants
- Tips bonus x2 et streak
- Responsive mobile : grille 3→1 colonne
- Fonction `loadGamificationStats()` appelée au chargement

### Fichiers créés/modifiés
- sql/010_gamification_monthly.sql (nouveau)
- js/gamification.js (4 modifications)
- parametres.html (CSS + HTML section + JS loader)
- docs/ARCHITECTURE.md, docs/CHANGELOG.md

### Points d'attention
- La migration SQL `010_gamification_monthly.sql` doit être exécutée APRÈS `009_gamification.sql` dans Supabase
- Le premier mois démarre à 0 pour tous les utilisateurs existants

### Prochaines étapes prioritaires
- Exécuter les deux migrations SQL dans Supabase
- Tester le cycle complet : action → vérifier monthly_points sur parametres.html
- V2 : historique mensuel, meilleur mois, classement entre agents

---

## Session 2026-03-01d — Système de gamification dopaminergique

### Résumé
Ajout d'un système de gamification complet pour encourager l'utilisation quotidienne du CRM. Chaque action (créer un lead, ajouter une note, compléter un workflow, etc.) rapporte des points avec feedback visuel immédiat (toast doré, compteur dans le header). Mécaniques dopaminiques : bonus x2 aléatoire (10%), streak journalier, célébrations milestone avec confettis.

### Modifications

**`sql/009_gamification.sql`** (NOUVEAU) :
- Table `gamification_log` : historique des événements points (action_type, points, multiplier, context JSONB)
- Table `gamification_profiles` : profil agrégé (total_points, streak, level, actions_today)
- RLS + index sur les deux tables

**`js/gamification.js`** (NOUVEAU) :
- Module IIFE auto-contenu (~350 lignes) avec styles CSS injectés
- 18 types d'actions gamifiées avec barème de points (3 à 100 pts)
- Compteur doré dans le header + badge streak orange
- Toast points après chaque action (2s, dégradé or)
- Bonus x2 aléatoire (10% de chance, toast spécial rouge/rose)
- Streak journalier (≥3 actions/jour → +15 pts bonus)
- Célébrations milestone à 100, 500, 1000, 5000 pts (overlay + confettis)
- Gestion iframe (micro.html) via postMessage
- API publique : `window.awardPoints(actionType, context)`

**8 pages HTML** (script tag ajouté) :
- index.html, acquereurs.html, social.html, parametres.html, home.html, dvf.html, assistant.html, micro.html

**index.html** (+14 appels awardPoints) :
- create_lead (formulaire + onboarding)
- add_note, voice_note, upload_document
- plan_visit, visit_feedback
- move_stage, lead_to_mandate, lead_to_sold
- complete_workflow_step (clic + voix), complete_workflow (clic + voix)

**acquereurs.html** (+10 appels awardPoints) :
- create_lead, add_note, voice_note, upload_document
- plan_visit, visit_feedback, move_stage
- complete_workflow_step (clic + voix), complete_workflow (clic + voix)

**js/social.js** (+3 appels) : create_social_post (libre + suggestion), publish_social_post
**js/todo-widget.js** (+1 appel) : complete_todo
**js/relance-widget.js** (+1 appel) : dismiss_reminder
**micro.html** (+1 appel) : create_lead

### Fichiers créés/modifiés
- sql/009_gamification.sql (nouveau)
- js/gamification.js (nouveau)
- index.html, acquereurs.html, social.html, parametres.html, home.html, dvf.html, assistant.html, micro.html (script tag)
- js/social.js, js/todo-widget.js, js/relance-widget.js (1-3 lignes chacun)
- docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/CHANGELOG.md

### Points d'attention / bugs connus
- La migration SQL `009_gamification.sql` doit être exécutée manuellement dans Supabase SQL Editor avant que le système fonctionne
- Les points existants des utilisateurs commenceront à 0 (pas de migration rétroactive)
- En cas de double-onglet, le compteur actions_today peut être légèrement désynchronisé (acceptable pour V1)

### Prochaines étapes prioritaires
- Exécuter la migration SQL dans Supabase
- Tester le cycle complet : créer lead → ajouter note → 3e action → streak
- Dashboard gamification (V2) : historique, classement, badges
- Confettis améliorés (lib canvas-confetti pour un meilleur rendu)

---

## Session 2026-03-01c — Création de la page d'accueil HOME (cockpit Léon)

### Résumé
Création d'une nouvelle page d'accueil (`home.html`) qui devient le point d'entrée principal de Léon. La page affiche un message d'accueil personnalisé, une barre de recherche globale avec bouton micro, et une grille de 7 tuiles métiers (Pipeline vendeurs, Pipeline acquéreurs, Marché/DVF, Community management, Assistant agenda, Paramètres, Tutoriels). Tous les logos et redirections de login pointent désormais vers `home.html` au lieu de `index.html`.

### Modifications

**`home.html`** (NOUVEAU) :
- Page complète avec header, bienvenue personnalisée ("Bonjour [Prénom]" + date), barre de recherche globale + micro
- Grille de 7 tuiles métiers avec layout horizontal (icône/illustration + label)
- Tuiles avec illustrations 3D existantes (Leon.png, lea_social.png) ou icônes FontAwesome sur fond pastel
- Tuile Tutoriels avec toast "Bientôt disponible" (page pas encore créée)
- Recherche V1 : Enter redirige vers `index.html?search=<query>`
- Bouton micro redirige vers `micro.html`
- Responsive : 3 colonnes desktop, 2 colonnes tablette/mobile, bottom bar mobile
- Auth guard via js/auth.js (même pattern que toutes les pages protégées)

**`index.html`** : logo href → `home.html`
**`acquereurs.html`** : logo href → `home.html`
**`dvf.html`** : logo href → `home.html`
**`social.html`** : logo href → `home.html`
**`micro.html`** : logo desktop + logo mobile href → `home.html`
**`parametres.html`** : logo href → `home.html`
**`assistant.html`** : logo href → `home.html`
**`js/auth.js`** : mobile header logo href → `home.html`
**`login.html`** : 3 redirections post-login → `home.html` (session existante, Google OAuth, login email)
**`reset-password.html`** : redirection post-reset → `home.html`

### Fichiers créés/modifiés
- home.html (NOUVEAU)
- index.html, acquereurs.html, dvf.html, social.html, micro.html, parametres.html, assistant.html
- js/auth.js
- login.html, reset-password.html

### Points d'attention / bugs connus
- `tutoriels.html` n'existe pas encore — la tuile affiche un toast placeholder
- La recherche globale V1 redirige simplement vers le pipeline vendeurs — une vraie recherche cross-tables viendra en V2
- Vérifier que `home.html` est ajouté aux Redirect URLs dans Supabase Auth dashboard (pour le Google OAuth)
- `index.html` ne lit pas encore le paramètre `?search=` au chargement — à ajouter si la recherche globale doit pré-remplir le champ

### Prochaines étapes prioritaires
- Ajouter la lecture du paramètre `?search=` sur `index.html` au chargement
- Créer `tutoriels.html` avec contenu onboarding
- Ajouter des illustrations 3D dédiées pour les tuiles sans image (acquéreurs, marché, assistant, paramètres)
- V2 : contexte personnalisé sur la home (nombre de relances du jour, leads urgents)
- V2 : recherche globale cross-tables (sellers + buyers + villes)

---

## Session 2026-03-01b — DVF : corrections UX InfoWindow + système de sélection + détail dépliable

### Résumé
Session d'itérations UX sur la page DVF basée sur les retours utilisateur. Correction des InfoWindows (styles inline obligatoires pour Google Maps), remplacement du système de comparaison par un système de sélection (panier pour étude de marché), affichage surfaces maisons, et détail dépliable dans les InfoWindows multi-parcelle.

### Modifications

**`dvf.html`** :

**InfoWindows — Corrections critiques** :
- Revert CSS classes → inline styles (Google Maps ignore les `<style>` dans les InfoWindows)
- Consolidation des overrides CSS `.gm-style-iw-*` (suppression doublons)
- Fix double attribut `style` sur les lignes multi-sale
- InfoWindow `maxWidth: 340` défini sur l'objet JS (plus fiable que CSS)

**InfoWindows — UX maisons** :
- Séparation surface bâtie / surface terrain pour les maisons : `🏠 138 m² bâtis · 🌳 252 m² terrain`
- Distance mise sur ligne séparée : `📍 à 113 m du centre` (au lieu de "Maison 138 m² à 113 m")
- Suppression section "Plus de détails" redondante (répétait les infos déjà visibles)
- Multi-sale : affiche `130 m² + 252 m² terr.` pour les maisons

**InfoWindows — Détail dépliable (multi-parcelle)** :
- Chaque vente a un chevron ▾ cliquable qui déplie un panneau de détail inline
- Détail : surfaces (bâtie + terrain), prix/m², date, distance, bouton "Sélectionner"
- Plus besoin d'aller dans le side panel pour voir le détail complet

**Système de sélection (remplace la comparaison)** :
- Suppression complète du système de comparaison (CSS, HTML, JS)
- Nouveau système : sélection de ventes pour étude de marché (max 20)
- Panel flottant à droite de la carte avec liste des ventes sélectionnées
- Bouton × visible par ligne pour supprimer une sélection individuelle
- Bouton "Sélectionner" dans les InfoWindows (single + multi-sale)
- Export CSV de la sélection (séparateur `;`, BOM UTF-8)
- Fonction `clearSelection()` pour tout vider

**Side panel — Réorganisation** :
- Section ventes/détail remontée au-dessus du graphique d'évolution des prix
- Vue détail compacte : surface+date sur une ligne, distance en dessous, prix/m² + sélection côte à côte
- Auto-ouverture du panel + scrollIntoView au clic sur une vente

**Performance** :
- `MAX_PARCELS` revert de 2000 à 500 (chargement trop lent avec clustering)

### Fichiers modifiés
- `dvf.html`

### Points d'attention
- Les InfoWindows Google Maps **nécessitent** des styles inline — les classes CSS définies dans `<style>` ne fonctionnent pas de manière fiable
- Le clustering MarkerClusterer est conservé mais avec MAX_PARCELS=500 pour garder de bonnes performances

### Prochaines étapes prioritaires
- Tester sur mobile (responsive 375px)
- Envisager d'augmenter MAX_PARCELS progressivement si les perfs le permettent

---

## Session 2026-03-01 — Refonte page DVF (Performance + UX + Fonctionnalités)

### Résumé
Amélioration globale de la page DVF (dvf.html) en 3 phases : quick wins performance/UX, fonctionnalités clés, et polish. 13 améliorations implémentées.

### Modifications

**`dvf.html`** :

**Phase 1 — Performance & UX** :
- CSS : Variables `--dpe-a` à `--dpe-g` et `--z-*` dans `:root` — source unique de vérité pour couleurs DPE et z-index
- CSS : Bloc responsive 768px entièrement refait — header simplifié, side panel en overlay fixe, FAB toggle, carte plein écran, breakpoint 480px ajouté
- JS : `Promise.all()` pour chargement départements DVF + DPE (au lieu de boucle séquentielle)
- JS : Fonction `cachedReverseGeocode()` — cache Map pour éviter les appels API redondants
- JS : Debounce 150ms dans `initDualRange()` pour les sliders (évite freeze mobile)
- HTML : Styles inline DPE supprimés des boutons, remplacés par classes CSS `[data-class]`
- HTML : Toggle panel : icône `fa-sliders` / `fa-times` avec FAB rond violet

**Phase 2 — Fonctionnalités clés** :
- JS : Intégration `@googlemaps/markerclusterer` via CDN — clustering automatique, `MAX_PARCELS` augmenté de 500 → 2000
- JS : Fonction `renderPriceChart()` — sparkline SVG évolution prix médian/m² par année, avec gradient sous courbe
- HTML : Section `#chartSection` ajoutée après les stats
- JS : Infinite scroll via `IntersectionObserver` + `DocumentFragment` (remplace bouton "Voir plus" hardcodé à 100)
- CSS : Classes `.iw-*` pour InfoWindows (remplace 50+ lignes de CSS inline par popup)

**Phase 3 — Polish** :
- JS : Event delegation sur `#typeGrid`, `#dpeClassGrid`, `#dpeDateGrid` (remplace forEach + addEventListener)
- JS : Fonction `exportCSV()` — export CSV séparé `;` avec BOM UTF-8
- HTML : Bouton export ajouté dans le header
- JS : Système de comparaison de biens — `toggleCompare()`, `showComparison()`, tableau côte à côte (max 3 biens)
- CSS : Styles `.compare-*` pour boutons, barre flottante, et tableau comparatif

### Fichiers créés/modifiés
- `dvf.html` (3118 → 3602 lignes)

### Points d'attention / bugs connus
- Le clustering MarkerClusterer charge via CDN (unpkg) — dépendance externe
- L'infinite scroll utilise `IntersectionObserver` — IE non supporté (mais déjà le cas pour le reste de l'app)
- Le CSS `.show-more-btn` est orphelin (remplacé par infinite scroll) mais ne gêne pas

### Prochaines étapes prioritaires
- Tester en conditions réelles sur mobile (iPhone, Android)
- Vérifier le clustering avec des zones à haute densité (Paris, Lyon)
- Envisager un mode heatmap optionnel (overlay chaleur prix/m²)

---

## Session 2026-02-28d — Barre de recherche leads

### Résumé
Ajout d'une barre de recherche texte instantanée sur les deux pipelines (vendeurs + acquéreurs). Filtre en temps réel par nom, ville, téléphone, email, source.

### Modifications

**`index.html`** :
- CSS : section `/* ===== SEARCH TOOLBAR ===== */` (styles barre, focus, compteur, clear button)
- HTML : `<div class="search-toolbar">` insérée entre le header et les mobile-tabs
- JS : `filterLeads(searchTerm)` — masque/affiche les cards en cherchant dans l'objet `sellers[]`
- JS : `setupSearchToolbar()` — event listeners (input, clear, Escape, Cmd+K)
- JS : `updateCounts()` modifié — compte les cards DOM visibles quand un filtre est actif

**`acquereurs.html`** :
- Mêmes modifications CSS/HTML
- JS : `filterBuyers(searchTerm)` — équivalent pour `buyers[]` (champs : nom, téléphone, email, secteur, source)
- JS : `setupSearchToolbar()` + `updateCounts()` modifié

### Fichiers créés/modifiés
- `index.html`
- `acquereurs.html`

### Points d'attention
- Les cards exemple (onboarding) sont masquées pendant la recherche active
- Le filtre est purement côté client (pas de requête Supabase)

### Prochaines étapes prioritaires
- Éventuellement : filtres par source ou par statut (boutons toggle)

---

## Session 2026-02-28c — Actions relances + fix arrondissements

### Résumé
Deux améliorations : (1) boutons d'action rapide dans le widget relances (repousser +7j / supprimer), (2) correction de l'ordinal français des arrondissements (1er au lieu de 1ème).

### Modifications

**`js/relance-widget.js`** :
- CSS : `.relance-actions`, `.relance-action-btn` (hover desktop, toujours visible mobile)
- HTML : boutons ⏰ (+7j) et ✅ (fait) sur chaque ligne
- JS : `snoozeRelance()` et `dismissRelance()` — UPDATE DB + mise à jour locale
- Constante `SNOOZE_DAYS = 7`

**`index.html`** :
- Fix `addArrondissement()` : helper `ordinal()` — 1er, 2e, 3e… (au lieu de 1ème, 2ème)

### Fichiers modifiés
- `js/relance-widget.js`
- `index.html`
- `docs/CHANGELOG.md`

### Points d'attention
- Les boutons relance mettent à jour la DB directement (pas de re-fetch, update local)

---

## Session 2026-02-28b — Actions rapides dans le widget Relances (snooze/dismiss)

### Résumé
Ajout de 2 boutons d'action rapide sur chaque ligne du widget relances : "Repousser +7j" (⏰) et "Fait" (✅). Permet de gérer les relances directement depuis le panneau sans ouvrir chaque fiche.

### Modifications

**`js/relance-widget.js`** :
- CSS : styles `.relance-actions`, `.relance-action-btn` (hover desktop, toujours visible mobile)
- HTML : 2 boutons par ligne dans `renderRelances()` avec `event.stopPropagation()`
- JS : `snoozeRelance(id, leadType)` — UPDATE reminder +7j en DB + mise à jour locale
- JS : `dismissRelance(id, leadType)` — UPDATE reminder = null en DB + retrait local
- Exposition globale : `window.relanceWidget.snooze()` et `.dismiss()`
- Constante : `SNOOZE_DAYS = 7`

### Fichiers créés/modifiés
- `js/relance-widget.js`
- `docs/CHANGELOG.md`

### Points d'attention
- Les boutons sont visibles au survol sur desktop, toujours visibles sur mobile
- La mise à jour est locale (pas de re-fetch DB) pour la réactivité
- Le compteur de la cloche se met à jour automatiquement après chaque action

---

## Session 2026-02-28 — Création de leads depuis micro + amélioration parsing vocal + date contact acquéreur

### Résumé
Trois volets : (1) la page micro peut désormais créer des leads directement dans Supabase quand un contact dicté n'est pas reconnu, avec une carte de création affichant les données extraites, (2) amélioration du parsing vocal pour distinguer les contacts à créer des simples mentions contextuelles (propriétaires, etc.), (3) ajout du champ "Date de contact" dans le formulaire acquéreur.

### Modifications

**`api/parse-voice-note.js`** :
- `unmatched_contacts` retourne désormais des objets structurés (name, suggested_type, first_name, last_name, budget_max, property_type, rooms, sector, criteria, phone, email, note_content) au lieu de simples strings
- Règles de prompt ajoutées : ne créer des leads que pour les contacts explicitement demandés, pas pour les mentions contextuelles (ex: propriétaires de biens)
- `max_tokens` augmenté de 800 à 1200 pour accommoder les réponses plus riches

**`micro.html`** :
- Réécriture de `showNoMatch` : affiche une carte de création avec les données extraites (budget, type de bien, secteur, critères en tags) et boutons de sélection Acquéreur/Vendeur
- Nouvelle fonction `createNewLeadFromMicro` : insert direct dans Supabase (table `buyers` ou `sellers`) + ajout de la transcription comme première note
- Nouvelles fonctions `selectLeadType` et `resetToIdle`, exposées sur `window` (fix fermeture IIFE)
- Fix `showResult` : affiche toujours les contacts non matchés même quand d'autres matches existent (suppression de la condition `!hasMatches && !hasAmbiguous`)
- Fix `preFilterLeads` : split sur les apostrophes (d'Elsa → elsa matche correctement)
- Fix `showAmbiguous` : garde `Array.isArray` sur `possible_matches`
- `contact_date` initialisé à la date du jour lors de la création d'un lead depuis le micro

**`acquereurs.html`** :
- Ajout du champ "Date de contact" dans le formulaire de création acquéreur (avant "Date de relance")
- `contact_date` inclus dans la collecte de données de `handleSubmit`
- `contact_date` pré-rempli dans la fonction `editBuyer`

### Fichiers créés/modifiés
- `api/parse-voice-note.js`
- `micro.html`
- `acquereurs.html`
- `docs/CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/API-MAP.md`

### Points d'attention
- La création de lead depuis micro insère directement en base — pas de formulaire intermédiaire (voulu pour le flux mobile rapide)
- Le champ `contact_date` des acquéreurs existants sera `null` tant qu'il n'est pas renseigné manuellement
- Les objets structurés de `unmatched_contacts` sont rétro-compatibles : le front gère les deux formats (string et objet)

### Prochaines étapes prioritaires
- Tester le flux complet micro → création lead → vérification en pipeline
- Vérifier que le filtre apostrophe fonctionne sur des noms composés variés
- Ajouter éventuellement le champ `contact_date` côté vendeurs si demandé

---

## Session 2026-02-26c — Date de RDV vendeur + auto-relance J+15

### Résumé
Ajout d'un champ "Date du RDV" sur les fiches vendeurs. Quand un RDV est enregistré sans relance manuelle, une relance automatique est programmée à J+15. Le système de relances existant (widget, badges overdue) prend le relais sans aucune modification.

### Modifications

**`index.html`** :
- Formulaire : champ date conditionnel sous le checkbox "RDV physique effectué"
- `setupAppointmentDateToggle()` : toggle show/hide + pré-remplissage date du jour
- `handleFormSubmit()` : sauvegarde `appointment_date` + logique auto-relance (`reminder = appointment_date + 15j`)
- `editSeller()` : peuplement du champ en édition
- `createSellerCard()` : badge vert `🤝 RDV [date]` dans la vue étendue
- Carte mobile (card deck) : badge RDV après le bloc relance
- Détail mobile (`openMobileDetail`) : badge "RDV effectué le [date]"
- Constante `DAYS_AUTO_REMINDER_AFTER_RDV = 15`

**`sql/005_appointment_date.sql`** :
- Migration : `ALTER TABLE sellers ADD COLUMN appointment_date DATE`

### Fichiers créés/modifiés
- `index.html`
- `sql/005_appointment_date.sql`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/CHANGELOG.md`

### Points d'attention
- La migration SQL doit être exécutée manuellement dans Supabase SQL Editor
- La relance auto ne remplace PAS une relance manuelle existante
- Le champ `rdv_done` (boolean) est conservé pour rétro-compatibilité

### Prochaines étapes prioritaires
- Exécuter la migration SQL en production
- Tester le flux complet : créer lead → cocher RDV → vérifier auto-relance

---

## Session 2026-02-25d — iOS micro fix + Mobile card deck redesign + bugfixes mobile

### Résumé
Trois volets : (1) correction micro iPhone/Chrome avec guide iOS pas-à-pas, (2) redesign complet des cartes mobiles vendeurs avec hiérarchie émotionnelle 3 niveaux, (3) correction de bugs mobile (todo FAB caché, boutons détail coupés).

### Modifications

**Micro iPhone/Chrome (`js/audio-recorder.js` + `micro.html`)** :
- Détection iOS (`_isIOS()`) et navigateur (`_getIOSBrowser()` — CriOS/FxiOS/Safari)
- Pre-check permission micro via `checkMicPermission()` (Permissions API)
- Message d'erreur adapté iOS : marker `__IOS_MIC_BLOCKED__` + guide 5 étapes (Réglages > Apps > Chrome > Micro > Réessayer)
- Screenshot `img/micro_auth.svg` affiché sous le guide (mobile only)
- État `requesting_permission` quand le dialogue natif va apparaître

**Redesign mobile card deck (`index.html`)** :
- Carte `.deck-card` : padding 28px 24px, border-radius 20px, double ombre premium
- Hiérarchie émotionnelle 3 niveaux :
  - Niveau 1 (centré) : nom 24px, relance = bouton d'action, commission = badge
  - Niveau 2 (gauche) : bien, ville, adresse, téléphone bouton tactile
  - Niveau 3 (discret) : source + date côte à côte dans `.mc-context-row`
- Actions : fond #F8FAFC, border-radius 12px, boutons transparents
- Compteur `.deck-position` plus discret (13px, opacity réduite)
- `createMobileCard()` JS réordonné pour suivre la hiérarchie

**Bugfixes mobile (`index.html` + `js/todo-widget.js`)** :
- Todo FAB : `bottom: 20px` → `90px` (au-dessus de la bottom-bar)
- Vue détail overlay : `z-index: 2000` → `10001` (au-dessus de la bottom-bar 9999)
- Padding bas détail : `calc(24px + env(safe-area-inset-bottom))` pour boutons visibles

### Fichiers créés/modifiés
- `js/audio-recorder.js` (détection iOS, pre-check permission, erreurs adaptées)
- `micro.html` (guide iOS, screenshot, état requesting_permission)
- `index.html` (CSS card deck redesign + z-index détail + padding)
- `js/todo-widget.js` (FAB bottom 90px)
- `img/micro_auth.svg` (nouveau — screenshot autorisation micro iOS)
- `vercel.json` (Permissions-Policy microphone header)

### Points d'attention
- iOS WebKit ignore `Permissions-Policy: microphone=(self)` — header gardé mais sans effet
- Pas de moyen programmatique de re-déclencher une permission refusée sur iOS
- Le swipe, tap détail et tap téléphone fonctionnent toujours après le redesign

### Prochaines étapes prioritaires
- Tester le redesign cartes sur différents iPhones (tailles écran)
- Vérifier le guide micro sur Safari iOS (pas seulement Chrome)

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

## Session 2026-02-26c — Rejet match acquéreur + estimation travaux matching

### Résumé
Deux ajouts au système de matching : (1) le rejet de match côté acquéreur (×, modale raison, section écartés repliable, restauration) — miroir de ce qui existait côté vendeur, et (2) un champ "Estimation travaux" dans l'onglet Gestion Mandat qui impacte le calcul de matching budget (prix + travaux vs budget acquéreur).

### Modifications

**Rejet match côté acquéreur (`acquereurs.html`)** :
- Bouton × sur chaque carte vendeur dans l'onglet Matching
- Modale "Pourquoi ce match ne colle pas ?" avec 5 raisons (budget, localisation, surface, type de bien, autre)
- Section "écartés" repliable avec bouton Restaurer
- Fonctions : `loadMatchRejections`, `rejectMatch`, `confirmRejectMatch`, `restoreMatch`, `renderSellerMatchCard`
- CSS complet pour le système de rejet

**Estimation travaux (`index.html` + `acquereurs.html`)** :
- Champ "Estimation travaux (€)" dans l'onglet Gestion Mandat (uniquement biens en mandat)
- `calculateMatchScore()` modifié des deux côtés : compare `prix + travaux` vs budget acquéreur
- Migration SQL : colonne `estimated_works` NUMERIC sur la table `sellers`

### Fichiers créés/modifiés
- `acquereurs.html` (rejet match + matching travaux)
- `index.html` (champ travaux dans mandat + matching travaux)
- `sql/004_sellers_estimated_works.sql` (nouveau)
- `docs/DECISIONS.md` (D026, D027)

### Points d'attention
- Migration `sql/004_sellers_estimated_works.sql` exécutée en production
- Le champ travaux est optionnel — si non renseigné, le matching fonctionne comme avant

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

---

## Session 2026-02-28e — Feedback visite enrichi + 5 améliorations acquéreur

### Modifications
- **Feedback visite modifiable + décision acquéreur** : le bouton "Donner un retour" devient "Modifier le retour" si feedback déjà rempli ; ajout champ `buyer_decision` (en_attente, interesse, contre_visite, offre, refus) séparé du feedback agent
- **Feedback enrichi** : ajout points positifs (7 chips multi-select), points négatifs (7 chips), perception quartier (3 options mono-select) — affichés en couleur sur les cartes visite
- **5 améliorations fiche acquéreur** :
  1. Titre "Notes" dédoublé → renommé "Éléments rédhibitoires"
  2. Dealbreakers en chips cliquables (RDC, Mitoyen, Bruit, Étage élevé, Vis-à-vis, Nord) + champ Autre — stocké en CSV
  3. Type de bien "Appart. ou Maison" ajouté + matching adapté (pas d'élimination, score complet)
  4. Biens visités masqués du matching (`await loadMatchingVisits` + filtre `visitedSellerIds`)
  5. Raison de refus "Travaux" ajoutée

### Fichiers créés
- `sql/006_buyers_contact_date.sql`
- `sql/007_visits_buyer_decision.sql`
- `sql/008_visits_feedback_enriched.sql`

### Fichiers modifiés
- `index.html` — feedback enrichi, calculateMatchScore (appartement_ou_maison)
- `acquereurs.html` — feedback enrichi, 5 améliorations, calculateMatchScore, loadMatchingSellers

---

## Session 2026-02-28f — Desktop Bottom Bar + Popup Micro

### Modifications
- **Desktop bottom bar** : barre fixe en bas (fond blanc, 64px) avec recherche à gauche, bouton micro central hero (surélevé, gradient violet), bouton Todo à droite
  - Layout CSS Grid `1fr auto 1fr` pour centrage parfait du micro
  - Masquée sur mobile (< 768px), la mobile bottom bar reste inchangée
- **Popup micro (iframe)** : le bouton micro ouvre une modale contenant micro.html en iframe (`allow="microphone"`)
  - micro.html détecte l'iframe (`window.self !== window.top`) et masque son header + bottom bar
  - Contenu centré verticalement, titre "Appuyez et parlez à Léon" au-dessus du micro (réordonné via CSS `order`)
  - Exemples contextuels : vendeurs (`?context=sellers`) vs acquéreurs (`?context=buyers`)
  - Exemples avec "..." pour montrer qu'on peut en dire plus
- **Header allégé** : tab "Micro" retirée, search-toolbar supprimée (migrée dans bottom bar)
- **Todo widget** : FAB masqué sur desktop (`@media min-width: 769px`), `window.todoToggle` exposé, badge synchronisé avec la bottom bar
- **Léon flottant** : suppression du briefing du header, Léon en vignette ronde (64px) positionnée sur la bottom bar
  - Position et taille à affiner (retour utilisateur : trop petit en bas à gauche)

### Fichiers modifiés
- `index.html` — CSS/HTML bottom bar, modale micro, suppression search-toolbar, suppression nav Micro, Léon vignette, JS search IDs migrés, openMicroModal/closeMicroModal
- `acquereurs.html` — mêmes modifications (sauf Léon)
- `micro.html` — détection iframe, CSS `.in-iframe`, exemples dynamiques par contexte
- `js/todo-widget.js` — masquer FAB desktop, exposer todoToggle, synchro badge bottom bar

### Points d'attention
- Position de Léon flottant à revoir : le bas à gauche gêne la lisibilité. Envisager de le mettre dans le header ou la bottom bar.
- Modale micro : hauteur fixe à 75vh (iframe ne supporte pas height:auto)

### Prochaines étapes prioritaires
- Repositionner Léon (header ? bottom bar ? clic sur logo ?)
- Tester la dictée vocale depuis la popup iframe (permissions micro navigateur)
