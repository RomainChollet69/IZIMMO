/**
 * gamification.js
 * Système de gamification dopaminergique pour Léon.
 * Gère : points, streaks, toasts, compteur header, célébrations milestone.
 * Dépendances : supabase-config.js (supabaseClient global)
 */
(function () {
    'use strict';

    // ===== CONFIGURATION DES POINTS =====
    const POINTS_CONFIG = {
        create_lead:            { points: 15, label: 'Lead créé' },
        complete_lead_fields:   { points: 10, label: 'Fiche complète' },
        add_note:               { points: 5,  label: 'Note ajoutée' },
        voice_note:             { points: 8,  label: 'Note vocale' },
        upload_document:        { points: 5,  label: 'Document ajouté' },
        plan_visit:             { points: 15, label: 'Visite planifiée' },
        visit_feedback:         { points: 20, label: 'Retour de visite' },
        move_stage:             { points: 3,  label: 'Lead déplacé' },
        complete_workflow_step: { points: 8,  label: 'Étape validée' },
        complete_workflow:      { points: 30, label: 'Workflow terminé !' },
        set_reminder:           { points: 5,  label: 'Relance planifiée' },
        dismiss_reminder:       { points: 10, label: 'Relance traitée' },
        create_social_post:     { points: 12, label: 'Post créé' },
        publish_social_post:    { points: 8,  label: 'Post partagé' },
        complete_todo:          { points: 3,  label: 'Todo terminée' },
        lead_to_mandate:        { points: 50, label: 'Mandat signé !' },
        lead_to_sold:           { points: 100, label: 'Vente réalisée !' },
        daily_streak:           { points: 15, label: 'Streak du jour !' }
    };

    const MILESTONE_THRESHOLDS = [100, 500, 1000, 5000, 10000];
    const RANDOM_BONUS_CHANCE = 0.10; // 10% de chance de x2
    const RANDOM_BONUS_MULTIPLIER = 2;
    const STREAK_MIN_ACTIONS = 3; // Actions min par jour pour streak
    const TOAST_DURATION_MS = 2000;
    const TOAST_BONUS_DURATION_MS = 3000;

    // ===== STATE =====
    let profile = null;
    let userId = null;
    let initialized = false;
    let toastQueue = []; // Évite l'empilement des toasts
    let toastActive = false;

    // ===== STYLES =====
    const style = document.createElement('style');
    style.textContent = `
        /* ===== Compteur points header ===== */
        .gamif-counter {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            border-radius: 20px;
            font-family: 'Barlow Semi Condensed', sans-serif;
            font-weight: 700;
            font-size: 14px;
            color: #5D4037;
            cursor: default;
            position: relative;
            transition: transform 0.2s;
            user-select: none;
        }
        .gamif-counter:hover { transform: scale(1.05); }
        .gamif-counter-icon { font-size: 16px; line-height: 1; }

        /* ===== Tooltips ===== */
        .gamif-counter .gamif-tooltip,
        .gamif-streak .gamif-tooltip {
            position: absolute;
            top: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%) scale(0.9);
            background: #333;
            color: white;
            font-family: 'Inter', sans-serif;
            font-size: 12px;
            font-weight: 500;
            padding: 8px 12px;
            border-radius: 8px;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: all 0.2s ease;
            z-index: 10000;
        }
        .gamif-counter .gamif-tooltip::before,
        .gamif-streak .gamif-tooltip::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 5px solid transparent;
            border-bottom-color: #333;
        }
        .gamif-counter:hover .gamif-tooltip,
        .gamif-streak:hover .gamif-tooltip {
            opacity: 1;
            transform: translateX(-50%) scale(1);
        }
        .gamif-counter-value {
            min-width: 24px;
            text-align: center;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .gamif-counter-value.bump { transform: scale(1.4); }

        /* ===== Badge streak ===== */
        .gamif-streak {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            position: relative;
            background: #F5F5F5;
            border-radius: 12px;
            font-family: 'Inter', sans-serif;
            font-size: 12px;
            font-weight: 600;
            color: #9E9E9E;
            user-select: none;
            transition: all 0.3s;
        }
        .gamif-streak.active {
            background: linear-gradient(135deg, #FF6D00, #FF9100);
            color: white;
        }
        .gamif-streak-icon { font-size: 13px; line-height: 1; }

        /* ===== Toast points ===== */
        .gamif-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-30px);
            background: linear-gradient(135deg, #FFD700, #FFA500);
            color: #5D4037;
            padding: 12px 24px;
            border-radius: 14px;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 6px 24px rgba(255, 165, 0, 0.4);
            z-index: 99999;
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            display: flex;
            align-items: center;
            gap: 8px;
            pointer-events: none;
            white-space: nowrap;
        }
        .gamif-toast.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        .gamif-toast.bonus {
            background: linear-gradient(135deg, #FF6D00, #E91E63);
            color: white;
            box-shadow: 0 8px 32px rgba(233, 30, 99, 0.5);
            padding: 14px 28px;
            font-size: 15px;
        }
        .gamif-toast-pts {
            font-family: 'Barlow Semi Condensed', sans-serif;
            font-weight: 800;
            font-size: 16px;
        }
        .gamif-toast.bonus .gamif-toast-pts { font-size: 18px; }

        /* ===== Milestone overlay ===== */
        .gamif-milestone {
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            transition: opacity 0.4s;
            pointer-events: none;
        }
        .gamif-milestone.visible {
            opacity: 1;
            pointer-events: auto;
        }
        .gamif-milestone-card {
            background: white;
            border-radius: 24px;
            padding: 48px 56px;
            text-align: center;
            box-shadow: 0 16px 64px rgba(0, 0, 0, 0.25);
            transform: scale(0.7);
            transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .gamif-milestone.visible .gamif-milestone-card { transform: scale(1); }
        .gamif-milestone-trophy { font-size: 56px; margin-bottom: 16px; }
        .gamif-milestone-number {
            font-family: 'Barlow Semi Condensed', sans-serif;
            font-weight: 800;
            font-size: 48px;
            background: linear-gradient(135deg, #FFD700, #FF6D00);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .gamif-milestone-label {
            margin-top: 12px;
            font-family: 'Inter', sans-serif;
            font-size: 16px;
            color: #666;
        }

        /* ===== Animation confettis ===== */
        @keyframes gamifConfetti {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
        }
        .gamif-confetti {
            position: fixed;
            top: -10px;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            z-index: 100001;
            pointer-events: none;
            animation: gamifConfetti 3s ease-in forwards;
        }

        /* ===== Responsive mobile ===== */
        @media (max-width: 768px) {
            .gamif-counter { padding: 4px 10px; font-size: 12px; }
            .gamif-counter-icon { font-size: 14px; }
            .gamif-streak { display: none; }
            .gamif-toast { font-size: 13px; padding: 10px 18px; }
            .gamif-milestone-card { padding: 32px 28px; }
            .gamif-milestone-number { font-size: 36px; }
        }
    `;
    document.head.appendChild(style);

    // ===== FONCTIONS UTILITAIRES =====

    function formatNumber(n) {
        if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
        return n.toLocaleString('fr-FR');
    }

    function todayStr() {
        return new Date().toISOString().split('T')[0];
    }

    // ===== PROFIL DB =====

    async function loadProfile() {
        const { data, error } = await supabaseClient
            .from('gamification_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error || !data) return null;
        return data;
    }

    function monthStr() {
        return todayStr().slice(0, 7); // "2026-03"
    }

    async function createProfile() {
        const today = todayStr();
        const { data, error } = await supabaseClient
            .from('gamification_profiles')
            .insert({
                user_id: userId,
                total_points: 0,
                current_streak: 0,
                longest_streak: 0,
                level: 1,
                actions_today: 0,
                today_date: today,
                monthly_points: 0,
                month_year: monthStr()
            })
            .select()
            .single();
        if (error) {
            console.error('[Gamification] Erreur création profil:', error);
            return null;
        }
        return data;
    }

    async function saveProfile() {
        if (!profile || !profile.id) return;
        const { error } = await supabaseClient
            .from('gamification_profiles')
            .update({
                total_points: profile.total_points,
                current_streak: profile.current_streak,
                longest_streak: profile.longest_streak,
                last_active_date: profile.last_active_date,
                level: profile.level,
                actions_today: profile.actions_today,
                today_date: profile.today_date,
                monthly_points: profile.monthly_points,
                month_year: profile.month_year
            })
            .eq('id', profile.id);
        if (error) console.error('[Gamification] Erreur sauvegarde profil:', error);
    }

    // ===== STREAK =====

    function checkAndUpdateStreak(today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Si hier on avait >= STREAK_MIN_ACTIONS, le streak continue
        if (profile.last_active_date === yesterdayStr) {
            // Streak maintenu — pas d'incrémentation ici, ça se fait quand on atteint 3 actions
        } else if (profile.last_active_date !== today) {
            // Streak brisé (plus d'un jour sans activité suffisante)
            profile.current_streak = 0;
        }
    }

    async function awardDailyStreak() {
        const config = POINTS_CONFIG.daily_streak;

        // Log en DB (pas de multiplicateur pour le streak)
        supabaseClient.from('gamification_log').insert({
            user_id: userId,
            action_type: 'daily_streak',
            points: config.points,
            multiplier: 1,
            context: { streak_day: profile.current_streak + 1 }
        });

        profile.total_points += config.points;
        profile.monthly_points += config.points;
        profile.current_streak += 1;
        profile.last_active_date = profile.today_date;
        profile.longest_streak = Math.max(profile.longest_streak, profile.current_streak);

        showPointsToast(config.points, config.label, false);
        updateCounter(profile.total_points);
        updateStreakBadge();
    }

    // ===== NIVEAU =====

    function calculateLevel(points) {
        if (points >= 5000) return 5;
        if (points >= 1000) return 4;
        if (points >= 500) return 3;
        if (points >= 100) return 2;
        return 1;
    }

    // ===== UI : COMPTEUR HEADER =====

    function injectHeaderCounter() {
        // Ne pas injecter dans les iframes
        if (window.parent !== window) return;

        const headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;

        // Créer le compteur
        const counter = document.createElement('div');
        counter.className = 'gamif-counter';
        counter.id = 'gamifCounter';
        const levelName = ['Débutant','Actif','Confirmé','Expert','Légende'][profile.level - 1] || '';
        counter.innerHTML = `
            <span class="gamif-counter-icon">\u2B50</span>
            <span class="gamif-counter-value">${formatNumber(profile.total_points)}</span>
            <span class="gamif-tooltip">Tes points Léon — Niveau ${profile.level} ${levelName}</span>
        `;

        // Créer le badge streak
        const streak = document.createElement('div');
        streak.className = 'gamif-streak' + (profile.current_streak > 0 ? ' active' : '');
        streak.id = 'gamifStreak';
        const streakTip = profile.current_streak > 0
            ? `${profile.current_streak} jour${profile.current_streak > 1 ? 's' : ''} d'affilée ! Continue !`
            : 'Fais 3 actions aujourd\'hui pour lancer ta streak';
        streak.innerHTML = `
            <span class="gamif-streak-icon">\uD83D\uDD25</span>
            <span class="gamif-streak-value">${profile.current_streak}j</span>
            <span class="gamif-tooltip">${streakTip}</span>
        `;

        // Insérer avant le séparateur
        const separator = headerActions.querySelector('.header-separator');
        if (separator) {
            headerActions.insertBefore(streak, separator);
            headerActions.insertBefore(counter, separator);
        } else {
            // Fallback : avant le user-profile
            const userProfile = headerActions.querySelector('.user-profile, #userProfile');
            if (userProfile) {
                headerActions.insertBefore(streak, userProfile);
                headerActions.insertBefore(counter, userProfile);
            } else {
                headerActions.prepend(streak);
                headerActions.prepend(counter);
            }
        }
    }

    function updateCounter(newTotal) {
        const valueEl = document.querySelector('.gamif-counter-value');
        if (!valueEl) return;
        valueEl.textContent = formatNumber(newTotal);
        valueEl.classList.add('bump');
        setTimeout(() => valueEl.classList.remove('bump'), 300);
    }

    function updateStreakBadge() {
        const badge = document.getElementById('gamifStreak');
        if (!badge) return;
        badge.classList.toggle('active', profile.current_streak > 0);
        const val = badge.querySelector('.gamif-streak-value');
        if (val) val.textContent = profile.current_streak + 'j';
    }

    // ===== UI : TOAST POINTS =====

    function showPointsToast(points, label, isBonus) {
        // En iframe, envoyer au parent
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'gamification-toast',
                points: points,
                label: label,
                isBonus: isBonus
            }, '*');
            return;
        }

        toastQueue.push({ points, label, isBonus });
        if (!toastActive) processToastQueue();
    }

    function processToastQueue() {
        if (toastQueue.length === 0) {
            toastActive = false;
            return;
        }
        toastActive = true;
        const { points, label, isBonus } = toastQueue.shift();

        const toast = document.createElement('div');
        toast.className = 'gamif-toast' + (isBonus ? ' bonus' : '');

        if (isBonus) {
            toast.innerHTML = `<span>\uD83D\uDD25 x2 BONUS</span> <span class="gamif-toast-pts">+${points}</span> <span>${label}</span>`;
        } else {
            toast.innerHTML = `<span>\u2B50</span> <span class="gamif-toast-pts">+${points}</span> <span>${label}</span>`;
        }

        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        const duration = isBonus ? TOAST_BONUS_DURATION_MS : TOAST_DURATION_MS;
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => {
                toast.remove();
                processToastQueue();
            }, 400);
        }, duration);
    }

    // ===== UI : MILESTONE CÉLÉBRATION =====

    function checkMilestone(prevTotal, newTotal) {
        for (const threshold of MILESTONE_THRESHOLDS) {
            if (prevTotal < threshold && newTotal >= threshold) {
                showMilestoneCelebration(threshold);
                break;
            }
        }
    }

    function showMilestoneCelebration(threshold) {
        // Ne pas afficher dans les iframes
        if (window.parent !== window) return;

        // Confettis
        spawnConfetti();

        const overlay = document.createElement('div');
        overlay.className = 'gamif-milestone';
        overlay.innerHTML = `
            <div class="gamif-milestone-card">
                <div class="gamif-milestone-trophy">\uD83C\uDFC6</div>
                <div class="gamif-milestone-number">${threshold.toLocaleString('fr-FR')} pts</div>
                <div class="gamif-milestone-label">Bravo ! Continue comme \u00e7a !</div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));

        // Fermer au clic ou après 4s
        const close = () => {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 400);
        };
        overlay.addEventListener('click', close);
        setTimeout(close, 4000);
    }

    function spawnConfetti() {
        const colors = ['#FFD700', '#FF6D00', '#E91E63', '#667eea', '#764ba2', '#4CAF50', '#00BCD4'];
        const count = 40;
        for (let i = 0; i < count; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'gamif-confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.width = (6 + Math.random() * 8) + 'px';
            confetti.style.height = (6 + Math.random() * 8) + 'px';
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 5000);
        }
    }

    // ===== ÉCOUTE DES MESSAGES IFRAME =====

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'gamification-toast') {
            showPointsToast(event.data.points, event.data.label, event.data.isBonus);
            // Rafraîchir le compteur depuis la DB
            refreshCounter();
        }
    });

    async function refreshCounter() {
        if (!userId) return;
        const fresh = await loadProfile();
        if (fresh) {
            profile = fresh;
            updateCounter(profile.total_points);
            updateStreakBadge();
        }
    }

    // ===== FONCTION PUBLIQUE PRINCIPALE =====

    async function awardPoints(actionType, context) {
        if (!initialized || !profile || !userId) {
            console.warn('[Gamification] Module non initialisé, action ignorée:', actionType);
            return;
        }

        context = context || {};
        const config = POINTS_CONFIG[actionType];
        if (!config) {
            console.warn('[Gamification] Action inconnue:', actionType);
            return;
        }

        // Multiplicateur aléatoire (10% de chance x2)
        const isBonus = Math.random() < RANDOM_BONUS_CHANCE;
        const multiplier = isBonus ? RANDOM_BONUS_MULTIPLIER : 1;
        const finalPoints = config.points * multiplier;

        // 1. Log en DB (non-bloquant)
        supabaseClient.from('gamification_log').insert({
            user_id: userId,
            action_type: actionType,
            points: finalPoints,
            multiplier: multiplier,
            context: context
        });

        // 2. Mise à jour du profil local
        const prevTotal = profile.total_points;
        profile.total_points += finalPoints;
        profile.monthly_points += finalPoints;
        profile.actions_today += 1;
        profile.level = calculateLevel(profile.total_points);

        // 3. Toast + compteur (feedback immédiat)
        showPointsToast(finalPoints, config.label, isBonus);
        updateCounter(profile.total_points);

        // 4. Vérifier si on atteint le seuil streak (3e action du jour)
        if (profile.actions_today === STREAK_MIN_ACTIONS) {
            // Petit délai pour ne pas chevaucher le toast principal
            setTimeout(() => awardDailyStreak(), TOAST_DURATION_MS + 500);
        }

        // 5. Vérifier les milestones
        checkMilestone(prevTotal, profile.total_points);

        // 6. Sauvegarder en DB (non-bloquant pour le UI)
        saveProfile();

        console.log(`[Gamification] +${finalPoints} pts (${actionType})${isBonus ? ' BONUS x2!' : ''} | Total: ${profile.total_points}`);
    }

    // ===== INITIALISATION =====

    async function initGamification() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;
            userId = session.user.id;

            // Charger ou créer le profil
            profile = await loadProfile();
            if (!profile) profile = await createProfile();
            if (!profile) return; // Erreur critique

            // Vérifier si le jour a changé
            const today = todayStr();
            if (profile.today_date !== today) {
                checkAndUpdateStreak(today);
                profile.actions_today = 0;
                profile.today_date = today;
            }

            // Vérifier si le mois a changé
            const currentMonth = monthStr();
            if (profile.month_year !== currentMonth) {
                profile.monthly_points = 0;
                profile.month_year = currentMonth;
            }

            await saveProfile();

            // Injecter le compteur dans le header
            injectHeaderCounter();

            initialized = true;
            console.log(`[Gamification] Initialisé — ${profile.total_points} pts, streak ${profile.current_streak}j`);
        } catch (err) {
            console.error('[Gamification] Erreur initialisation:', err);
        }
    }

    // ===== EXPOSE API GLOBALE =====
    window.awardPoints = awardPoints;

    // Initialiser au chargement du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGamification);
    } else {
        initGamification();
    }
})();
