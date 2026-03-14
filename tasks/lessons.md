# LESSONS — Erreurs passées & règles apprises

> Chaque correction de l'utilisateur est enregistrée ici pour éviter de répéter les mêmes erreurs.

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

### L017 — scrollIntoView avant getBoundingClientRect (2026-03-12)
**Erreur** : Le tooltip d'onboarding se positionnait en bas de l'écran au lieu de côté de la carte, car `getBoundingClientRect()` retournait des coordonnées hors viewport (la carte n'était pas scrollée en vue dans le pipeline horizontal).
**Règle** : Toujours appeler `element.scrollIntoView({ block: 'center', inline: 'center' })` AVANT de calculer la position avec `getBoundingClientRect()`. Ajouter un délai (400ms) après le scroll pour attendre la fin de l'animation avant de positionner.
