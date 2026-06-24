# LESSONS — Erreurs passées & règles apprises

> Chaque correction de l'utilisateur est enregistrée ici pour éviter de répéter les mêmes erreurs.

---

## Leçons récentes (refonte mobile, 2026-06)

### L027 — Vérifier le DOM réel, pas le rapport d'un sous-agent (2026-06-19)
**Erreur** : Un audit délégué a décrit la carte mobile comme appauvrie (sans matching/parrain) en analysant `createMobileCard`/`.deck-card`… qui est du **code mort** (conteneur `display:none`). Le vrai rendu mobile réutilise la `lead-card` desktop. J'ai failli « corriger » un faux problème.
**Règle** : Pour toute affirmation sur le rendu, vérifier sur le DOM live (preview) ce qui est réellement affiché/visible, avant de conclure ou de coder. Les rapports d'agents et le code « présent » ne prouvent pas qu'il est actif.

### L028 — Sur mobile, `resize` se déclenche au scroll (barre d'URL) (2026-06-20)
**Erreur** : Un handler `window.resize` qui re-render la page refermait les sections Visites au scroll : sur mobile, afficher/masquer la barre d'URL change la **hauteur** → événement `resize`.
**Règle** : Dans un handler resize qui re-render, ne réagir que si la **largeur** a changé (mémoriser `lastWidth`). Ignorer les resize en hauteur seule.

### L029 — Cache-buster les JS/CSS partagés à chaque modif (2026-06-20)
**Erreur** : `mobile-nav.js` et `relance-widget.js` étaient inclus sans `?v=` → les conseillers gardaient l'ancienne version en cache après déploiement.
**Règle** : Tout asset partagé modifié (`js/*.js`, `css/*.css`) doit voir son `?v=AAMMJJ` bumpé sur **toutes** les pages qui l'incluent (convention du projet). Si on rééédite le même jour, suffixer (`?v=260620b`).

### L030 — Refontes mobiles derrière un flag réversible (2026-06-19)
**Erreur évitée** : L'utilisateur a explicitement demandé de « garder l'ancienne version si la nouvelle ne convient pas ».
**Règle** : Pour une refonte d'UI conséquente, la mettre derrière un flag booléen (`MOBILE_TILES_V1`, `MOBILE_VISITS_V2`…) sans supprimer l'ancien code, afin de revenir en arrière instantanément.

---

## Règles du projet

1. **Toujours push sur GitHub à la fin de chaque action** — le déploiement Vercel est automatique
2. **Documentation obligatoire** — mettre à jour `docs/` à chaque changement structurel
3. **Résumé de session** — ajouter une entrée dans `docs/CHANGELOG.md` à chaque fin de session
4. **Plan mode par défaut** — entrer en plan mode pour toute tâche non triviale (3+ étapes)

---

## Leçons apprises

### L001 — CSS `display: none` et `style.display = ''` (2026-02-24)
**Erreur** : Mettre `display: none` dans le CSS d'un élément, puis essayer de le montrer avec `el.style.display = ''` ne fonctionne pas — le style inline vide retombe sur la règle CSS qui est toujours `none`.
**Règle** : Toujours utiliser une valeur explicite (`'block'`, `'flex'`) quand on montre un élément dont le CSS par défaut est `display: none`.

### L002 — Tableaux vides sont truthy en JS (2026-02-24)
**Erreur** : `if (allLeads)` retourne `true` même si `allLeads = []`. Un premier chargement qui retourne un tableau vide empoisonne le cache — toutes les requêtes suivantes sautent le fetch.
**Règle** : Toujours vérifier `array && array.length > 0` pour les caches de données.

### L003 — `showTranscription()` doit réinitialiser tous les états d'affichage (2026-02-24)
**Erreur** : `enterEditMode()` cachait `transcriptionText` avec `display: none`, mais `showTranscription()` ne le remettait pas. Le texte disparaissait à la 2e dictée.
**Règle** : Toute fonction qui "reset" un composant doit remettre TOUS les sous-éléments à leur état initial, pas seulement ceux qu'elle modifie directement.

### L004 — Commission immobilière : pas d'honoraires sur les honoraires (2026-02-24)
**Erreur** : `commission = prix × taux%` est faux. On ne prend pas d'honoraires sur les honoraires.
**Règle** : `commission = prix FAI - (prix FAI / (1 + taux/100))`. Le taux s'applique sur le net vendeur. Utiliser `calcCommission()` et `calcRateFromAmount()` définis dans `supabase-config.js`.

### L005 — Chrome iOS a un cache quasi-indestructible (2026-02-25)
**Erreur** : Après modification du code, Chrome sur iPhone servait toujours l'ancienne version (avec un redirect JS vers micro.html). Vider le cache, cookies, ajouter des headers anti-cache, des meta tags, du cache-busting `?v=xxx` sur les scripts — RIEN n'a fonctionné.
**Règle** : Chrome iOS maintient un cache interne très agressif que les mécanismes standards ne contournent pas. La seule solution fiable : **supprimer et réinstaller Chrome**. Safari et Chrome incognito fonctionnent normalement. Préventivement, toujours ajouter `no-cache` headers dans `vercel.json` pour minimiser le problème à l'avenir.

### L006 — Toujours vérifier les credentials OAuth après changement (2026-02-25)
**Erreur** : L'utilisateur a changé le Client Secret Google dans la Google Cloud Console mais n'a pas mis à jour Supabase. Résultat : `Unable to exchange external code` — le login Google est totalement cassé.
**Règle** : Quand un Client Secret OAuth est régénéré, il faut mettre à jour TOUS les services qui l'utilisent (Supabase Dashboard → Auth → Providers → Google). Ajouter un debug visible (alert) est plus efficace que console.log pour diagnostiquer les problèmes d'auth (les redirections vident la console).

### L007 — Ne pas ajouter de redirects entre pages sans tester l'impact (2026-02-25)
**Erreur** : Ajout d'un redirect mobile dans micro.html → index.html pour contourner le cache Chrome. Résultat : micro.html devenait inaccessible sur mobile, cassant l'enregistrement vocal.
**Règle** : Les redirects entre pages ont des effets de bord. Toujours vérifier que toutes les fonctionnalités de la page source restent accessibles. Préférer les solutions côté serveur (headers) plutôt que les redirects JavaScript.

### L008 — CSS iOS WebKit : propriétés à éviter (2026-02-25)
**Erreur** : Le card deck était invisible sur iOS Safari/Chrome. Propriétés responsables : `overflow: hidden` sur un parent flex, `height: 100%` quand le parent n'a que `min-height`, `will-change: transform`, `calc(100vh - X)` (100vh != viewport visible sur iOS).
**Règle** : Sur iOS WebKit, toujours : (1) utiliser `min-height` au lieu de `height: 100%`, (2) éviter `overflow: hidden` sur des containers flex, (3) ne pas utiliser `will-change` sauf nécessité prouvée, (4) éviter `100vh` (utiliser `min-height` fixe ou `-webkit-fill-available`), (5) ajouter les préfixes `-webkit-transform`, `-webkit-transition`, `-webkit-backface-visibility`.

### L009 — Utiliser alert() pour debug mobile, pas console.log (2026-02-25)
**Erreur** : Les console.log de debug étaient inaccessibles sur iPhone (pas de DevTools intégré). Les logs disparaissaient aussi lors des redirections rapides.
**Règle** : Pour le debug mobile, utiliser `alert()` — ça bloque toute exécution JavaScript et affiche le message à l'écran. Penser aussi au flag `window._debugShown` pour n'afficher qu'une seule fois. Pour les redirections rapides, `alert()` est la seule méthode fiable car elle bloque le thread.

### L010 — Google Maps InfoWindows : styles inline obligatoires (2026-03-01)
**Erreur** : Refactoring des InfoWindows avec des classes CSS `.iw-*` au lieu de styles inline. Résultat : tout le contenu apparaissait sans style (texte brut).
**Règle** : Les InfoWindows Google Maps injectent le contenu dans un conteneur isolé. Les classes CSS de la page `<style>` ne sont **pas héritées**. Toujours utiliser des styles inline. Seules les overrides sur `.gm-style-iw-*` (conteneur Google) fonctionnent car elles ciblent le DOM externe.

### L011 — Séparer visuellement les données de nature différente dans les UI compactes (2026-03-01)
**Erreur** : "Maison 138 m² à 113 m" — l'utilisateur confondait la surface (138 m²) et la distance (113 m) car les deux étaient sur la même ligne avec des formats similaires.
**Règle** : Ne jamais mettre côte à côte des informations numériques de même unité (m² et m) sans séparation visuelle forte. Mettre les données de nature différente sur des lignes séparées, avec des icônes distinctes et des labels explicites (ex: "📍 à 113 m du centre").

### L012 — Les messages générés par IA sonnent faux sans exemples réels (2026-03-01)
**Erreur** : Le premier retour visite généré utilisait "retour constructif", "demeurons optimistes", "a été séduit par" — formules typiquement IA que personne n'écrirait. Le message était aussi signé du nom du vendeur au lieu de l'agent.
**Règle** : Pour les messages qui doivent sonner humain : (1) fournir des vrais exemples en few-shot dans le system prompt, (2) interdire explicitement les formules IA ("INTERDIT : suite à la visite de votre bien"), (3) toujours passer le nom de l'agent pour la signature, (4) un toggle inline est trop discret — préférer une popup modale pour les choix ponctuels comme tu/vous.

### L013 — `const` hoisting et temporal dead zone (2026-03-01)
**Erreur** : Utilisation de `matchCount` avant sa déclaration `const` dans `createSellerCard()`. ReferenceError silencieuse qui crashait le rendu de TOUTES les cartes avec relance, faisant "disparaître" les leads du pipeline.
**Règle** : Ne jamais référencer une variable `const`/`let` avant sa déclaration dans le même scope. En cas de doute, utiliser la source de données directement (`sellerMatchCounts[seller.id] || 0`) plutôt qu'une variable intermédiaire. Une erreur dans une fonction de rendu de carte crash TOUTES les cartes, pas juste une.

### L014 — Champs manquants dans l'insert Supabase → échec silencieux (2026-03-06)
**Erreur** : `createNewLeadFromMicro()` dans micro.html n'incluait pas `annexes`, `links`, `link_previews`, `commission_rate` dans l'objet insert. La table `sellers` les attend. L'insert échouait silencieusement (ou avec une erreur Supabase non propagée) — aucun message visible pour l'utilisateur.
**Règle** : Quand on écrit une nouvelle fonction d'insertion dans une table existante, toujours vérifier le schéma complet de la table et comparer avec le formulaire principal qui insère dans la même table. Tout champ NOT NULL ou avec DEFAULT non trivial doit être inclus. Utiliser `createSeller()` / `createBuyer()` mutualisés plutôt que des inserts ad hoc.

### L015 — Async event listeners : les exceptions JS sont silencieuses (2026-03-06)
**Erreur** : `handleFormSubmit` est une `async function` appelée via `addEventListener('click', handleFormSubmit)`. Si une exception JS est levée dans la fonction (null reference, etc.), le bouton semble "ne rien faire" — aucun message d'erreur visible, pas d'alerte, rien dans l'UI.
**Règle** : Toute `async function` appelée depuis un event listener doit avoir un `try/catch` global qui surface les exceptions via `alert()` ou un message d'erreur visible. Les `console.error` seuls sont insuffisants car inaccessibles sur mobile. Pattern minimal : `try { ... } catch(e) { alert('Erreur : ' + e.message); console.error('[Module] Exception:', e); }`

### L016 — Ne jamais bloquer une transition UI derrière un await (2026-03-12)
**Erreur** : `setTimeout(async () => { await loadSellers(); hideOnboarding(); }, 2000)` — si `loadSellers()` hang ou throw, `hideOnboarding()` n'est jamais appelé. L'écran d'onboarding reste bloqué indéfiniment.
**Règle** : Les transitions UI critiques (montrer/cacher un écran) doivent être **synchrones et inconditionnelles**. Appeler `hideOnboarding()` d'abord, puis `loadSellers()` en async non-bloquant. Pattern : `setTimeout(() => { hideOnboarding(); (async () => { await loadSellers(); })(); }, 2000)`. Ajouter aussi un filet de sécurité CSS (`display: none !important` via classe) pour les cas extrêmes.

### L018 — Commenter un élément HTML sans nettoyer les refs JS → crash (2026-03-14)
**Erreur** : Commenter le bouton `studyBtn` dans le HTML de vendeurs.html sans supprimer `document.getElementById('studyBtn').style.display = ...` dans le JS → `null.style` → crash total de l'ouverture des fiches.
**Règle** : Quand on retire/commente un élément HTML, toujours chercher toutes les références JS avec grep et les protéger avec `if (el)` ou les supprimer.

### L019 — iframe + "Disable cache" DevTools = faux ami (2026-03-14)
**Erreur** : Le "Disable cache" de DevTools ne s'applique pas toujours aux iframes. Le micro.html chargé dans l'iframe de vendeurs.html gardait l'ancienne version même avec cache désactivé.
**Règle** : Ajouter un cache buster (`?v=Date.now()`) sur les src d'iframes pour forcer le rechargement. Vérifier avec l'onglet Network que le fichier dans l'iframe est bien rechargé.

### L020 — Regex début de phrase trop restrictif pour la détection de commandes (2026-03-15)
**Erreur** : `isLeonCommand` ne matchait que les phrases commençant par `propose|trouv|cherch...`. "Mon courtier veut déjeuner, regarde mon agenda" n'était pas capté car commence par "mon".
**Règle** : Pour la détection de commandes vocales, toujours ajouter des catch-all par mots-clés (n'importe où dans la phrase) en plus des regex de début de phrase. L'utilisateur parle naturellement, pas en commandes structurées.

### L021 — Whisper produit des caractères Unicode spéciaux invisibles (2026-03-15)
**Erreur** : Les transcriptions Whisper contiennent parfois des tirets Unicode (U+2010-2015), des apostrophes typographiques (U+2018-2019) et des espaces insécables (U+00A0) qui cassent les regex standards.
**Règle** : Toujours normaliser les transcriptions Whisper avant tout traitement regex : remplacer tous les variants de tirets, apostrophes et espaces par leurs équivalents ASCII.

### L017 — scrollIntoView avant getBoundingClientRect (2026-03-12)
**Erreur** : Le tooltip d'onboarding se positionnait en bas de l'écran au lieu de côté de la carte, car `getBoundingClientRect()` retournait des coordonnées hors viewport (la carte n'était pas scrollée en vue dans le pipeline horizontal).
**Règle** : Toujours appeler `element.scrollIntoView({ block: 'center', inline: 'center' })` AVANT de calculer la position avec `getBoundingClientRect()`. Ajouter un délai (400ms) après le scroll pour attendre la fin de l'animation avant de positionner.

### L022 — RLS `USING (true)` = pas de RLS du tout (2026-06-01)
**Erreur** : Les tables `buyers` et `sellers` avaient 17 policies historiques `USING (true)` / `WITH CHECK (true)` pour `anon` ET `authenticated`. Avec la clé anon exposée dans le frontend, n'importe qui pouvait DELETE/UPDATE/INSERT les fiches de tous les agents. La policy `authenticated` sans filtre `user_id` cassait aussi la multi-tenancy.
**Règle** : Toute table avec un `user_id` doit avoir **une seule** policy `FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. Le rôle `public` couvre anon (auth.uid() = NULL → faux) et authenticated en une fois. Lancer `get_advisors` après chaque migration DDL pour détecter les régressions. Les endpoints publics qui doivent bypasser RLS utilisent `service_role`, pas une policy anon dédiée.

### L023 — HTML5 dragstart : event.target = élément draggable source, pas l'enfant saisi (2026-06-18)
**Erreur** : Pour limiter le drag d'un accordéon à sa poignée (≡), on gardait `if (!event.target.closest('.accordion-drag-handle')) { event.preventDefault(); return; }` dans `ondragstart`. Au dragstart, `event.target` est l'élément `draggable` lui-même (l'accordéon), pas la poignée réellement saisie → `closest()` cherche la poignée parmi les ANCÊTRES, ne la trouve jamais, `preventDefault()` systématique → le drag ne démarrait jamais. Le réordonnancement des biens (page Visites) était totalement cassé.
**Règle** : Ne jamais filtrer la zone de saisie d'un drag HTML5 via `event.target` dans `dragstart`. Pour restreindre le drag à une poignée : laisser l'élément `draggable="false"` par défaut et l'activer uniquement au `onmousedown` sur la poignée (`setAttribute('draggable','true')`), puis le re-verrouiller au `dragend`/`onmouseup`. Ce pattern marche cross-browser.

### L024 — `git add <fichier>` embarque tout le working tree, y compris le WIP édité en parallèle (2026-06-18)
**Erreur** : Pour livrer un fix drag&drop, j'ai fait `git add visites.html && commit`. Mais le working tree contenait aussi un refacto matching en cours (édité en parallèle par l'utilisateur dans son IDE). Le commit a embarqué ce WIP partiel ; combiné aux commits suivants, un état intermédiaire cassé est passé en prod (`frontendMatchSeller` appelait `scoreSellerForRequestFront` pas encore défini → `ReferenceError` → chargement infini de la page Visites).
**Règle** : Avant `git add <fichier>`, toujours lire `git diff <fichier>` pour confirmer que SEULS mes changements sont présents. Si le fichier contient des modifications non liées (typique quand l'utilisateur édite en parallèle), utiliser `git add -p` pour ne committer que les hunks voulus, ou `git stash` le reste. Ne jamais supposer qu'un fichier ne contient que mes éditions. Corollaire : sur ce projet (push direct sur prod Vercel), un commit qui mélange des WIP peut déployer un intermédiaire cassé.

### L025 — `flex: 1` (flex-grow) neutralise un `height` explicite : le fix « réduire la hauteur » ne marche pas (2026-06-20)
**Erreur** : Pour empêcher la carte DVF mobile de passer sous la bottom nav, j'ai réduit `.main-container { height: calc(100dvh - header - nav) }`. Sans effet : l'utilisateur a re-signalé le bug (« toujours pas »). Cause : la règle de base `.main-container { flex: 1 }` (flex-grow:1, dans un body flex column) étire le conteneur pour remplir l'espace disponible et **ignore le `height` explicite** sur l'axe principal du flex. J'avais aussi « vérifié » en preview sans voir que mon calc n'était pas appliqué (artefacts d'émulation + session démo sans `.m-header` qui masquaient le vrai comportement).
**Règle** : Avant de corriger une hauteur via `height`, vérifier si l'élément est un enfant flex avec `flex-grow` > 0 — si oui, `height` est neutralisé sur l'axe principal. Pour réserver de l'espace face à un élément `position: fixed` (nav, footer), préférer un `padding-bottom` sur le conteneur flex parent (avec `box-sizing: border-box`) : le `flex: 1` remplit alors l'espace restant. Approche bonus : indépendante de la hauteur du header. Corollaire vérif : en preview, lire la valeur **calculée effective** (`getComputedStyle().height` ET le rect réel) et ne pas conclure « ça marche » quand la session démo diffère de l'état authentifié (header injecté absent).

### L026 — Une page qui charge `js/mobile-nav.js` doit charger `css/mobile.css` (2026-06-20)
**Erreur** : J'ai créé des pages de tuto en copiant le gabarit de `aide-vocale.html` (qui inclut `js/mobile-nav.js`) mais sans `css/mobile.css`. La bottom-nav et le bouton Todo, injectés en JS avec les classes `.m-nav` / `.m-todo-fab`, se sont affichés **en texte brut non stylé** (signalé par l'utilisateur, capture à l'appui). `aide-vocale.html` avait silencieusement le même défaut.
**Règle** : `mobile-nav.js` ne porte aucun style — toutes ses classes (`.m-nav`, `.m-nav-tab`, `.m-nav-fab`, `.m-todo-fab`…) vivent dans `css/mobile.css`. Toute page qui inclut `mobile-nav.js` **doit** charger `css/mobile.css` (avant la feuille spécifique de la page). `mobile.css` est entièrement sous `@media (max-width:768px)` + masque la nav/FABs en desktop, donc zéro impact desktop. Corollaire : quand on copie un gabarit, vérifier les **dépendances CSS des scripts injectés**, pas seulement le HTML/JS.

### L026 — Refonte UI : aller voir la référence AVANT de coder, ne pas inventer un pattern (2026-06-20)
**Erreur** : Sur la refonte mobile du DVF, j'ai proposé deux dispositions inventées (overlay FAB, puis 2 cadres empilés), toutes deux rejetées (« pas pratique », « moche »), avant que l'utilisateur ne donne une référence (cadastre.com/historiques) que j'aurais pu/dû examiner d'emblée. J'ai brûlé deux itérations.
**Règle** : Pour une refonte d'UI où une référence existe (concurrent, capture, lien), l'OUVRIR et l'observer avant de coder (Chrome MCP `navigate`+`screenshot`, ou computer-use). Et privilégier les patterns mobiles établis et éprouvés (bottom sheet coulissant à la Google Maps pour carte+filtres, pull-to-refresh, tabs) plutôt que d'inventer une disposition originale. Quand l'utilisateur rejette une 1re version d'UI, demander une référence ou des exemples plutôt que de re-tenter une autre invention. Corollaire vérif : en preview, attention aux artefacts (mode démo sans `.m-header`, valeur de transform lue en pleine transition CSS → lire après `transition:none`).

### L028 — `git commit` valide TOUT l'index, pas seulement les fichiers que je viens d'`git add` (2026-06-20)
**Erreur** : Pour livrer une mise à jour vidéo (`home.html`, `tutoriels.html`, `CHANGELOG.md`), j'ai fait `git add` de ces 3 fichiers puis `git commit`. Mais l'index contenait déjà 3 autres fichiers de l'utilisateur en cours (`vendeurs.html` +203 lignes, `sql/016_…`, `docs/API-MAP.md`). Le commit les a tous embarqués et poussés sur `main` (prod Vercel) — exactement ce que j'avais promis d'éviter. Heureusement l'utilisateur les voulait, mais ç'aurait pu déployer du travail non terminé.
**Règle** : Avant tout `git commit` destiné à un périmètre précis, vérifier ce qui est réellement stagé avec `git diff --cached --stat` (ou `git status`) et ne committer QUE le périmètre voulu. Préférer `git commit -o -- <fichiers>` / `git commit <fichiers>` (pathspec) pour ignorer le reste de l'index, ou désindexer (`git restore --staged`) ce qui ne doit pas partir. Ne jamais supposer que l'index est vide juste parce que mes propres `git add` étaient ciblés — l'environnement ou une étape antérieure peut avoir déjà stagé d'autres fichiers.
