// Léon — Onboarding guidé — Pipeline Vendeurs
// Tutorial interactif en 4 étapes pour les nouveaux utilisateurs.

const PipelineOnboarding = {
    currentStep: 0,
    totalSteps: 4,
    targetCard: null,
    overlay: null,
    tooltip: null,
    expandedCard: false,
    dragListenerAdded: false,

    // Vérifier si le tour doit se lancer
    shouldStart() {
        // Vérifier si déjà fait
        if (localStorage.getItem('onboarding_pipeline_done')) {
            return false;
        }

        // Vérifier présence de fiches fantômes
        const exampleCards = document.querySelectorAll('.example-card');
        if (exampleCards.length === 0) {
            return false;
        }

        // Vérifier présence de vrais leads
        const realCards = document.querySelectorAll('.lead-card:not(.example-card)');

        // Pas de vrai lead → pas de tour
        if (realCards.length === 0) {
            return false;
        }

        // 3+ vrais leads → skip directement le tour et nettoyer
        if (realCards.length >= 3) {
            this.skipAndCleanup();
            return false;
        }

        // 1 ou 2 vrais leads → lancer le tour
        this.targetCard = realCards[0];
        return true;
    },

    // Skip et cleanup sans animation
    skipAndCleanup() {
        const exampleCards = document.querySelectorAll('.example-card');
        exampleCards.forEach(card => card.remove());
        localStorage.setItem('onboarding_pipeline_done', 'true');
    },

    // Lancer le tour
    start() {
        console.log('[Onboarding] Starting pipeline tour');

        // Créer l'overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'onboarding-overlay';
        document.body.appendChild(this.overlay);

        // Créer la bulle tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'onboarding-tooltip';
        document.body.appendChild(this.tooltip);

        // Cacher le bandeau de bienvenue
        const welcomeBanner = document.getElementById('welcomeBanner');
        if (welcomeBanner) {
            welcomeBanner.style.display = 'none';
        }

        // Fade in overlay
        setTimeout(() => {
            this.overlay.classList.add('visible');
        }, 50);

        // Commencer à l'étape 1
        setTimeout(() => {
            this.goToStep(1);
        }, 400);
    },

    // Aller à une étape
    goToStep(step) {
        this.currentStep = step;
        console.log('[Onboarding] Going to step', step);

        switch (step) {
            case 1:
                this.step1_bravoFiche();
                break;
            case 2:
                this.step2_toutEstLa();
                break;
            case 3:
                this.step3_deplaceFiche();
                break;
            case 4:
                this.step4_pipelinePret();
                break;
        }
    },

    // ÉTAPE 1 : Bravo, ta première fiche !
    step1_bravoFiche() {
        this.removeSpotlight();
        this.setSpotlight(this.targetCard);

        // Alléger l'overlay pour que la carte soit bien éclairée
        if (this.overlay) {
            this.overlay.style.background = 'rgba(15, 23, 42, 0.15)';
        }

        // Scroller la colonne si nécessaire
        const column = this.targetCard.closest('.column-content');
        if (column) {
            const cardTop = this.targetCard.offsetTop;
            const columnHeight = column.clientHeight;
            if (cardTop > columnHeight / 2) {
                column.scrollTop = cardTop - 100;
            }
        }

        this.showTooltip({
            target: this.targetCard,
            title: '🎉 Bravo, ta première fiche !',
            text: 'Léon a transformé ta dictée en fiche complète. Toutes les infos sont là : nom, téléphone, adresse, budget…',
            buttonText: 'Voir la fiche →',
            showSkip: true,
            preferred: 'right',
            onButtonClick: () => this.goToStep(2)
        });
    },

    // ÉTAPE 2 : Tout est rangé au bon endroit
    step2_toutEstLa() {
        this.hideTooltip();

        // Attendre que la bulle disparaisse
        setTimeout(() => {
            // Ouvrir la carte (simuler un clic)
            this.targetCard.click();
            this.expandedCard = true;

            // Attendre l'animation d'ouverture
            setTimeout(() => {
                // Re-spotlight sur la carte étendue
                this.removeSpotlight();
                this.setSpotlight(this.targetCard);

                // Alléger l'overlay pour que la carte "s'allume"
                if (this.overlay) {
                    this.overlay.style.background = 'rgba(15, 23, 42, 0.15)';
                }

                this.showTooltip({
                    target: this.targetCard,
                    title: '📋 Tout est rangé au bon endroit',
                    text: 'Infos du bien, notes de visite, documents, historique… Tu retrouves tout ici. Tu peux modifier n\'importe quel champ à tout moment.',
                    buttonText: 'Compris →',
                    showSkip: true,
                    preferred: 'right',
                    onButtonClick: () => {
                        // Fermer la carte
                        if (this.expandedCard) {
                            this.targetCard.click();
                            this.expandedCard = false;
                        }
                        this.hideTooltip();
                        setTimeout(() => this.goToStep(3), 300);
                    }
                });
            }, 400);
        }, 250);
    },

    // ÉTAPE 3 : Déplace ta fiche
    step3_deplaceFiche() {
        // Restaurer l'overlay à sa valeur normale
        if (this.overlay) {
            this.overlay.style.background = 'rgba(15, 23, 42, 0.65)';
        }

        this.removeSpotlight();
        this.setSpotlight(this.targetCard);

        this.showTooltip({
            target: this.targetCard,
            title: '👆 Déplace ta fiche d\'une colonne à l\'autre',
            text: 'Maintiens ta fiche et glisse-la vers une autre colonne. C\'est comme ça que tu feras avancer tes leads dans ton pipeline.',
            buttonText: null, // Pas de bouton, on attend l'action
            showSkip: true,
            preferred: 'top'
        });

        // Réactiver le drag & drop sur la carte
        this.targetCard.style.pointerEvents = 'auto';

        // Écouter le drag & drop
        if (!this.dragListenerAdded) {
            this.dragListenerAdded = true;

            // Utiliser MutationObserver pour détecter quand la carte change de parent (colonne)
            const originalParent = this.targetCard.parentElement;
            const observer = new MutationObserver((mutations) => {
                const currentParent = this.targetCard.parentElement;
                if (currentParent !== originalParent) {
                    console.log('[Onboarding] Drag detected!');
                    observer.disconnect();
                    this.onDragSuccess();
                }
            });

            observer.observe(this.targetCard.parentElement.parentElement, {
                childList: true,
                subtree: true
            });
        }
    },

    // Succès du drag & drop
    onDragSuccess() {
        // Afficher le badge de succès
        const badge = document.createElement('div');
        badge.className = 'drag-success-badge';
        badge.textContent = '✓';
        this.targetCard.style.position = 'relative';
        this.targetCard.appendChild(badge);

        // Retirer le badge après 1s et passer à l'étape 4
        setTimeout(() => {
            badge.remove();
            this.hideTooltip();
            setTimeout(() => this.goToStep(4), 300);
        }, 1000);
    },

    // ÉTAPE 4 : Ton pipeline est prêt !
    step4_pipelinePret() {
        this.removeSpotlight();

        // Alléger l'overlay
        if (this.overlay) {
            this.overlay.style.background = 'rgba(15, 23, 42, 0.5)';
        }

        // Faire disparaître les fiches fantômes
        this.fadeOutExampleCards(() => {
            // Quand toutes les fantômes ont disparu, afficher la bulle finale
            this.showTooltip({
                target: null, // Bulle centrée
                title: '🚀 Ton pipeline est prêt !',
                text: 'Ajoute tes leads par dictée vocale, import Excel ou saisie manuelle. Léon s\'occupe de tout structurer pour toi.',
                buttonText: 'C\'est parti !',
                buttonLarge: true,
                showSkip: false,
                centered: true,
                onButtonClick: () => this.finish()
            });
        });
    },

    // Afficher la bulle tooltip
    showTooltip(config) {
        const { target, title, text, buttonText, buttonLarge, showSkip, preferred, centered, onButtonClick } = config;

        // Contenu HTML
        let html = `
            <div class="onboarding-title">${title}</div>
            <div class="onboarding-text">${text}</div>
        `;

        // Footer avec bouton et skip
        if (buttonText || showSkip) {
            html += '<div class="onboarding-footer">';

            if (showSkip) {
                html += '<a class="onboarding-skip" onclick="PipelineOnboarding.skip()">Passer le tuto</a>';
            } else {
                html += '<div></div>'; // Spacer
            }

            if (buttonText) {
                const btnClass = buttonLarge ? 'onboarding-btn large' : 'onboarding-btn';
                html += `<button class="${btnClass}" onclick="PipelineOnboarding.handleButtonClick()">${buttonText}</button>`;
            }

            html += '</div>';
        }

        // Dots de progression
        html += '<div class="onboarding-dots">';
        for (let i = 1; i <= this.totalSteps; i++) {
            const activeClass = i === this.currentStep ? 'active' : '';
            html += `<div class="onboarding-dot ${activeClass}"></div>`;
        }
        html += '</div>';

        this.tooltip.innerHTML = html;
        this.buttonClickHandler = onButtonClick;

        // Positionner
        if (centered) {
            this.tooltip.className = 'centered no-arrow';
        } else if (target) {
            this.positionTooltip(target, preferred || 'right');
        }

        // Fade in
        setTimeout(() => {
            this.tooltip.classList.add('visible');
        }, 50);
    },

    // Handler pour le clic sur le bouton (appelé depuis le onclick inline)
    handleButtonClick() {
        if (this.buttonClickHandler) {
            this.buttonClickHandler();
        }
    },

    // Cacher la bulle
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
    },

    // Positionner la bulle intelligemment
    positionTooltip(target, preferred) {
        const rect = target.getBoundingClientRect();
        const tooltipWidth = 340;
        const tooltipHeight = 200; // Estimation
        const gap = 20;
        const margin = 16;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let position = preferred;
        let top, left;

        // Tester la position préférée et fallback
        const positions = [preferred, 'right', 'bottom', 'left', 'top'];

        for (const pos of positions) {
            if (pos === 'right') {
                left = rect.right + gap;
                top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
                if (left + tooltipWidth + margin < viewportWidth && top > margin && top + tooltipHeight < viewportHeight - margin) {
                    position = 'right';
                    break;
                }
            } else if (pos === 'left') {
                left = rect.left - tooltipWidth - gap;
                top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
                if (left > margin && top > margin && top + tooltipHeight < viewportHeight - margin) {
                    position = 'left';
                    break;
                }
            } else if (pos === 'bottom') {
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                top = rect.bottom + gap;
                if (top + tooltipHeight < viewportHeight - margin && left > margin && left + tooltipWidth < viewportWidth - margin) {
                    position = 'bottom';
                    break;
                }
            } else if (pos === 'top') {
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                top = rect.top - tooltipHeight - gap;
                if (top > margin && left > margin && left + tooltipWidth < viewportWidth - margin) {
                    position = 'top';
                    break;
                }
            }
        }

        // Appliquer la position
        this.tooltip.style.left = `${Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin))}px`;
        this.tooltip.style.top = `${Math.max(margin, Math.min(top, viewportHeight - tooltipHeight - margin))}px`;

        // Classe pour la flèche
        this.tooltip.className = `arrow-${position === 'right' ? 'left' : position === 'left' ? 'right' : position}`;
    },

    // Mettre un élément en spotlight
    setSpotlight(element) {
        if (element) {
            element.classList.add('spotlight-active');
        }
    },

    // Retirer le spotlight
    removeSpotlight() {
        const spotlighted = document.querySelector('.spotlight-active');
        if (spotlighted) {
            spotlighted.classList.remove('spotlight-active');
        }
    },

    // Faire disparaître les fiches fantômes progressivement
    fadeOutExampleCards(callback) {
        const exampleCards = Array.from(document.querySelectorAll('.example-card'));

        if (exampleCards.length === 0) {
            if (callback) callback();
            return;
        }

        let index = 0;
        const stagger = 80;

        const fadeNext = () => {
            if (index < exampleCards.length) {
                exampleCards[index].classList.add('fading-out');
                index++;
                setTimeout(fadeNext, stagger);
            } else {
                // Toutes les cartes ont fade out, attendre la fin de l'animation
                setTimeout(() => {
                    exampleCards.forEach(card => card.remove());
                    if (callback) callback();
                }, 500);
            }
        };

        fadeNext();
    },

    // Terminer le tour
    finish() {
        console.log('[Onboarding] Finishing tour');

        // Retirer le spotlight
        this.removeSpotlight();

        // Sauvegarder le flag
        localStorage.setItem('onboarding_pipeline_done', 'true');

        // Fade out bulle
        this.hideTooltip();

        setTimeout(() => {
            // Fade out overlay
            if (this.overlay) {
                this.overlay.classList.remove('visible');
            }

            setTimeout(() => {
                // Cleanup
                if (this.overlay) this.overlay.remove();
                if (this.tooltip) this.tooltip.remove();
                this.overlay = null;
                this.tooltip = null;

                console.log('[Onboarding] Tour completed');
            }, 300);
        }, 200);
    },

    // Skip le tour (version accélérée)
    skip() {
        console.log('[Onboarding] Skipping tour');

        // Fermer la fiche si ouverte
        if (this.expandedCard && this.targetCard) {
            this.targetCard.click();
        }

        // Cacher la bulle
        this.hideTooltip();

        setTimeout(() => {
            // Faire disparaître les fantômes rapidement
            const exampleCards = Array.from(document.querySelectorAll('.example-card'));

            if (exampleCards.length > 0) {
                let index = 0;
                const stagger = 50;

                const fadeNext = () => {
                    if (index < exampleCards.length) {
                        exampleCards[index].style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
                        exampleCards[index].style.opacity = '0';
                        exampleCards[index].style.transform = 'scale(0.96)';
                        index++;
                        setTimeout(fadeNext, stagger);
                    } else {
                        setTimeout(() => {
                            exampleCards.forEach(card => card.remove());
                            this.finish();
                        }, 300);
                    }
                };

                fadeNext();
            } else {
                this.finish();
            }
        }, 100);
    }
};

// L'initialisation est maintenant gérée dans vendeurs.html après le rendu des sellers
// (voir la fonction computeMatchCounts().then(() => {...}) dans l'initialisation)
