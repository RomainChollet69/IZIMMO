/**
 * tab-shell.js
 * Moteur d'onglets « façon navigateur » pour la version desktop de Léon (app.html).
 * Chaque rubrique (vendeurs, acquéreurs, visites…) est chargée dans un <iframe> qui
 * reste vivant en arrière-plan : changer d'onglet masque/affiche l'iframe au lieu de
 * recharger la page → l'état (scroll, filtres, formulaires) est conservé.
 *
 * Pages 100% inchangées : le shell « entre » dans chaque iframe (même origine) pour
 * masquer le header interne de la page et transformer les clics sur liens internes en
 * onglets. Aucune dépendance hors DOM standard.
 *
 * Dépendances : app.html (conteneurs #shellTabs / #shellViews), auth.js (profil/logout).
 */
(function () {
    'use strict';

    /* === Registre des rubriques ouvrables en onglet === */
    // Source unique : label + icône FontAwesome pour chaque page métier.
    // 'home.html' n'y figure pas → c'est l'onglet Accueil fixe, géré à part.
    const PAGES = {
        'vendeurs.html':   { label: 'Vendeurs',     icon: 'fa-house' },
        'acquereurs.html': { label: 'Acquéreurs',   icon: 'fa-key' },
        'visites.html':    { label: 'Visites',      icon: 'fa-calendar-check' },
        'dvf.html':        { label: 'Marché / DVF',  icon: 'fa-chart-simple' },
        'micro.html':      { label: 'Assistant vocal', icon: 'fa-microphone' },
        'social.html':     { label: 'Community',     icon: 'fa-share-nodes' },
        'parametres.html': { label: 'Paramètres',    icon: 'fa-gear' },
        'tutoriels.html':  { label: 'Tutoriels',     icon: 'fa-graduation-cap' }
    };

    // Onglet d'accueil : fixe, non fermable, toujours à gauche.
    const HOME_PAGE = 'home.html';
    const HOME_LABEL = 'Accueil';

    /* === État interne === */
    // tabs : Map id -> { id, page, label, closable, tabEl, viewEl(iframe) }
    const tabs = new Map();
    let activeId = null;
    let tabSeq = 0; // compteur pour générer des ids uniques

    let tabsContainer = null;   // #shellTabs (la bande d'onglets)
    let viewsContainer = null;  // #shellViews (la pile d'iframes)

    /**
     * Normalise un href en nom de page (« ./vendeurs.html?x=1#y » → « vendeurs.html »).
     * @returns {string} le nom de fichier, ou '' si non pertinent.
     */
    function hrefToPage(href) {
        if (!href) return '';
        if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return '';
        if (href.charAt(0) === '#') return '';
        return href.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    }

    /**
     * Ouvre (ou réactive si déjà ouvert) un onglet pour la page demandée.
     * @param {string} page - nom de fichier (ex: 'vendeurs.html')
     * @param {Object} [opts] - options. opts.search → ajoute ?search=… (recherche globale).
     */
    function openTab(page, opts) {
        opts = opts || {};
        if (page === HOME_PAGE) { activateTab('home'); return; }
        if (!PAGES[page]) {
            console.warn('[Shell] Page inconnue, onglet ignoré :', page);
            return;
        }

        // src réel de l'iframe : URL complète fournie (opts.src, ex: une fiche acquéreur
        // ouverte depuis une action Léon), sinon page de base + éventuel ?search=.
        const src = opts.src ? opts.src
                  : opts.search ? page + '?search=' + encodeURIComponent(opts.search)
                  : page;

        // Déjà ouvert → on l'active. Si une URL/recherche précise est fournie, on y navigue.
        const existing = findTabByPage(page);
        if (existing) {
            if ((opts.src || opts.search) && existing.viewEl.getAttribute('src') !== src) {
                existing.viewEl.src = src;
            }
            activateTab(existing.id);
            return;
        }

        const id = 'tab-' + (++tabSeq);
        const meta = PAGES[page];
        createTab({ id: id, page: page, src: src, label: meta.label, icon: meta.icon, closable: true });
        activateTab(id);
    }

    /** Cherche un onglet déjà ouvert pour une page donnée. */
    function findTabByPage(page) {
        for (const tab of tabs.values()) {
            if (tab.page === page) return tab;
        }
        return null;
    }

    /**
     * Construit le bouton d'onglet + l'iframe associée et les insère dans le DOM.
     * L'iframe est chargée immédiatement et reste vivante jusqu'à fermeture.
     */
    function createTab(opts) {
        // --- Bouton d'onglet ---
        const tabEl = document.createElement('button');
        tabEl.className = 'shell-tab';
        tabEl.type = 'button';
        tabEl.dataset.id = opts.id;
        tabEl.innerHTML =
            `<i class="fa-solid ${opts.icon} shell-tab-ico"></i>` +
            `<span class="shell-tab-label">${opts.label}</span>` +
            (opts.closable ? `<span class="shell-tab-close" aria-label="Fermer">&times;</span>` : '');

        tabEl.addEventListener('click', function (e) {
            if (e.target.classList.contains('shell-tab-close')) {
                closeTab(opts.id);
            } else {
                activateTab(opts.id);
            }
        });
        tabsContainer.appendChild(tabEl);

        // --- Vue (iframe) ---
        const iframe = document.createElement('iframe');
        iframe.className = 'shell-view';
        iframe.dataset.id = opts.id;
        iframe.dataset.page = opts.page;
        // Permissions indispensables : micro (micro.html), géoloc (dvf.html),
        // presse-papier (exports CSV / copie de partages). Même origine sinon non requis.
        iframe.setAttribute('allow', 'microphone; camera; geolocation; clipboard-read; clipboard-write');
        // dataset.page = page de base (identité de l'onglet) ; src peut porter ?search=…
        iframe.src = opts.src || opts.page;
        iframe.addEventListener('load', function () { onViewLoaded(iframe); });
        viewsContainer.appendChild(iframe);

        tabs.set(opts.id, {
            id: opts.id, page: opts.page, label: opts.label,
            closable: opts.closable, tabEl: tabEl, viewEl: iframe
        });
    }

    /** Active un onglet : affiche son iframe, masque les autres, met à jour la barre. */
    function activateTab(id) {
        if (!tabs.has(id)) return;
        activeId = id;
        for (const tab of tabs.values()) {
            const isActive = tab.id === id;
            tab.tabEl.classList.toggle('active', isActive);
            tab.viewEl.classList.toggle('active', isActive);
        }
    }

    /** Ferme un onglet (jamais l'Accueil) et bascule sur un voisin. */
    function closeTab(id) {
        const tab = tabs.get(id);
        if (!tab || !tab.closable) return;

        const wasActive = (activeId === id);
        const order = Array.from(tabs.keys());
        const idx = order.indexOf(id);

        tab.tabEl.remove();
        tab.viewEl.remove();
        tabs.delete(id);

        // Si on fermait l'onglet actif, activer le voisin de gauche (sinon Accueil).
        if (wasActive) {
            const fallback = order[idx - 1] || 'home';
            activateTab(tabs.has(fallback) ? fallback : 'home');
        }
    }

    /**
     * Appelé au chargement de chaque iframe : neutralise le header interne de la page
     * et branche l'interception des liens. Même origine → accès direct au contentDocument.
     */
    function onViewLoaded(iframe) {
        const win = iframe.contentWindow;

        // Réconciliation : si l'iframe a navigué par JS (ex: action de l'assistant Léon ou
        // recherche globale qui font `location.href = 'acquereurs.html?...'`, non interceptées
        // car ce ne sont pas des clics de lien) vers une AUTRE rubrique que la sienne, on remet
        // cet onglet sur sa page d'origine et on ouvre la rubrique réellement demandée dans son
        // propre onglet — en conservant l'éventuelle fiche en paramètre (?buyer=…, #…).
        let actualPage = null;
        try { actualPage = win.location.pathname.split('/').pop() || HOME_PAGE; } catch (e) { /* cross-origin */ }
        if (actualPage && actualPage !== iframe.dataset.page &&
            (actualPage === HOME_PAGE || PAGES[actualPage])) {
            const fullUrl = actualPage + win.location.search + win.location.hash;
            iframe.src = iframe.dataset.page;          // restaure l'onglet sur sa page d'origine
            openTab(actualPage, { src: fullUrl });     // ouvre/active la bonne rubrique (+ fiche)
            return;
        }

        let doc;
        try {
            doc = iframe.contentDocument;
        } catch (err) {
            console.warn('[Shell] contentDocument inaccessible (origine ?)', err);
            return;
        }
        if (!doc) return;

        injectEmbeddedStyles(doc);
        attachLinkInterceptor(doc, iframe);
    }

    /** Masque le header interne de la page embarquée (le shell fournit la barre). */
    function injectEmbeddedStyles(doc) {
        if (doc.getElementById('shell-embedded-style')) return;
        const style = doc.createElement('style');
        style.id = 'shell-embedded-style';
        // .header (home + header.js), .header-desktop (micro), [data-leon-header] (avant injection)
        // .search-bar-section : sticky calé sur top:64px (ancien header) → 0 ici (header masqué).
        // .pipeline : hauteur calée sur 100vh-230px (incluait l'ancien header) → recalculée
        //   pour le shell (header masqué) : il ne reste que la barre de recherche (~86px) au-dessus,
        //   donc les colonnes descendent jusqu'en bas de l'onglet.
        // .bottom-micro-btn : FAB micro flottant masqué dans le shell (doublon avec
        //   l'onglet « Assistant vocal » / le « + »). Le bouton To Do reste.
        style.textContent =
            '.header,.header-desktop,[data-leon-header]{display:none!important;}' +
            '.search-bar-section{top:0!important;}' +
            '.pipeline{height:calc(100vh - 88px)!important;}' +
            '.bottom-micro-btn{display:none!important;}';
        (doc.head || doc.documentElement).appendChild(style);
    }

    /**
     * Intercepte les clics sur liens internes pour les ouvrir en onglets.
     * Navigation vers une AUTRE page métier → nouvel onglet (ou focus).
     * Navigation vers la MÊME page (ex: ?search=) ou page hors-registre → laissée à l'iframe.
     */
    function attachLinkInterceptor(doc, iframe) {
        doc.addEventListener('click', function (e) {
            const a = e.target.closest('a');
            if (!a || a.target === '_blank') return;

            const page = hrefToPage(a.getAttribute('href'));
            if (!page || !page.endsWith('.html')) return;

            // Page courante de l'iframe → laisser naviguer en interne.
            if (page === iframe.dataset.page) return;
            // Accueil ou rubrique connue → onglet. Sinon (cgu, etc.) → navigation interne.
            if (page !== HOME_PAGE && !PAGES[page]) return;

            e.preventDefault();
            // On conserve l'URL complète (query/hash) pour ouvrir une fiche précise si besoin.
            const src = (a.getAttribute('href') || page).replace(/^\.?\//, '');
            openTab(page, { src: src });
        }, true);
    }

    /* === Bouton "+" : menu de toutes les rubriques === */
    function buildPlusMenu() {
        const menu = document.getElementById('shellPlusMenu');
        if (!menu) return;

        menu.innerHTML = Object.keys(PAGES).map(function (page) {
            const m = PAGES[page];
            return `<button type="button" class="shell-plus-item" data-page="${page}">` +
                   `<i class="fa-solid ${m.icon}"></i> ${m.label}</button>`;
        }).join('');

        menu.addEventListener('click', function (e) {
            const item = e.target.closest('.shell-plus-item');
            if (!item) return;
            openTab(item.dataset.page);
            menu.classList.remove('open');
        });

        const btn = document.getElementById('shellPlusBtn');
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.toggle('open');
        });
        document.addEventListener('click', function () { menu.classList.remove('open'); });
    }

    /* === Initialisation === */
    function init() {
        tabsContainer = document.getElementById('shellTabs');
        viewsContainer = document.getElementById('shellViews');
        if (!tabsContainer || !viewsContainer) {
            console.error('[Shell] Conteneurs introuvables (#shellTabs / #shellViews)');
            return;
        }

        // Onglet Accueil fixe (non fermable), chargé immédiatement.
        createTab({ id: 'home', page: HOME_PAGE, label: HOME_LABEL, icon: 'fa-house-chimney', closable: false });
        activateTab('home');

        buildPlusMenu();

        // Liens internes cliqués dans la barre du shell elle-même (ex: "Paramètres"
        // du menu profil injecté par auth.js) → ouverts en onglet plutôt qu'en pleine page.
        attachShellLinkInterceptor();

        // Ouverture directe d'une rubrique via ?open=<page> : utilisé quand une page
        // est atteinte en accès direct sur desktop (favori, ancien lien) et redirige
        // vers le shell pour s'y ouvrir dans le bon onglet.
        try {
            const toOpen = new URLSearchParams(window.location.search).get('open');
            if (toOpen && PAGES[toOpen]) openTab(toOpen);
        } catch (e) { /* paramètre absent ou invalide → on reste sur l'Accueil */ }
    }

    /** Intercepte aussi les liens internes du shell (hors iframes). */
    function attachShellLinkInterceptor() {
        document.addEventListener('click', function (e) {
            const a = e.target.closest('a');
            if (!a || a.target === '_blank') return;
            const page = hrefToPage(a.getAttribute('href'));
            if (!page || (page !== HOME_PAGE && !PAGES[page])) return;
            e.preventDefault();
            openTab(page);
        }, true);
    }

    /**
     * Ouvre la fiche d'un lead dans son onglet métier.
     * Utilisé par le widget Relances, qui vit dans la frame parente (app.html) et ne
     * peut donc pas appeler editSeller/editBuyer directement (ces fonctions sont dans
     * l'iframe). Deux cas :
     *  - Onglet déjà ouvert et page prête → on appelle editSeller/editBuyer dans l'iframe
     *    (préserve scroll/filtres, pas de rechargement).
     *  - Sinon → on (ré)ouvre l'onglet avec ?openLead=… que la page embarquée gère au load.
     * @param {string} page - 'vendeurs.html' ou 'acquereurs.html'
     * @param {string} id - UUID du lead
     * @param {string} leadType - 'seller' ou 'buyer'
     */
    function openLead(page, id, leadType) {
        const existing = findTabByPage(page);
        if (existing) {
            activateTab(existing.id);
            const fnName = leadType === 'seller' ? 'editSeller' : 'editBuyer';
            try {
                const win = existing.viewEl.contentWindow;
                if (win && typeof win[fnName] === 'function') {
                    win[fnName](id);
                    return;
                }
            } catch (e) { /* iframe pas prête → on bascule sur le rechargement avec param */ }
        }
        openTab(page, { src: page + '?openLead=' + encodeURIComponent(id) });
    }

    // API publique (logo Accueil dans app.html, widget relances, debug)
    window.LeonShell = { open: openTab, activate: activateTab, openLead: openLead };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
