/**
 * touch-drag-drop.js
 * Polyfill tactile pour le drag & drop des pipelines (iPad/mobile).
 * L'API HTML5 Drag and Drop ne fonctionne pas sur les appareils tactiles.
 * Ce module simule le comportement en écoutant touchstart/touchmove/touchend.
 * Dépendances : chaque page doit exposer getDropPosition(), showDropIndicator(),
 *               clearDropIndicators(), draggedCard (global), et onCardDropped(container, clientY).
 */

(function () {
    'use strict';

    const HOLD_DELAY_MS = 200; // Délai avant d'activer le drag (éviter conflit avec scroll)
    const MOVE_THRESHOLD_PX = 8; // Mouvement minimum pour annuler le hold (= c'est un scroll)

    let holdTimer = null;
    let ghost = null;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let touchOffsetX = 0;
    let touchOffsetY = 0;
    let pendingCard = null; // Carte en attente de hold

    const MIN_SCREEN_WIDTH_PX = 768; // Tablettes uniquement (iPad), pas smartphones

    function initTouchDragDrop() {
        if (Math.max(screen.width, screen.height) < MIN_SCREEN_WIDTH_PX) return;

        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', onTouchCancel, { passive: false });
    }

    function findDraggableCard(el) {
        while (el && el !== document) {
            if (el.classList && el.classList.contains('lead-card') && el.draggable) return el;
            el = el.parentElement;
        }
        return null;
    }

    function onTouchStart(e) {
        const card = findDraggableCard(e.target);
        if (!card) return;

        // Ignorer si on touche un élément interactif dans la carte
        if (e.target.closest('button, a, input, select, textarea')) return;

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        pendingCard = card;

        // Calculer l'offset du doigt par rapport au coin de la carte
        const rect = card.getBoundingClientRect();
        touchOffsetX = touch.clientX - rect.left;
        touchOffsetY = touch.clientY - rect.top;

        holdTimer = setTimeout(() => {
            holdTimer = null;
            startDrag(pendingCard, touch);
        }, HOLD_DELAY_MS);
    }

    function onTouchMove(e) {
        // Si on attend encore le hold, vérifier si c'est un scroll
        if (holdTimer && pendingCard) {
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - startX);
            const dy = Math.abs(touch.clientY - startY);
            if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
                clearTimeout(holdTimer);
                holdTimer = null;
                pendingCard = null;
            }
        }

        if (!isDragging) return;
        e.preventDefault(); // Empêcher le scroll pendant le drag

        const touch = e.touches[0];
        moveGhost(touch.clientX, touch.clientY);
        updateDropTarget(touch.clientX, touch.clientY);
    }

    function onTouchEnd(e) {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
            pendingCard = null;
        }

        if (!isDragging) return;
        e.preventDefault();

        const touch = e.changedTouches[0];
        finishDrag(touch.clientX, touch.clientY);
    }

    function onTouchCancel() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
            pendingCard = null;
        }
        if (isDragging) cancelDrag();
    }

    function startDrag(card, touch) {
        isDragging = true;
        pendingCard = null;

        // Référencer la carte globale (utilisée par les deux pages)
        window.draggedCard = card;
        card.classList.add('dragging');

        // Auto-compact si la carte est expanded
        if (card.classList.contains('expanded')) {
            card.classList.remove('expanded');
            card.style.maxHeight = '120px';
            const arrow = card.querySelector('.card-expand-arrow');
            if (arrow) arrow.textContent = '▼';
        }

        createGhost(card, touch.clientX, touch.clientY);

        // Feedback haptique si disponible
        if (navigator.vibrate) navigator.vibrate(30);
    }

    function createGhost(card, x, y) {
        ghost = card.cloneNode(true);
        ghost.style.cssText = `
            position: fixed;
            z-index: 99999;
            pointer-events: none;
            width: ${card.offsetWidth}px;
            opacity: 0.85;
            transform: rotate(2deg) scale(1.03);
            box-shadow: 0 12px 32px rgba(0,0,0,0.25);
            transition: none;
            left: ${x - touchOffsetX}px;
            top: ${y - touchOffsetY}px;
        `;
        document.body.appendChild(ghost);
    }

    function moveGhost(x, y) {
        if (!ghost) return;
        ghost.style.left = (x - touchOffsetX) + 'px';
        ghost.style.top = (y - touchOffsetY) + 'px';
    }

    function updateDropTarget(x, y) {
        // Cacher le ghost temporairement pour voir ce qu'il y a dessous
        if (ghost) ghost.style.display = 'none';
        const el = document.elementFromPoint(x, y);
        if (ghost) ghost.style.display = '';

        if (!el) {
            if (typeof clearDropIndicators === 'function') clearDropIndicators();
            return;
        }

        const column = el.closest('.column');
        if (!column) {
            if (typeof clearDropIndicators === 'function') clearDropIndicators();
            return;
        }

        const container = column.querySelector('.cards-container');
        if (!container) return;

        // Afficher l'indicateur de drop via les fonctions globales de la page
        if (typeof getDropPosition === 'function' && typeof showDropIndicator === 'function') {
            const position = getDropPosition(container, y);
            showDropIndicator(container, position);
        }
    }

    function finishDrag(x, y) {
        // Trouver la cible finale
        if (ghost) ghost.style.display = 'none';
        const el = document.elementFromPoint(x, y);
        if (ghost) ghost.style.display = '';

        const column = el ? el.closest('.column') : null;
        const container = column ? column.querySelector('.cards-container') : null;

        cleanupDrag();

        // Appeler la logique de drop définie par chaque page
        if (container && window.draggedCard && typeof window.onCardDropped === 'function') {
            window.onCardDropped(container, y);
        }

        window.draggedCard = null;
    }

    function cancelDrag() {
        cleanupDrag();
        window.draggedCard = null;
    }

    function cleanupDrag() {
        isDragging = false;

        if (ghost) {
            ghost.remove();
            ghost = null;
        }

        if (window.draggedCard) {
            window.draggedCard.classList.remove('dragging');
        }

        if (typeof clearDropIndicators === 'function') {
            clearDropIndicators();
        }
    }

    // Initialiser quand le DOM est prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTouchDragDrop);
    } else {
        initTouchDragDrop();
    }
})();
