/**
 * mobile-nav.js
 * Injecte la bottom navigation mobile et le menu "Plus..." sur toutes les pages.
 * Élimine la duplication du HTML <nav class="mobile-bottom-bar"> dans 7+ fichiers.
 * Dépendances : css/mobile.css (classes .m-nav, .m-action-sheet)
 */

(function () {
    // Toujours injecter la nav dans le DOM — le CSS gère la visibilité
    // (@media min-width: 769px → display: none, max-width: 768px → display: flex)

    function init() {
        // Détection de la page active via le pathname
        const path = window.location.pathname.split('/').pop() || 'home.html';

    const NAV_ITEMS = [
        { href: 'index.html',      icon: 'fa-solid fa-house',         label: 'Vendeurs',    id: 'index.html' },
        { href: 'acquereurs.html',  icon: 'fa-solid fa-key',           label: 'Acquéreurs',  id: 'acquereurs.html' },
        { href: 'micro.html',      icon: 'fa-solid fa-microphone',     label: null,          id: 'micro.html', isFab: true },
        { href: 'dvf.html',        icon: 'fa-solid fa-chart-simple',   label: 'Marché',      id: 'dvf.html' },
        { href: '#more',           icon: 'fa-solid fa-ellipsis',       label: 'Plus',        id: 'more', isMore: true },
    ];

    const MORE_ITEMS = [
        { href: 'visites.html',     icon: 'fa-solid fa-calendar-check',         label: 'Visites' },
        { href: 'aide-vocale.html', icon: 'fa-solid fa-wand-magic-sparkles',     label: 'Guide vocal' },
        { href: 'social.html',      icon: 'fa-solid fa-share-nodes',             label: 'Social' },
        { href: 'parametres.html',  icon: 'fa-solid fa-gear',                    label: 'Paramètres' },
    ];

    // Déterminer si la page courante est dans le menu "Plus..."
    const morePages = MORE_ITEMS.map(i => i.href);
    const isMorePage = morePages.includes(path);

    // --- Construire la nav ---
    const nav = document.createElement('nav');
    nav.className = 'm-nav';
    nav.setAttribute('aria-label', 'Navigation principale');

    NAV_ITEMS.forEach(item => {
        if (item.isFab) {
            const a = document.createElement('a');
            a.href = item.href;
            a.className = 'm-nav-fab';
            a.setAttribute('aria-label', 'Micro');
            a.innerHTML = `<i class="${item.icon}"></i>`;
            nav.appendChild(a);
            return;
        }

        const a = document.createElement('a');
        a.className = 'm-nav-tab';

        if (item.isMore) {
            a.href = '#';
            a.setAttribute('aria-label', 'Plus d\'options');
            // "Plus" est actif si la page courante est dans le sous-menu
            if (isMorePage) a.classList.add('active');
            a.addEventListener('click', function (e) {
                e.preventDefault();
                openMoreSheet();
            });
        } else {
            a.href = item.href;
            if (path === item.id) a.classList.add('active');
        }

        a.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
        nav.appendChild(a);
    });

    document.body.appendChild(nav);

    // --- Construire l'action sheet "Plus..." ---
    const overlay = document.createElement('div');
    overlay.className = 'm-action-sheet-overlay';
    overlay.id = 'moreSheetOverlay';
    overlay.innerHTML = `
        <div class="m-action-sheet">
            <div class="m-action-sheet-handle"></div>
            ${MORE_ITEMS.map(item => `
                <a href="${item.href}" class="m-action-sheet-item${path === item.href ? ' active' : ''}">
                    <i class="${item.icon}"></i>
                    <span>${item.label}</span>
                </a>
            `).join('')}
        </div>
    `;
    document.body.appendChild(overlay);

    // Fermer au tap sur l'overlay (hors sheet)
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeMoreSheet();
    });

    function openMoreSheet() {
        overlay.classList.add('active');
    }

    function closeMoreSheet() {
        const sheet = overlay.querySelector('.m-action-sheet');
        sheet.style.transform = 'translateY(100%)';
        setTimeout(function () {
            overlay.classList.remove('active');
            sheet.style.transform = '';
        }, 300);
    }

    // --- Bouton Todo flottant (image todo.svg) — toujours à gauche ---
    const todoBtn = document.createElement('button');
    todoBtn.className = 'm-todo-fab';
    todoBtn.setAttribute('type', 'button');
    todoBtn.setAttribute('title', 'Ma Todo List');
    todoBtn.innerHTML = `
        <img src="img/todo.svg" alt="Todo">
        <span class="m-todo-badge" id="mTodoBadge">0</span>
    `;
    todoBtn.addEventListener('click', function () {
        if (window.todoToggle) window.todoToggle();
    });
    document.body.appendChild(todoBtn);

    // --- FABs pipeline : bouton "+" et screenshot (index.html & acquereurs.html uniquement) ---
    const isPipelinePage = (path === 'index.html' || path === 'acquereurs.html');
    const isAcquereurs = (path === 'acquereurs.html');

    if (isPipelinePage) {
        // Bouton "+" flottant en bas à droite
        const plusBtn = document.createElement('button');
        plusBtn.className = 'm-pipeline-fab';
        plusBtn.setAttribute('type', 'button');
        plusBtn.setAttribute('title', 'Nouvelle lead');
        plusBtn.innerHTML = `<img src="img/boutonplus.svg" alt="Nouvelle lead">`;
        plusBtn.addEventListener('click', function () {
            const targetId = isAcquereurs ? 'addBuyerBtn' : 'addLeadBtn';
            const btn = document.getElementById(targetId);
            if (btn) btn.click();
        });
        document.body.appendChild(plusBtn);
    }

    if (isAcquereurs) {
        // Bouton screenshot/import à gauche du bouton "+"
        const screenshotBtn = document.createElement('button');
        screenshotBtn.className = 'm-screenshot-fab';
        screenshotBtn.setAttribute('type', 'button');
        screenshotBtn.setAttribute('title', 'Importer une capture d\'écran');
        screenshotBtn.innerHTML = `<img src="img/screenshot.svg" alt="Import screenshot">`;
        screenshotBtn.addEventListener('click', function () {
            const btn = document.getElementById('importScreenshotBtn');
            if (btn) btn.click();
        });
        document.body.appendChild(screenshotBtn);
    }

    // Masquer l'ancienne bottom bar si elle existe encore (transition progressive)
    const oldNav = document.querySelector('.mobile-bottom-bar');
    if (oldNav) oldNav.style.display = 'none';

    } // fin init()

    // Attendre que le body existe avant d'injecter (le script peut être dans le <head>)
    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
