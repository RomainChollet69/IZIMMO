/**
 * header.js
 * Module partagé : injecte le header (logo + nav + bell + user) sur toutes les pages auth.
 * Usage : placer `<div data-leon-header data-active="vendeurs"></div>` dans le body et
 * inclure `<script src="js/header.js"></script>` dans le head.
 *
 * Les actions contextuelles (Import CSV, Export…) restent gérées par chaque page dans
 * sa propre barre secondaire — le header global ne contient QUE le squelette commun.
 * Dépendances : aucune (vanilla). Les IDs exposés (#userProfile, #alertBell, #alertBadge)
 * sont identiques à l'ancien code → compat totale avec auth.js / relance-widget.js.
 */
(function () {
    'use strict';

    // Liste unique des onglets de navigation principale.
    // Ajouter/modifier ici se propage automatiquement à toutes les pages.
    const NAV_TABS = [
        { key: 'vendeurs',   href: 'vendeurs.html',   icon: 'fa-house',          label: 'Vendeurs' },
        { key: 'acquereurs', href: 'acquereurs.html', icon: 'fa-key',            label: 'Acquéreurs' },
        { key: 'marche',     href: 'dvf.html',        icon: 'fa-chart-simple',   label: 'Marché' },
        { key: 'visites',    href: 'visites.html',    icon: 'fa-calendar-check', label: 'Visites' },
        { key: 'vocal',      href: 'micro.html',      icon: 'fa-microphone',     label: 'Vocal' }
    ];

    /**
     * Construit le HTML du header.
     * @param {Object} opts
     * @param {string} opts.active - Clé de l'onglet actif (cf. NAV_TABS[].key)
     * @returns {string} HTML prêt à injecter
     */
    function renderHeaderHTML(opts) {
        const active = (opts && opts.active) || '';
        const tabsHtml = NAV_TABS.map(t => {
            const cls = t.key === active ? 'nav-tab active' : 'nav-tab';
            return `<a href="${t.href}" class="${cls}">
                <i class="fa-solid ${t.icon}"></i> ${t.label}
            </a>`;
        }).join('');

        return `
            <div class="header-inner">
                <a href="home.html" class="logo">
                    <img src="img/Logo_leon.svg" alt="Léon">
                </a>
                <nav class="nav-tabs">${tabsHtml}</nav>
                <div class="header-actions">
                    <button class="alert-bell" id="alertBell" title="Relances du jour">
                        <i class="fa-solid fa-bell"></i>
                        <span class="alert-badge" id="alertBadge" style="display: none;">0</span>
                    </button>
                    <div data-leon-header-extras></div>
                    <div class="header-separator"></div>
                    <div class="user-profile" id="userProfile"></div>
                </div>
            </div>`;
    }

    /**
     * Initialise le header : cherche le placeholder, inject le HTML, ajoute la classe `.header`.
     * Idempotent : ne fait rien si le header est déjà injecté.
     */
    function init() {
        const placeholder = document.querySelector('[data-leon-header]');
        if (!placeholder || placeholder.dataset.leonHeaderReady === '1') return;

        const active = placeholder.dataset.active || '';
        placeholder.classList.add('header');
        placeholder.innerHTML = renderHeaderHTML({ active: active });
        placeholder.dataset.leonHeaderReady = '1';

        // Signale aux scripts dépendants (auth.js, relance-widget.js) que les éléments
        // #userProfile et #alertBell sont disponibles.
        document.dispatchEvent(new CustomEvent('leon:header-ready', { detail: { active: active } }));
    }

    // Auto-init dès que le DOM est prêt (le placeholder est dans le body)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // API publique pour les tests / cas particuliers
    window.LeonHeader = { render: renderHeaderHTML, init: init, tabs: NAV_TABS };
})();
