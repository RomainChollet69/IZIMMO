// Léon — Social Content Engine — Frontend Logic
// Sprint 1: Mode "J'ai un truc à raconter" + Onboarding + Historique

(async function() {
    'use strict';

    // ===== STATE =====
    let currentProfile = null;
    let currentStep = 1;
    let neighborhoods = [];
    let audioRecorder = null;
    let audioStream = null;
    let currentResults = [];
    let placeholderInterval = null;

    // ===== PLACEHOLDER EXAMPLES =====
    const PLACEHOLDER_EXAMPLES = [
        "ex: Ce matin j'ai visité un T3 rue Garibaldi avec un couple de primo-accédants. L'appart est bien mais le DPE est en F...",
        "ex: Moi je pense que les prix des maisons vont baisser, en tout cas sur Lyon et sa couronne. Et je vais vous dire pourquoi...",
        "ex: On a signé chez le notaire ce matin pour le T4 de Villeurbanne. Les acheteurs étaient émus, c'est leur premier achat.",
        "ex: Je suis passé devant la nouvelle boulangerie rue des Tables Claudiennes, elle a rouvert après 3 mois de travaux.",
        "ex: Ma courtière m'annonce 3.35% sur 20 ans cette semaine. Il y a 2 mois c'était 3.60. Ça change la donne.",
        "ex: Un vendeur m'a raccroché au nez parce que je lui ai dit que son bien valait 30k de moins que ce qu'il pensait...",
        "ex: Aujourd'hui un acquéreur m'a demandé si c'était le bon moment pour acheter. Voilà ce que je lui ai répondu.",
        "ex: Le quartier de la Croix-Rousse a complètement changé en 2 ans. Les prix ont pris 12% mais surtout l'ambiance..."
    ];

    // ===== CALENDAR DATA (section 7 du brief) =====
    const CALENDAR = {
        lundi: {
            linkedin: 'Analyse marché',
            instagram: 'Carrousel éducatif',
            facebook: 'Stat marché',
            tiktok: 'Visite minute'
        },
        mardi: {
            instagram: 'Reel quartier',
            facebook: 'Coup de cœur local',
            tiktok: 'Conseil express'
        },
        mercredi: {
            linkedin: 'Étude de cas',
            instagram: 'Carrousel listing',
            facebook: 'Nouveau mandat',
            tiktok: 'Anecdote terrain'
        },
        jeudi: {
            instagram: 'Reel conseil',
            facebook: 'Quiz / Vrai-Faux',
            tiktok: 'Quartier spotlight'
        },
        vendredi: {
            linkedin: 'Avis à contre-pied',
            instagram: 'Post vendu',
            facebook: 'Remise de clés',
            tiktok: 'Humour / coulisses'
        }
    };

    const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    // ===== TEMPLATE DETAILS =====
    const TEMPLATE_DETAILS = {
        // LinkedIn
        'Analyse marché': {
            quoi: 'Post texte LinkedIn — un chiffre marché local + ton analyse terrain',
            pourquoi: 'Positionne comme expert local. Les posts data génèrent 3x plus de contacts vendeurs.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Étude de cas': {
            quoi: 'Post texte ou carrousel — une vente réussie décortiquée',
            pourquoi: 'Montre concrètement ta valeur ajoutée. Les vendeurs veulent voir des preuves, pas des promesses.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Avis à contre-pied': {
            quoi: 'Post texte — une opinion tranchée sur le marché',
            pourquoi: 'Génère des commentaires et du débat. L\'algorithme LinkedIn adore les posts qui divisent.',
            cibles: ['notoriete'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Coulisses / bilan': {
            quoi: 'Post texte — transparence sur ton activité du mois',
            pourquoi: 'La transparence crée la confiance. Les vendeurs choisissent l\'agent qu\'ils connaissent.',
            cibles: ['notoriete'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Recrutement': {
            quoi: 'Post texte — histoire de reconversion d\'un collaborateur',
            pourquoi: 'Attire des profils en reconversion qui cherchent un modèle accessible.',
            cibles: ['recrutement'],
            temps: '2 min',
            tempsIcon: '⚡'
        },

        // Instagram
        'Carrousel éducatif': {
            quoi: 'Carrousel 5-7 slides — conseil pratique immobilier',
            pourquoi: 'Les carrousels sont le format le plus sauvegardé sur Instagram. Sauvegarde = visibilité.',
            cibles: ['acquereurs'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Reel quartier': {
            quoi: 'Vidéo 30 sec — balade dans un quartier avec voix off',
            pourquoi: 'Montre que tu connais le terrain mieux que personne. Les Reels ont 2x plus de portée.',
            cibles: ['notoriete'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Reel visite': {
            quoi: 'Vidéo 30-45 sec — visite express d\'un bien',
            pourquoi: 'Les visites en vidéo génèrent des DM d\'acquéreurs qualifiés.',
            cibles: ['acquereurs'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Reel conseil': {
            quoi: 'Vidéo 20 sec — 3 conseils face caméra avec jump cuts',
            pourquoi: 'Le face-cam crée un lien personnel. Les gens achètent à quelqu\'un qu\'ils connaissent.',
            cibles: ['notoriete'],
            temps: '5 min',
            tempsIcon: '📸'
        },
        'Post vendu': {
            quoi: 'Photo + légende — remise de clés ou témoignage',
            pourquoi: 'La preuve sociale est le déclencheur n°1 pour les vendeurs qui hésitent.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Story reveal': {
            quoi: 'Séquence de 5 stories — teaser + reveal d\'un bien',
            pourquoi: 'Le suspense crée de l\'attente. Les stories séquencées ont un taux de complétion 40% plus élevé.',
            cibles: ['acquereurs'],
            temps: '10 min',
            tempsIcon: '📸'
        },

        // Facebook
        'Coup de cœur local': {
            quoi: 'Photo + texte — un commerce ou lieu local que tu aimes',
            pourquoi: 'Le commerçant repartage → tu touches son audience. Effet de levier gratuit.',
            cibles: ['notoriete'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Quiz / Vrai-Faux': {
            quoi: 'Post texte — question vrai/faux avec réponse',
            pourquoi: 'Les quiz génèrent 4x plus de commentaires. Commentaires = visibilité algorithmique.',
            cibles: ['acquereurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Remise de clés': {
            quoi: 'Photo + texte — histoire d\'une vente réussie',
            pourquoi: 'Prouve que tu vends. Les vendeurs regardent les Facebook des agents avant de les appeler.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Live visite': {
            quoi: 'Live Facebook 10-20 min — visite en direct avec chat',
            pourquoi: 'Les lives ont la portée organique la plus élevée sur Facebook. Et le replay continue de tourner.',
            cibles: ['acquereurs'],
            temps: '20 min',
            tempsIcon: '🕐'
        },
        'Mini-audit groupe': {
            quoi: 'Post dans un groupe local — offre de diagnostic gratuit',
            pourquoi: 'Les groupes locaux sont des mines d\'or de leads. 1 post utile = 3-5 DM.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },

        // TikTok
        'Conseil face-cam': {
            quoi: 'Vidéo 20-30 sec — conseil immobilier en face caméra',
            pourquoi: 'TikTok pousse les nouveaux créateurs. Même avec 0 abonnés, tu peux faire 10k vues.',
            cibles: ['acquereurs'],
            temps: '5 min',
            tempsIcon: '📸'
        },
        'Visite minute': {
            quoi: 'Vidéo 30-45 sec — visite d\'un bien avec commentaire',
            pourquoi: 'Les visites TikTok génèrent des contacts hors zone. Effet vitrine nationale.',
            cibles: ['acquereurs'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Quartier spotlight': {
            quoi: 'Vidéo 25-30 sec — présentation rapide d\'un quartier',
            pourquoi: 'Ancrage local fort. Les acheteurs recherchent un quartier, pas juste un bien.',
            cibles: ['notoriete'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Humour / coulisses': {
            quoi: 'Vidéo libre — trend, humour, behind-the-scenes',
            pourquoi: 'L\'humour humanise. Un agent drôle est un agent qu\'on retient.',
            cibles: ['notoriete'],
            temps: '5 min',
            tempsIcon: '📸'
        },
        'Storytelling': {
            quoi: 'Vidéo 30-40 sec — anecdote de terrain racontée face caméra',
            pourquoi: 'Le storytelling est le format roi sur TikTok. Une bonne histoire = partages = viralité.',
            cibles: ['notoriete'],
            temps: '5 min',
            tempsIcon: '📸'
        },

        // Valeurs par défaut pour templates sans détails spécifiques
        'Carrousel listing': {
            quoi: 'Carrousel Instagram — présentation d\'un bien en vente',
            pourquoi: 'Met en avant ton portefeuille. Les acquéreurs scrollent les carrousels 2x plus que les photos simples.',
            cibles: ['acquereurs'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Avant/après staging': {
            quoi: 'Photo ou Reel — transformation visuelle d\'un bien',
            pourquoi: 'Le avant/après est le format le plus partagé. Les vendeurs y voient la valeur ajoutée concrète.',
            cibles: ['vendeurs'],
            temps: '10 min',
            tempsIcon: '📸'
        },
        'Bilan mensuel': {
            quoi: 'Post texte ou carrousel — récap chiffré de ton mois',
            pourquoi: 'La transparence sur tes résultats inspire confiance. Les vendeurs veulent un agent actif.',
            cibles: ['notoriete'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Coulisses semaine': {
            quoi: 'Post photo ou texte — un moment authentique de ta semaine',
            pourquoi: 'L\'humain derrière l\'agent. Les gens achètent à quelqu\'un qu\'ils apprécient.',
            cibles: ['notoriete'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Stat marché': {
            quoi: 'Post texte ou image — chiffre marché avec ton analyse',
            pourquoi: 'Positionne comme expert local. Les données crédibilisent ton discours.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Nouveau mandat': {
            quoi: 'Photo + texte — annonce d\'une nouvelle exclusivité',
            pourquoi: 'Montre que tu es actif et que les vendeurs te font confiance.',
            cibles: ['vendeurs'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Anecdote terrain': {
            quoi: 'Post texte ou vidéo — histoire vécue sur le terrain',
            pourquoi: 'Le storytelling humanise et crée de la connexion émotionnelle.',
            cibles: ['notoriete'],
            temps: '2 min',
            tempsIcon: '⚡'
        },
        'Conseil express': {
            quoi: 'Vidéo courte — 1 conseil pratique immobilier',
            pourquoi: 'Les conseils rapides sont ultra-partageables. Simple et efficace.',
            cibles: ['acquereurs'],
            temps: '5 min',
            tempsIcon: '📸'
        }
    };

    const CIBLE_LABELS = {
        'vendeurs': { label: '🏠 Vendeurs', class: 'vendeurs' },
        'acquereurs': { label: '🔑 Acquéreurs', class: 'acquereurs' },
        'notoriete': { label: '📍 Notoriété', class: 'notoriete' },
        'recrutement': { label: '👥 Recrutement', class: 'recrutement' }
    };

    // ===== TEMPLATE DETAIL STATE =====
    let currentTemplateContext = null;

    // ===== FREQUENCY FILTER =====
    function getActiveDaysForFrequency(frequency) {
        // Section 7.0 du brief : filtrage selon la fréquence
        if (frequency === 'light') {
            // 2 posts/semaine : lundi + vendredi
            return ['lundi', 'vendredi'];
        } else if (frequency === 'regular') {
            // 3-4 posts/semaine : lundi + mardi + jeudi + vendredi
            return ['lundi', 'mardi', 'jeudi', 'vendredi'];
        } else {
            // intensive : tous les jours (lun-ven)
            return ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
        }
    }

    // ===== INIT =====
    async function init() {
        console.log('[Social] Initializing...');

        // Load profile
        await loadProfile();

        // Render calendar
        renderCalendar();

        // Load history
        await loadHistory();

        // Load suggestions (Sprint 2)
        await loadSuggestions();

        // Setup event listeners
        setupListeners();

        // Initialize story input state
        updateStoryInputState();

        console.log('[Social] Initialized');
    }

    // ===== PROFILE =====
    async function loadProfile() {
        try {
            const { data, error } = await supabaseClient
                .from('social_profiles')
                .select('*')
                .eq('user_id', (await supabaseClient.auth.getUser()).data.user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('[Social] Error loading profile:', error);
                return;
            }

            if (!data) {
                console.log('[Social] No profile found, showing first-time setup');
                currentProfile = null;
                showFirstTimeSetup();
            } else {
                currentProfile = data;
                console.log('[Social] Profile loaded:', data);

                // Check if calendar confirmation was seen
                if (!data.calendar_seen) {
                    // Show calendar confirmation (first access after onboarding)
                    showCalendarConfirmation();
                } else {
                    // Show normal interface
                    showMainInterface();
                }
            }
        } catch (err) {
            console.error('[Social] Error loading profile:', err);
        }
    }

    function showFirstTimeSetup() {
        // Hide main interface elements
        document.querySelector('.calendar-section')?.classList.add('hidden');
        document.querySelector('.create-section')?.classList.add('hidden');
        document.querySelector('.history-section')?.classList.add('hidden');

        // Show onboarding modal FIRST (instead of strategy panel)
        const backdrop = document.getElementById('onboardingBackdrop');
        backdrop.classList.add('active');

        console.log('[Social] Showing onboarding modal');
    }

    function showMainInterface() {
        // Show main interface elements
        document.querySelector('.calendar-section')?.classList.remove('hidden');
        document.querySelector('.create-section')?.classList.remove('hidden');
        document.querySelector('.history-section')?.classList.remove('hidden');

        // Hide strategy panel
        const backdrop = document.getElementById('strategyBackdrop');
        backdrop.classList.remove('active', 'fullscreen-mode');
    }

    async function handleOnboardingSubmit() {
        try {
            // 1. Validation des champs
            const networkSelect = document.getElementById('networkSelect');
            const propertyTypeInput = document.querySelector('input[name="property_type"]:checked');

            // Validation : au moins 1 quartier
            if (neighborhoods.length === 0) {
                alert('Merci d\'ajouter au moins une ville ou un quartier');
                document.getElementById('neighborhoodsInput').focus();
                return;
            }

            // Validation : réseau sélectionné
            if (!networkSelect.value) {
                alert('Merci de sélectionner ton réseau');
                networkSelect.focus();
                return;
            }

            // Validation : type de biens sélectionné
            if (!propertyTypeInput) {
                alert('Merci de sélectionner le type de biens sur lequel tu travailles');
                return;
            }

            // 2. Créer un profil partiel (onboarding_completed: true, calendar_seen: false)
            const user = (await supabaseClient.auth.getUser()).data.user;
            const partialProfile = {
                user_id: user.id,
                neighborhoods: neighborhoods,
                network: networkSelect.value,
                property_types: [propertyTypeInput.value],  // Array pour cohérence DB
                onboarding_completed: true,   // Modal onboarding terminé
                calendar_seen: false,         // Pas encore vu le calendrier
                voice_profile_set: false,     // Pas encore configuré
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabaseClient
                .from('social_profiles')
                .insert(partialProfile)
                .select()
                .single();

            if (error) throw error;

            currentProfile = data;
            console.log('[Social] Partial profile created:', data);

            // 3. Cacher le modal d'onboarding
            document.getElementById('onboardingBackdrop').classList.remove('active');

            // 4. Afficher le strategy panel en mode fullscreen
            showStrategyPanelFullscreen();

        } catch (err) {
            console.error('[Social] Error in handleOnboardingSubmit:', err);
            alert('Erreur lors de la création du profil. Merci de réessayer.');
        }
    }

    function showStrategyPanelFullscreen() {
        const backdrop = document.getElementById('strategyBackdrop');
        backdrop.classList.add('active', 'fullscreen-mode');
        console.log('[Social] Showing strategy panel in fullscreen mode');
    }

    async function createDefaultProfile() {
        try {
            const user = (await supabaseClient.auth.getUser()).data.user;
            const defaultProfile = {
                user_id: user.id,
                tone: 'mixte',
                tutoiement: false,
                publishing_frequency: 'regular',
                platforms_active: ['linkedin', 'instagram', 'facebook'],
                objectives: ['mandats_vendeurs', 'notoriete'],
                time_available: '1h',
                content_style: ['balanced'],
                voice_profile_set: false,
                calendar_seen: false,
                onboarding_completed: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabaseClient
                .from('social_profiles')
                .insert(defaultProfile)
                .select()
                .single();

            if (error) throw error;

            currentProfile = data;
            console.log('[Social] Default profile created:', data);
            renderCalendar(); // Refresh calendar with new profile
        } catch (err) {
            console.error('[Social] Error creating default profile:', err);
        }
    }

    async function saveProfile(profileData) {
        try {
            const user = (await supabaseClient.auth.getUser()).data.user;

            const { data, error } = await supabaseClient
                .from('social_profiles')
                .upsert({
                    user_id: user.id,
                    ...profileData,
                    onboarding_completed: true,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                })
                .select()
                .single();

            if (error) throw error;

            currentProfile = data;
            console.log('[Social] Profile saved:', data);
            return data;
        } catch (err) {
            console.error('[Social] Error saving profile:', err);
            throw err;
        }
    }

    // ===== CRM SUGGESTIONS (Sprint 2) =====
    async function analyzeCRMEvents() {
        const user = (await supabaseClient.auth.getUser()).data.user;
        if (!user) return [];

        const now = new Date();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const suggestions = [];

        try {
            // 1. Recent sales (14 days)
            const { data: recentSales } = await supabaseClient
                .from('sellers')
                .select('property_type, address, budget, last_activity_at')
                .eq('user_id', user.id)
                .eq('status', 'sold')
                .gte('last_activity_at', fourteenDaysAgo)
                .order('last_activity_at', { ascending: false })
                .limit(1);

            if (recentSales && recentSales.length > 0) {
                const sale = recentSales[0];
                suggestions.push({
                    type: 'sale',
                    title: 'Vente récente',
                    description: `Tu as vendu ${sale.property_type || 'un bien'} ${sale.address ? 'à ' + sale.address : ''} — un post "remise de clés" ?`,
                    platform: 'linkedin',
                    data: sale
                });
            }

            // 2. Old mandates without offers (> 45 days)
            const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
            const { data: oldMandates } = await supabaseClient
                .from('sellers')
                .select('property_type, address, mandate_start_date')
                .eq('user_id', user.id)
                .eq('status', 'mandate')
                .lt('mandate_start_date', fortyFiveDaysAgo)
                .order('mandate_start_date', { ascending: true })
                .limit(1);

            if (oldMandates && oldMandates.length > 0) {
                const mandate = oldMandates[0];
                const days = Math.floor((now - new Date(mandate.mandate_start_date)) / (1000 * 60 * 60 * 24));
                suggestions.push({
                    type: 'mandate',
                    title: 'Mandat longue durée',
                    description: `Ton ${mandate.property_type || 'bien'} ${mandate.address ? 'à ' + mandate.address : ''} est en mandat depuis ${days} jours — une étude de cas pour relancer ?`,
                    platform: 'linkedin',
                    data: { ...mandate, days }
                });
            }

            // 3. Recent visits (7 days)
            const { data: visits, count: visitsCount } = await supabaseClient
                .from('visits')
                .select('*', { count: 'exact' })
                .eq('user_id', user.id)
                .gte('created_at', sevenDaysAgo);

            if (visitsCount && visitsCount >= 3) {
                suggestions.push({
                    type: 'visits',
                    title: 'Visites de la semaine',
                    description: `Tu as fait ${visitsCount} visites cette semaine — un Reel "visite express" ?`,
                    platform: 'instagram',
                    data: { count: visitsCount }
                });
            }

            // 4. Monthly estimations (≥ 3)
            const { count: estimationsCount } = await supabaseClient
                .from('sellers')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .gte('created_at', monthStart);

            if (estimationsCount && estimationsCount >= 3) {
                suggestions.push({
                    type: 'estimations',
                    title: 'Estimations du mois',
                    description: `Tu as fait ${estimationsCount} estimations ce mois — un post "analyse marché" ?`,
                    platform: 'linkedin',
                    data: { count: estimationsCount }
                });
            }

        } catch (err) {
            console.error('[Social] CRM analysis error:', err);
        }

        return suggestions;
    }

    async function loadSuggestions() {
        const container = document.getElementById('suggestionsContainer');
        const suggestions = await analyzeCRMEvents();

        if (suggestions.length === 0) {
            // Show calendar suggestion for today
            const today = DAYS_FR[new Date().getDay()];
            const templates = CALENDAR[today] || {};
            const platforms = currentProfile?.platforms_active || ['linkedin', 'instagram', 'facebook', 'tiktok'];

            let html = `<div class="suggestion-empty">
                <p style="color:var(--text-light);margin-bottom:16px">Aucun événement CRM récent détecté.</p>
                <p style="font-weight:600;margin-bottom:8px">Suggestions du calendrier pour aujourd'hui :</p>
            `;

            for (const platform of platforms) {
                if (templates[platform]) {
                    const emoji = { linkedin: '💼', instagram: '📸', facebook: '👥', tiktok: '🎵' }[platform] || '📱';
                    html += `<div class="calendar-suggestion">
                        ${emoji} <strong>${platform.charAt(0).toUpperCase() + platform.slice(1)}</strong> : ${templates[platform]}
                    </div>`;
                }
            }

            html += '</div>';
            container.innerHTML = html;
        } else {
            let html = suggestions.map(s => `
                <div class="suggestion-card" data-suggestion='${JSON.stringify(s).replace(/'/g, "&apos;")}'>
                    <div class="suggestion-icon">${s.type === 'sale' ? '🏡' : s.type === 'visits' ? '🚶' : s.type === 'mandate' ? '📋' : '📊'}</div>
                    <div class="suggestion-content">
                        <div class="suggestion-title">${escapeHtml(s.title)}</div>
                        <div class="suggestion-description">${escapeHtml(s.description)}</div>
                    </div>
                    <button class="suggestion-btn" onclick="window.handleSuggestionClick(this)">Raconter cette histoire</button>
                </div>
            `).join('');

            container.innerHTML = html;
        }
    }

    window.handleSuggestionClick = async function(btn) {
        const card = btn.closest('.suggestion-card');
        const suggestion = JSON.parse(card.dataset.suggestion.replace(/&apos;/g, "'"));

        if (!currentProfile) {
            alert('Profil non configuré. Recharge la page.');
            return;
        }

        // Check if voice profile modal should be shown (first time only)
        const shouldShowVoiceModal = await checkAndShowVoiceModal();
        if (shouldShowVoiceModal) {
            // Store suggestion context for after voice profile is saved
            window.pendingSuggestion = suggestion;
            return;
        }

        await generateFromSuggestion(suggestion, btn);
    };

    async function generateFromSuggestion(suggestion, btn) {
        const platforms = currentProfile.platforms_active || [];
        if (platforms.length === 0) {
            alert('Aucune plateforme active dans ton profil');
            return;
        }

        // Disable button during generation
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ En cours...';
        }

        try {
            currentResults = [];

            for (const platform of platforms) {
                console.log(`[Social] Generating suggestion post for ${platform}...`);

                const response = await fetch('/api/generate-social-post', {
                    method: 'POST',
                    headers: await getAuthHeaders(),
                    body: JSON.stringify({
                        mode: 'suggestion',
                        platform,
                        suggestion_context: suggestion
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || `Erreur ${platform}`);
                }

                const result = await response.json();
                currentResults.push({ platform, ...result });
                console.log(`[Social] Generated for ${platform}:`, result);
            }

            // Display results
            displayResults();

            // Reload history
            await loadHistory();

        } catch (err) {
            console.error('[Social] Generate suggestion error:', err);
            alert('Erreur lors de la génération: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Raconter cette histoire';
            }
        }
    }

    // ===== TEMPLATE POPOVER =====
    window.showTemplatePopover = function(templateName, platform, dayName) {
        const popover = document.getElementById('templatePopover');
        const backdrop = document.getElementById('templatePopoverBackdrop');
        const details = TEMPLATE_DETAILS[templateName];

        // Use default if template not found
        const defaultDetails = {
            quoi: 'Post sur les réseaux sociaux — format adapté à la plateforme',
            pourquoi: 'Maintenir une présence active et engageante auprès de ton audience.',
            cibles: ['notoriete'],
            ciblesLabels: ['📍 Notoriété locale'],
            temps: '5 min',
            tempsIcon: '⚡',
            tempsClass: ''
        };

        const templateData = details || defaultDetails;

        // Store context for generation
        currentTemplateContext = {
            templateName,
            platform,
            dayName
        };

        // Get platform info
        const platformInfo = {
            linkedin: { name: 'LinkedIn', icon: 'fab fa-linkedin', objective: 'Générer des mandats vendeurs' },
            instagram: { name: 'Instagram', icon: 'fab fa-instagram', objective: 'Toucher des acquéreurs' },
            facebook: { name: 'Facebook', icon: 'fab fa-facebook', objective: 'Renforcer la notoriété locale' },
            tiktok: { name: 'TikTok', icon: 'fab fa-tiktok', objective: 'Atteindre de nouveaux profils' }
        };

        const pInfo = platformInfo[platform] || platformInfo.linkedin;

        // Get template icon
        const templateIcon = getTemplateIcon(templateName);

        // Fill popover content
        document.getElementById('templateIconBadge').textContent = templateIcon;
        document.getElementById('templatePopoverName').textContent = templateName;
        document.getElementById('templatePopoverPlatformIcon').className = pInfo.icon;
        document.getElementById('templatePopoverPlatform').textContent = pInfo.name;
        document.getElementById('templatePopoverObjective').innerHTML = `🎯 <span>${pInfo.objective}</span>`;

        // Cards
        document.getElementById('templateCardQuoi').textContent = templateData.quoi;
        document.getElementById('templateCardPourquoi').textContent = templateData.pourquoi;

        // Cibles tags
        const ciblesHTML = (templateData.ciblesLabels || getCibleLabels(templateData.cibles)).map(label =>
            `<span class="template-tag">${label}</span>`
        ).join('');
        document.getElementById('templateCardCibles').innerHTML = ciblesHTML;

        // Temps badge
        const tempsClass = templateData.tempsClass || getTempsClass(templateData.temps);
        document.getElementById('templateCardTemps').innerHTML =
            `<span class="template-time-badge ${tempsClass}">${templateData.tempsIcon} ${templateData.temps}</span>`;

        // Show popover (centered by CSS)
        backdrop.classList.remove('hidden');
        popover.classList.remove('hidden');
    };

    window.closeTemplatePopover = function() {
        document.getElementById('templatePopover').classList.add('hidden');
        document.getElementById('templatePopoverBackdrop').classList.add('hidden');
        currentTemplateContext = null;
    };

    window.generateFromTemplatePopover = async function() {
        if (!currentTemplateContext) return;

        const { templateName, platform } = currentTemplateContext;

        // Close popover
        closeTemplatePopover();

        // Switch to story mode
        document.getElementById('storyArea').classList.add('active');
        document.getElementById('suggestionsArea').classList.remove('active');
        document.getElementById('storyBtn').classList.add('active');
        document.getElementById('suggestionBtn').classList.remove('active');

        // Fill context
        const storyInput = document.getElementById('storyInput');
        storyInput.value = `Créer un post "${templateName}" pour ${platform}`;
        storyInput.focus();
        updateStoryInputState();

        // Scroll to story area
        document.querySelector('.create-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Helper functions for popover
    function getTemplateIcon(templateName) {
        const icons = {
            'Analyse marché': '📊',
            'Étude de cas': '📋',
            'Avis à contre-pied': '💬',
            'Coulisses / bilan': '📸',
            'Recrutement': '👥',
            'Carrousel éducatif': '📚',
            'Reel quartier': '🏘️',
            'Reel visite': '🏠',
            'Reel conseil': '💡',
            'Post vendu': '🔑',
            'Story reveal': '✨',
            'Coup de cœur local': '❤️',
            'Quiz / Vrai-Faux': '❓',
            'Remise de clés': '🔑',
            'Live visite': '📹',
            'Mini-audit groupe': '🔍',
            'Conseil face-cam': '🎥',
            'Visite minute': '⚡',
            'Quartier spotlight': '🌟',
            'Humour / coulisses': '😄',
            'Storytelling': '📖'
        };
        return icons[templateName] || '📱';
    }

    function getCibleLabels(cibles) {
        const labels = {
            'vendeurs': '🏠 Propriétaires en réflexion',
            'acquereurs': '🔑 Acquéreurs actifs',
            'notoriete': '📍 Notoriété locale',
            'recrutement': '👥 Profils en reconversion'
        };
        return cibles.map(c => labels[c] || c);
    }

    function getTempsClass(temps) {
        if (temps.includes('10')) return 'long';
        if (temps.includes('5')) return 'medium';
        return '';
    }

    // ===== CALENDAR =====
    function renderCalendar() {
        const container = document.getElementById('weekCalendar');
        const now = new Date();
        const today = DAYS_FR[now.getDay()];

        // Get Monday of current week
        const monday = new Date(now);
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day; // If Sunday, go back 6 days
        monday.setDate(now.getDate() + diff);

        // Get frequency filter
        const frequency = currentProfile?.publishing_frequency || 'regular';
        const activeDays = getActiveDaysForFrequency(frequency);

        let html = '';

        // Render Mon-Fri only
        for (let i = 0; i < 5; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dayName = DAYS_FR[date.getDay()];
            const dayShort = DAYS_SHORT[date.getDay()];
            const isToday = dayName === today;

            // Skip if this day is not active for the chosen frequency
            if (!activeDays.includes(dayName)) {
                continue;
            }

            const templates = CALENDAR[dayName] || {};
            const platforms = currentProfile?.platforms_active || ['linkedin', 'instagram', 'facebook', 'tiktok'];

            let platformsHTML = '';
            for (const platform of platforms) {
                if (templates[platform]) {
                    const icon = getPlatformIcon(platform);
                    const templateName = templates[platform];
                    const escapedTemplate = templateName.replace(/'/g, "\\'");
                    platformsHTML += `<span class="platform" onclick="event.stopPropagation(); showTemplatePopover('${escapedTemplate}', '${platform}', '${dayName}')">${icon} ${templateName}</span>`;
                }
            }

            html += `
                <div class="day-card ${isToday ? 'today' : ''}">
                    <div class="day-name">${dayShort} ${date.getDate()}/${date.getMonth() + 1}</div>
                    <div class="day-platforms">
                        ${platformsHTML || '<span class="platform" style="color: var(--text-light);">Aucun post prévu</span>'}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // ===== EVENT LISTENERS =====
    function setupListeners() {
        // Mode buttons
        document.getElementById('suggestionBtn').addEventListener('click', () => {
            document.getElementById('suggestionsArea').classList.add('active');
            document.getElementById('storyArea').classList.remove('active');
            document.getElementById('suggestionBtn').classList.add('active');
            document.getElementById('storyBtn').classList.remove('active');
            loadSuggestions();
        });

        document.getElementById('storyBtn').addEventListener('click', () => {
            document.getElementById('storyArea').classList.add('active');
            document.getElementById('suggestionsArea').classList.remove('active');
            document.getElementById('storyBtn').classList.add('active');
            document.getElementById('suggestionBtn').classList.remove('active');
        });

        // Big mic button
        document.getElementById('bigMicBtn').addEventListener('click', handleVoiceNew);

        // Small mic button
        document.getElementById('smallMicBtn').addEventListener('click', handleVoiceNew);

        // Story input - detect text changes
        const storyInput = document.getElementById('storyInput');
        storyInput.addEventListener('input', updateStoryInputState);
        storyInput.addEventListener('focus', () => {
            // Hide big mic overlay when user focuses to type
            const overlay = document.getElementById('bigMicOverlay');
            const exampleEl = document.getElementById('bigMicExample');
            if (storyInput.value.trim() === '') {
                overlay.style.opacity = '0.3';
            }
            // Hide example when focused
            if (exampleEl) {
                exampleEl.style.opacity = '0';
            }
            // Stop rotation when focused
            stopPlaceholderRotation();
        });
        storyInput.addEventListener('blur', () => {
            const overlay = document.getElementById('bigMicOverlay');
            const exampleEl = document.getElementById('bigMicExample');
            if (storyInput.value.trim() === '') {
                overlay.style.opacity = '1';
                // Show example again
                if (exampleEl) {
                    exampleEl.style.opacity = '1';
                }
                // Restart rotation if empty
                startPlaceholderRotation();
            }
        });

        // Generate button
        document.getElementById('generateBtn').addEventListener('click', handleGenerate);

        // Onboarding modal submit
        document.getElementById('onboardingSubmitBtn')?.addEventListener('click', handleOnboardingSubmit);

        // Neighborhoods tag input
        const neighborhoodsInput = document.getElementById('neighborhoodsInput');
        neighborhoodsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && neighborhoodsInput.value.trim()) {
                e.preventDefault();
                addNeighborhood(neighborhoodsInput.value.trim());
                neighborhoodsInput.value = '';
            }
        });
    }

    // ===== STORY INPUT STATE MANAGEMENT =====
    function updateStoryInputState() {
        const storyInput = document.getElementById('storyInput');
        const bigMicOverlay = document.getElementById('bigMicOverlay');
        const smallMicBtn = document.getElementById('smallMicBtn');
        const generateBtn = document.getElementById('generateBtn');

        const hasText = storyInput.value.trim().length > 0;

        if (hasText) {
            // État 3 — Text present
            bigMicOverlay.classList.add('hidden');
            smallMicBtn.classList.remove('hidden');
            generateBtn.disabled = false;
            stopPlaceholderRotation();
        } else {
            // État 1 — Empty
            bigMicOverlay.classList.remove('hidden');
            smallMicBtn.classList.add('hidden');
            generateBtn.disabled = true;
            startPlaceholderRotation();
        }
    }

    // ===== EXAMPLE ROTATION =====
    function setRandomExample() {
        const exampleEl = document.getElementById('bigMicExample');
        if (!exampleEl) return;

        const randomIndex = Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length);
        exampleEl.textContent = PLACEHOLDER_EXAMPLES[randomIndex];
        exampleEl.classList.remove('hidden');
    }

    function rotateExample() {
        const storyInput = document.getElementById('storyInput');
        const exampleEl = document.getElementById('bigMicExample');
        if (!storyInput || !exampleEl) return;

        // Only rotate if textarea is empty and doesn't have focus
        if (storyInput.value.trim() !== '' || document.activeElement === storyInput) {
            return;
        }

        // Fade out
        exampleEl.style.opacity = '0';

        setTimeout(() => {
            // Change example
            const randomIndex = Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length);
            exampleEl.textContent = PLACEHOLDER_EXAMPLES[randomIndex];

            // Fade in
            exampleEl.style.opacity = '1';
        }, 300);
    }

    function startPlaceholderRotation() {
        // Stop any existing rotation
        stopPlaceholderRotation();

        // Set initial random example
        setRandomExample();

        // Rotate every 5 seconds
        placeholderInterval = setInterval(rotateExample, 5000);
    }

    function stopPlaceholderRotation() {
        if (placeholderInterval) {
            clearInterval(placeholderInterval);
            placeholderInterval = null;
        }

        // Hide example
        const exampleEl = document.getElementById('bigMicExample');
        if (exampleEl) {
            exampleEl.classList.add('hidden');
        }
    }

    // ===== VOICE INPUT (NEW) =====
    async function handleVoiceNew() {
        const bigMicBtn = document.getElementById('bigMicBtn');
        const smallMicBtn = document.getElementById('smallMicBtn');
        const bigMicLabel = document.getElementById('bigMicLabel');
        const status = document.getElementById('voiceStatus');
        const storyInput = document.getElementById('storyInput');

        // Determine which button was clicked
        const isBigMic = event.target.closest('#bigMicBtn') !== null;
        const activeBtn = isBigMic ? bigMicBtn : smallMicBtn;

        if (!audioRecorder) {
            audioRecorder = new AudioRecorder({
                maxDuration: 120000,
                silenceTimeout: 5000,
                onStateChange: (state, message) => {
                    console.log('[Social] Voice state:', state, message);

                    if (state === 'recording') {
                        // État 2 — Recording
                        activeBtn.classList.add('recording');
                        if (isBigMic) {
                            bigMicLabel.textContent = '🔴 En écoute... Appuie pour arrêter';
                            bigMicLabel.classList.add('recording');
                        }
                        status.textContent = 'Enregistrement en cours...';
                    } else if (state === 'transcribing') {
                        activeBtn.classList.remove('recording');
                        if (isBigMic) {
                            bigMicLabel.textContent = 'Transcription...';
                            bigMicLabel.classList.remove('recording');
                        }
                        status.textContent = 'Transcription...';
                    } else if (state === 'done') {
                        activeBtn.classList.remove('recording');
                        if (isBigMic) {
                            bigMicLabel.textContent = 'Appuie pour dicter';
                            bigMicLabel.classList.remove('recording');
                        }
                        status.textContent = '';
                    } else if (state === 'error') {
                        activeBtn.classList.remove('recording');
                        if (isBigMic) {
                            bigMicLabel.textContent = 'Appuie pour dicter';
                            bigMicLabel.classList.remove('recording');
                        }
                        status.textContent = message || 'Erreur';
                        status.style.color = '#FF4757';
                        setTimeout(() => {
                            status.textContent = '';
                            status.style.color = 'var(--text-light)';
                        }, 3000);
                    } else {
                        activeBtn.classList.remove('recording');
                        if (isBigMic) {
                            bigMicLabel.textContent = 'Appuie pour dicter';
                            bigMicLabel.classList.remove('recording');
                        }
                        status.textContent = '';
                    }
                }
            });
        }

        try {
            // Get or reuse stream
            if (!audioStream) {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            const text = await audioRecorder.record(audioStream);

            if (text) {
                // If small mic (text already present), append. If big mic, replace.
                if (isBigMic) {
                    storyInput.value = text;
                } else {
                    storyInput.value += (storyInput.value ? ' ' : '') + text;
                }
                updateStoryInputState();
                console.log('[Social] Transcribed:', text);
            }
        } catch (err) {
            console.error('[Social] Voice error:', err);
        }
    }

    // ===== VOICE INPUT (OLD - kept for compatibility) =====
    async function handleVoice() {
        const btn = document.getElementById('voiceBtn');
        const btnText = document.getElementById('voiceBtnText');
        const status = document.getElementById('voiceStatus');

        if (!audioRecorder) {
            audioRecorder = new AudioRecorder({
                maxDuration: 120000,
                silenceTimeout: 5000,
                onStateChange: (state, message) => {
                    console.log('[Social] Voice state:', state, message);

                    if (state === 'recording') {
                        btn.classList.add('recording');
                        btnText.textContent = 'Arrêter';
                        status.textContent = 'Enregistrement en cours...';
                    } else if (state === 'transcribing') {
                        btn.classList.remove('recording');
                        btnText.textContent = 'Dicter';
                        status.textContent = 'Transcription...';
                    } else if (state === 'done') {
                        status.textContent = '';
                    } else if (state === 'error') {
                        btn.classList.remove('recording');
                        btnText.textContent = 'Dicter';
                        status.textContent = message || 'Erreur';
                        status.style.color = '#FF4757';
                        setTimeout(() => {
                            status.textContent = '';
                            status.style.color = 'var(--text-light)';
                        }, 3000);
                    } else {
                        btn.classList.remove('recording');
                        btnText.textContent = 'Dicter';
                        status.textContent = '';
                    }
                }
            });
        }

        try {
            // Get or reuse stream
            if (!audioStream) {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            const text = await audioRecorder.record(audioStream);

            if (text) {
                const textarea = document.getElementById('storyInput');
                textarea.value = text;
                console.log('[Social] Transcribed:', text);
            }
        } catch (err) {
            console.error('[Social] Voice error:', err);
        }
    }

    // ===== GENERATE POSTS =====
    async function handleGenerate() {
        const storyInput = document.getElementById('storyInput');
        const userInput = storyInput.value.trim();

        if (!userInput) {
            alert('Écris ou dicte ton histoire avant de générer les posts');
            return;
        }

        if (!currentProfile) {
            alert('Profil non configuré. Recharge la page.');
            return;
        }

        // Check if voice profile modal should be shown (first time only)
        const shouldShowVoiceModal = await checkAndShowVoiceModal();
        if (shouldShowVoiceModal) {
            // Modal is shown, generation will continue after voice profile is saved
            // Store user input for later
            window.pendingUserInput = userInput;
            return;
        }

        const platforms = currentProfile.platforms_active || [];
        if (platforms.length === 0) {
            alert('Aucune plateforme active dans ton profil');
            return;
        }

        const generateBtn = document.getElementById('generateBtn');
        generateBtn.disabled = true;
        generateBtn.textContent = '⏳ En cours...';

        try {
            // Generate posts for each platform
            currentResults = [];

            for (const platform of platforms) {
                console.log(`[Social] Generating post for ${platform}...`);

                const response = await fetch('/api/generate-social-post', {
                    method: 'POST',
                    headers: await getAuthHeaders(),
                    body: JSON.stringify({
                        mode: 'free_input',
                        platform,
                        user_input: userInput
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || `Erreur ${platform}`);
                }

                const result = await response.json();
                currentResults.push({
                    platform,
                    ...result
                });

                console.log(`[Social] Generated for ${platform}:`, result);
            }

            // Display results
            displayResults();

            // Reload history
            await loadHistory();

            // Clear input
            storyInput.value = '';
            updateStoryInputState();

        } catch (err) {
            console.error('[Social] Generate error:', err);
            alert('Erreur lors de la génération: ' + err.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '✨ Raconter ce moment';
        }
    }

    // ===== DISPLAY RESULTS =====
    function displayResults() {
        if (currentResults.length === 0) return;

        const resultsSection = document.getElementById('resultsSection');
        const platformTabs = document.getElementById('platformTabs');
        const platformsContent = document.getElementById('platformsContent');

        // Show section
        resultsSection.classList.add('active');

        // Render tabs
        let tabsHTML = '';
        for (let i = 0; i < currentResults.length; i++) {
            const result = currentResults[i];
            const icon = getPlatformIcon(result.platform);

            const platformName = {
                linkedin: 'LinkedIn',
                instagram: 'Instagram',
                facebook: 'Facebook',
                tiktok: 'TikTok'
            }[result.platform] || result.platform;

            tabsHTML += `
                <button class="platform-tab ${i === 0 ? 'active' : ''}" data-platform="${result.platform}">
                    ${icon} ${platformName}
                </button>
            `;
        }
        platformTabs.innerHTML = tabsHTML;

        // Render content
        let contentHTML = '';
        for (let i = 0; i < currentResults.length; i++) {
            const result = currentResults[i];
            const wordCount = result.word_count || result.content.split(/\s+/).length;
            const completeness = result.completeness || {
                hook_quality: true,
                local_anchor: true,
                terrain_proof: true,
                cta_present: true
            };

            // Sprint 3: Check Hoguet warning
            const complianceFlags = result.compliance_flags || {};
            const hoguetWarning = complianceFlags.hoguet === 'warn' && complianceFlags.hoguet_missing
                ? `<div class="hoguet-warning">
                    ⚠️ Ce post mentionne un bien. Pensez à ajouter : ${complianceFlags.hoguet_missing.join(', ')}
                </div>`
                : '';

            contentHTML += `
                <div class="platform-content ${i === 0 ? 'active' : ''}" data-platform="${result.platform}">
                    <div class="edit-hint">✏️ Ajoute ton grain de sel avant de partager 👆</div>
                    <textarea
                        class="post-textarea"
                        id="textarea-${result.platform}"
                        data-original="${escapeHtml(result.content)}"
                        data-platform="${result.platform}"
                    >${escapeHtml(result.content)}</textarea>

                    ${hoguetWarning}

                    <div class="completeness-indicator">
                        <div class="completeness-title">✅ Indicateur de complétude</div>
                        <div class="completeness-item ${completeness.hook_quality ? 'complete' : 'warning'}">
                            ${completeness.hook_quality ? '✅' : '⚠️'} Hook accrocheur
                        </div>
                        <div class="completeness-item ${completeness.local_anchor ? 'complete' : 'warning'}">
                            ${completeness.local_anchor ? '✅' : '⚠️'} Ancrage local
                        </div>
                        <div class="completeness-item ${completeness.terrain_proof ? 'complete' : 'warning'}">
                            ${completeness.terrain_proof ? '✅' : '⚠️'} Preuve terrain
                        </div>
                        <div class="completeness-item ${completeness.cta_present ? 'complete' : 'warning'}">
                            ${completeness.cta_present ? '✅' : '⚠️'} CTA adapté
                        </div>
                        <div class="completeness-item warning" id="touche-perso-${result.platform}">
                            ⚠️ Touche perso
                        </div>
                    </div>

                    <div class="visual-recommendation">
                        <div class="visual-recommendation-title">📸 Visuel recommandé</div>
                        <div class="visual-recommendation-text">${escapeHtml(result.visual_recommendation || 'Aucune recommandation visuelle')}</div>
                    </div>

                    <div class="post-actions">
                        <button class="action-btn primary" onclick="copyPost('${result.platform}')">
                            📋 Copier
                        </button>
                        <button class="action-btn" onclick="regeneratePost('${result.platform}')">
                            🔄 Régénérer
                        </button>
                        <button class="action-btn success" onclick="markPublished('${result.platform}')">
                            ✅ Marquer partagé
                        </button>
                    </div>

                    <div style="margin-top: 16px; font-size: 12px; color: var(--text-light); text-align: center;">
                        ${wordCount} mots • Hook: ${result.hook_pattern || 'N/A'}
                    </div>
                </div>
            `;
        }
        platformsContent.innerHTML = contentHTML;

        // Setup textarea edit listeners
        document.querySelectorAll('.post-textarea').forEach(textarea => {
            const originalContent = textarea.dataset.original;
            const platform = textarea.dataset.platform;

            textarea.addEventListener('input', () => {
                const touchePersoEl = document.getElementById(`touche-perso-${platform}`);
                const isEdited = textarea.value !== originalContent;

                if (isEdited) {
                    textarea.classList.add('edited');
                    touchePersoEl.innerHTML = '✅ Touche perso';
                    touchePersoEl.classList.remove('warning');
                    touchePersoEl.classList.add('complete');
                } else {
                    textarea.classList.remove('edited');
                    touchePersoEl.innerHTML = '⚠️ Touche perso';
                    touchePersoEl.classList.remove('complete');
                    touchePersoEl.classList.add('warning');
                }
            });
        });

        // Tab click handlers
        document.querySelectorAll('.platform-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const platform = tab.dataset.platform;

                // Update tabs
                document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update content
                document.querySelectorAll('.platform-content').forEach(c => c.classList.remove('active'));
                document.querySelector(`.platform-content[data-platform="${platform}"]`).classList.add('active');
            });
        });

        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ===== POST ACTIONS =====
    window.copyPost = async function(platform) {
        const result = currentResults.find(r => r.platform === platform);
        if (!result) return;

        try {
            // Get current textarea content
            const textarea = document.getElementById(`textarea-${platform}`);
            const currentContent = textarea ? textarea.value : result.content;
            const originalContent = textarea ? textarea.dataset.original : result.content;
            const isEdited = currentContent !== originalContent;

            // Copy to clipboard
            await navigator.clipboard.writeText(currentContent);

            // Visual feedback
            const btn = event.target.closest('.action-btn');
            const originalText = btn.innerHTML;
            const successMessage = isEdited
                ? '✅ Copié ! Tes modifs sont sauvegardées.'
                : '✅ Copié !';
            btn.innerHTML = successMessage;
            btn.style.background = '#43A047';
            btn.style.color = 'white';

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);

            // Update status in DB
            if (result.post_id) {
                await supabaseClient
                    .from('social_posts')
                    .update({
                        status: 'copied',
                        user_edited: isEdited,
                        content: currentContent // Update avec le contenu modifié
                    })
                    .eq('id', result.post_id);

                await loadHistory();
            }
        } catch (err) {
            console.error('[Social] Copy error:', err);
            alert('Erreur lors de la copie');
        }
    };

    window.regeneratePost = async function(platform) {
        const storyInput = document.getElementById('storyInput').value.trim();
        if (!storyInput && currentResults.length > 0) {
            // Use the last user input stored
            alert('Régénération non disponible. Crée un nouveau post avec un autre texte.');
            return;
        }

        alert('Régénération en cours... (fonctionnalité à améliorer)');
    };

    window.markPublished = async function(platform) {
        const result = currentResults.find(r => r.platform === platform);
        if (!result || !result.post_id) return;

        try {
            await supabaseClient
                .from('social_posts')
                .update({
                    status: 'published',
                    published_at: new Date().toISOString()
                })
                .eq('id', result.post_id);

            // Visual feedback
            const btn = event.target.closest('.action-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Partagé !';
            btn.style.background = '#43A047';
            btn.style.color = 'white';

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);

            await loadHistory();
        } catch (err) {
            console.error('[Social] Mark published error:', err);
            alert('Erreur lors de la mise à jour');
        }
    };

    // ===== HISTORY =====
    async function loadHistory() {
        try {
            const user = (await supabaseClient.auth.getUser()).data.user;

            // Get posts from current week (Monday to Sunday)
            const now = new Date();
            const monday = new Date(now);
            const day = now.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            monday.setDate(now.getDate() + diff);
            monday.setHours(0, 0, 0, 0);

            const { data, error } = await supabaseClient
                .from('social_posts')
                .select('*')
                .eq('user_id', user.id)
                .gte('generated_at', monday.toISOString())
                .order('generated_at', { ascending: false });

            if (error) throw error;

            renderHistory(data || []);
        } catch (err) {
            console.error('[Social] Load history error:', err);
        }
    }

    function renderHistory(posts) {
        const container = document.getElementById('historyList');

        if (posts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="img/lea-empty-state.svg" alt="Léa" class="empty-state-illustration">
                    <div class="empty-state-title">Aucune histoire partagée cette semaine</div>
                    <div class="empty-state-separator"></div>
                    <div class="empty-state-subtitle">Prête à créer du contenu ? Lance ta première publication !</div>
                    <button class="empty-state-cta" onclick="document.querySelector('.create-section').scrollIntoView({behavior: 'smooth', block: 'center'}); setTimeout(() => document.getElementById('suggestionBtn').click(), 500);">
                        + Créer une nouvelle story
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        for (const post of posts) {
            const date = new Date(post.generated_at);
            const dateStr = `${DAYS_SHORT[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;

            const icon = getPlatformIcon(post.platform);

            const platformName = {
                linkedin: 'LinkedIn',
                instagram: 'Instagram',
                facebook: 'Facebook',
                tiktok: 'TikTok'
            }[post.platform] || post.platform;

            const statusBadge = {
                draft: '<span class="status-badge draft">📝 Brouillon</span>',
                copied: '<span class="status-badge copied">📋 Copié</span>',
                published: '<span class="status-badge published">✅ Partagé</span>'
            }[post.status] || '<span class="status-badge draft">📝 Brouillon</span>';

            // Use hook if available, otherwise first line (max 50 chars)
            const hookText = post.hook || post.content.split('\n')[0];
            const preview = hookText.length > 50 ? hookText.substring(0, 50) + '…' : hookText;

            html += `
                <div class="history-item ${post.status}">
                    <div class="history-header">
                        <div class="history-date">${dateStr}</div>
                        <div class="history-platform-icon">${icon} ${platformName}</div>
                        ${statusBadge}
                    </div>
                    <div class="history-hook">${escapeHtml(preview)}</div>
                    <button class="history-reopen-btn" onclick="reopenPost('${post.id}')">📝 Réouvrir</button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    window.reopenPost = async function(postId) {
        try {
            const { data: post, error } = await supabaseClient
                .from('social_posts')
                .select('*')
                .eq('id', postId)
                .single();

            if (error || !post) {
                alert('Post non trouvé');
                return;
            }

            // Display in results area
            document.getElementById('resultsSection').style.display = 'block';
            displayResults([{
                platform: post.platform,
                content: post.content,
                hook: post.hook,
                visual_recommendation: post.visual_recommendation || 'Post texte pur.',
                completeness: post.completeness || { hook_quality: true, local_anchor: true, terrain_proof: true, cta_present: true },
                post_id: post.id
            }]);

            // Scroll to results
            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('[Social] Reopen post error:', err);
            alert('Erreur lors du chargement du post');
        }
    };

    // ===== ONBOARDING =====
    function showOnboarding() {
        document.getElementById('onboardingBackdrop').classList.add('active');
    }

    function hideOnboarding() {
        document.getElementById('onboardingBackdrop').classList.remove('active');
    }

    function addNeighborhood(value) {
        if (!value || neighborhoods.includes(value)) return;

        neighborhoods.push(value);

        const container = document.getElementById('neighborhoodsContainer');
        const input = document.getElementById('neighborhoodsInput');

        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            <span>${escapeHtml(value)}</span>
            <span class="tag-remove" onclick="removeNeighborhood('${value}')">×</span>
        `;

        container.insertBefore(tag, input);
    }

    window.removeNeighborhood = function(value) {
        neighborhoods = neighborhoods.filter(n => n !== value);

        const container = document.getElementById('neighborhoodsContainer');
        const tags = container.querySelectorAll('.tag');

        tags.forEach(tag => {
            if (tag.textContent.includes(value)) {
                tag.remove();
            }
        });
    };

    async function handleNextStep() {
        if (currentStep === 1) {
            // Validate step 1
            const network = document.getElementById('networkSelect').value;
            const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(cb => cb.value);

            if (neighborhoods.length === 0) {
                alert('Ajoute au moins un quartier');
                return;
            }

            if (!network) {
                alert('Sélectionne ton réseau');
                return;
            }

            if (platforms.length === 0) {
                alert('Sélectionne au moins une plateforme');
                return;
            }

            const objectives = Array.from(document.querySelectorAll('input[name="objective"]:checked')).map(cb => cb.value);
            if (objectives.length === 0 || objectives.length > 3) {
                alert('Sélectionne entre 1 et 3 objectifs');
                return;
            }

            // Go to step 2
            document.getElementById('step1').classList.remove('active');
            document.getElementById('step2').classList.add('active');
            document.querySelectorAll('.step-dot')[0].classList.remove('active');
            document.querySelectorAll('.step-dot')[1].classList.add('active');
            document.getElementById('prevBtn').style.display = 'block';
            currentStep = 2;

        } else if (currentStep === 2) {
            // Get tone
            const toneSlider = document.getElementById('toneSlider').value;
            let tone = 'mixte';
            if (toneSlider < 33) tone = 'professionnel';
            else if (toneSlider > 66) tone = 'decontracte';

            const tutoiement = document.querySelector('input[name="tutoiement"]:checked').value === 'true';
            const samplePosts = document.getElementById('samplePostsTextarea').value.trim();

            // Go to step 3
            document.getElementById('step2').classList.remove('active');
            document.getElementById('step3').classList.add('active');
            document.querySelectorAll('.step-dot')[1].classList.remove('active');
            document.querySelectorAll('.step-dot')[2].classList.add('active');
            document.getElementById('nextBtn').textContent = 'Terminer';
            currentStep = 3;

            // If sample posts, analyze them
            if (samplePosts) {
                document.getElementById('noAnalysis').style.display = 'none';
                document.getElementById('analysisResult').style.display = 'block';
                document.getElementById('analysisText').textContent = 'Analyse en cours...';

                // TODO: Call analyze endpoint
                setTimeout(() => {
                    document.getElementById('analysisText').textContent = `Ton style : ${tone} • Tutoiement : ${tutoiement ? 'oui' : 'non'} • L'IA a détecté un style direct et concret avec des anecdotes terrain.`;
                }, 1000);
            }

        } else if (currentStep === 3) {
            // Save profile
            const network = document.getElementById('networkSelect').value;
            const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(cb => cb.value);
            const rsac = document.getElementById('rsacInput').value.trim();

            const toneSlider = document.getElementById('toneSlider').value;
            let tone = 'mixte';
            if (toneSlider < 33) tone = 'professionnel';
            else if (toneSlider > 66) tone = 'decontracte';

            const tutoiement = document.querySelector('input[name="tutoiement"]:checked').value === 'true';
            const frequency = document.querySelector('input[name="frequency"]:checked').value;
            const samplePosts = document.getElementById('samplePostsTextarea').value.trim();
            const objectives = Array.from(document.querySelectorAll('input[name="objective"]:checked')).map(cb => cb.value);

            try {
                document.getElementById('nextBtn').disabled = true;
                document.getElementById('nextBtn').textContent = 'Sauvegarde...';

                await saveProfile({
                    neighborhoods,
                    network,
                    platforms_active: platforms,
                    publishing_frequency: frequency,
                    rsac_info: rsac || null,
                    tone,
                    tutoiement,
                    sample_posts: samplePosts ? [samplePosts] : null,
                    voice_profile: null,
                    objectives: objectives
                });

                hideOnboarding();
                renderCalendar();

                alert('Profil créé ! Tu peux maintenant raconter tes premières histoires.');
            } catch (err) {
                alert('Erreur lors de la sauvegarde: ' + err.message);
            } finally {
                document.getElementById('nextBtn').disabled = false;
                document.getElementById('nextBtn').textContent = 'Terminer';
            }
        }
    }

    function handlePrevStep() {
        if (currentStep === 2) {
            document.getElementById('step2').classList.remove('active');
            document.getElementById('step1').classList.add('active');
            document.querySelectorAll('.step-dot')[1].classList.remove('active');
            document.querySelectorAll('.step-dot')[0].classList.add('active');
            document.getElementById('prevBtn').style.display = 'none';
            currentStep = 1;
        } else if (currentStep === 3) {
            document.getElementById('step3').classList.remove('active');
            document.getElementById('step2').classList.add('active');
            document.querySelectorAll('.step-dot')[2].classList.remove('active');
            document.querySelectorAll('.step-dot')[1].classList.add('active');
            document.getElementById('nextBtn').textContent = 'Suivant';
            currentStep = 2;
        }
    }

    // ===== UTILS =====
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getPlatformIcon(platform) {
        const icons = {
            linkedin: '<i class="fab fa-linkedin" style="color: #0077B5"></i>',
            instagram: '<i class="fab fa-instagram" style="color: #E4405F"></i>',
            facebook: '<i class="fab fa-facebook" style="color: #1877F2"></i>',
            tiktok: '<i class="fab fa-tiktok" style="color: #000000"></i>'
        };
        return icons[platform] || '';
    }

    // ===== START =====
    init();

    // ===== EXPOSE MODAL FUNCTIONS TO GLOBAL SCOPE =====
    window.openStrategyModal = openStrategyModal;
    window.closeStrategyModal = closeStrategyModal;
    window.applyStrategy = applyStrategy;
    window.saveVoiceProfile = saveVoiceProfile;
    window.checkAndShowVoiceModal = checkAndShowVoiceModal;

    // ===== STRATEGY MODAL =====
    function openStrategyModal() {
        console.log('[Social] Opening strategy modal, currentProfile:', currentProfile);

        // Pre-fill current values (use defaults if no profile yet)
        const objectives = currentProfile?.objectives || ['mandats_vendeurs', 'notoriete'];
        document.querySelectorAll('input[name="strategy_objective"]').forEach(cb => {
            cb.checked = objectives.includes(cb.value);
        });

        const timeAvailable = currentProfile?.time_available || '1h';
        const timeRadio = document.querySelector(`input[name="time_available"][value="${timeAvailable}"]`);
        if (timeRadio) timeRadio.checked = true;

        const platforms = currentProfile?.platforms_active || ['linkedin', 'instagram', 'facebook'];
        document.querySelectorAll('input[name="strategy_platform"]').forEach(cb => {
            cb.checked = platforms.includes(cb.value);
        });

        const contentStyle = currentProfile?.content_style || ['balanced'];
        document.querySelectorAll('input[name="content_style"]').forEach(cb => {
            cb.checked = contentStyle.includes(cb.value);
        });

        document.getElementById('strategyBackdrop').classList.add('active');
    }

    function closeStrategyModal() {
        document.getElementById('strategyBackdrop').classList.remove('active');
    }

    async function applyStrategy() {
        const objectives = Array.from(document.querySelectorAll('input[name="strategy_objective"]:checked')).map(cb => cb.value);
        if (objectives.length === 0 || objectives.length > 3) {
            alert('Sélectionne entre 1 et 3 objectifs');
            return;
        }

        const timeAvailable = document.querySelector('input[name="time_available"]:checked')?.value;
        if (!timeAvailable) {
            alert('Sélectionne ton temps disponible');
            return;
        }

        const platforms = Array.from(document.querySelectorAll('input[name="strategy_platform"]:checked')).map(cb => cb.value);
        if (platforms.length === 0) {
            alert('Sélectionne au moins une plateforme');
            return;
        }

        const contentStyle = Array.from(document.querySelectorAll('input[name="content_style"]:checked')).map(cb => cb.value);
        if (contentStyle.length === 0) {
            alert('Sélectionne au moins un style de contenu');
            return;
        }

        // Map time_available to publishing_frequency
        const frequencyMap = {
            '30min': 'light',
            '1h': 'regular',
            '2h+': 'intensive',
            'mix': 'regular'
        };

        try {
            const user = (await supabaseClient.auth.getUser()).data.user;
            const isInFullscreen = document.getElementById('strategyBackdrop').classList.contains('fullscreen-mode');

            // MODIFICATION : Compléter le profil existant (pas créer un nouveau)
            const { data, error } = await supabaseClient
                .from('social_profiles')
                .update({
                    objectives,
                    platforms_active: platforms,
                    time_available: timeAvailable,
                    publishing_frequency: frequencyMap[timeAvailable],
                    content_style: contentStyle,
                    calendar_seen: false,  // Pas encore confirmé le calendrier
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;

            currentProfile = data;
            console.log('[Social] Profile completed with strategy:', data);

            if (isInFullscreen) {
                // Coming from onboarding flow: show calendar confirmation
                showCalendarConfirmation();
            } else {
                // Regular update: just close modal and refresh
                closeStrategyModal();
                renderCalendar();
                alert('✅ Stratégie mise à jour !');
            }
        } catch (err) {
            console.error('[Social] Error in applyStrategy:', err);
            alert('Erreur lors de la sauvegarde de ta stratégie. Merci de réessayer.');
        }
    }

    // ===== CALENDAR CONFIRMATION =====
    function showCalendarConfirmation() {
        // Hide strategy modal
        document.getElementById('strategyBackdrop').classList.remove('active', 'fullscreen-mode');

        // Show confirmation page
        document.getElementById('calendarConfirmation').classList.remove('hidden');

        // Render week calendar preview
        renderWeekCalendarPreview();

        // Render today's template
        renderTodayTemplate();
    }

    function renderWeekCalendarPreview() {
        if (!currentProfile) return;

        const container = document.getElementById('weekCalendarPreview');
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday
        const frequency = currentProfile.publishing_frequency || 'regular';
        const activeDays = getActiveDaysForFrequency(frequency);

        let html = '';
        const daysLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
        const daysNames = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

        for (let i = 0; i < 5; i++) {
            const dayName = daysNames[i];
            const isToday = dayOfWeek === i + 1; // Monday = 1
            const isActive = activeDays.includes(dayName);

            if (!isActive) continue;

            // Get date
            const dayDate = new Date(today);
            dayDate.setDate(today.getDate() + (i + 1 - dayOfWeek));
            const dateStr = `${daysLabels[i]} ${dayDate.getDate()}/${dayDate.getMonth() + 1}`;

            // Get templates for this day
            const templates = CALENDAR[dayName] || {};
            const platforms = currentProfile.platforms_active || [];

            let templatesHtml = '';
            for (const platform of platforms) {
                if (templates[platform]) {
                    const icon = getPlatformIcon(platform);
                    templatesHtml += `<div class="preview-template-item"><span>${icon}</span><span>${templates[platform]}</span></div>`;
                }
            }

            html += `
                <div class="preview-day ${isToday ? 'today' : ''}">
                    <div class="preview-day-header">${dateStr}</div>
                    <div class="preview-templates">${templatesHtml || '<span style="color:#9ca3af">Aucun post</span>'}</div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function renderTodayTemplate() {
        if (!currentProfile) return;

        const today = DAYS_FR[new Date().getDay()];
        const templates = CALENDAR[today] || {};
        const platforms = currentProfile.platforms_active || [];
        const firstPlatform = platforms[0];

        if (!firstPlatform || !templates[firstPlatform]) {
            document.getElementById('todayMain').innerHTML = '<span style="color:#9ca3af">Aucun post prévu aujourd\'hui</span>';
            return;
        }

        const templateName = templates[firstPlatform];
        const icon = getPlatformIcon(firstPlatform);
        const platformName = firstPlatform.charAt(0).toUpperCase() + firstPlatform.slice(1);

        document.getElementById('todayMain').innerHTML = `
            ${templateName} sur ${icon} <span style="font-weight:800">${platformName}</span>
        `;
    }

    function getTemplateEmoji(templateName) {
        const emojiMap = {
            'Analyse marché': '📊',
            'Carrousel éducatif': '📋',
            'Stat marché': '📊',
            'Visite minute': '🏠',
            'Reel quartier': '📍',
            'Coup de cœur local': '📍',
            'Conseil express': '💬',
            'Étude de cas': '🏠',
            'Carrousel listing': '🏠',
            'Nouveau mandat': '📋',
            'Anecdote terrain': '💬',
            'Reel conseil': '📋',
            'Quiz / Vrai-Faux': '💬',
            'Quartier spotlight': '📍',
            'Avis à contre-pied': '💬',
            'Post vendu': '🔑',
            'Remise de clés': '🔑',
            'Humour / coulisses': '👥'
        };
        return emojiMap[templateName] || '📋';
    }

    window.confirmCalendarAndGenerate = async function() {
        try {
            // Mark calendar as seen
            await saveProfile({
                ...currentProfile,
                calendar_seen: true
            });

            // Hide confirmation page
            document.getElementById('calendarConfirmation').classList.add('hidden');

            // Show main interface
            showMainInterface();
            renderCalendar();

            // TODO: Auto-generate today's post
            // For now, just show a success message
            alert('✅ Calendrier confirmé ! Tu peux maintenant générer tes posts.');
        } catch (err) {
            console.error('[Social] Error confirming calendar:', err);
            alert('Erreur lors de la confirmation: ' + err.message);
        }
    };

    // ===== VOICE PROFILE MODAL =====
    // Close voice modal when clicking on backdrop (outside modal)
    document.getElementById('voiceBackdrop').addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });

    async function checkAndShowVoiceModal() {
        if (!currentProfile) return false;

        // Only show if voice_profile_set is false
        if (currentProfile.voice_profile_set) return false;

        // Pre-fill with existing data if available
        if (currentProfile.tone) {
            const toneValue = currentProfile.tone === 'professionnel' ? 15
                : currentProfile.tone === 'decontracte' ? 85 : 50;
            document.getElementById('voiceToneSlider').value = toneValue;
        }
        if (currentProfile.tutoiement !== undefined && currentProfile.tutoiement !== null) {
            const radio = document.querySelector(`input[name="voice_tutoiement"][value="${currentProfile.tutoiement}"]`);
            if (radio) radio.checked = true;
        }
        if (currentProfile.sample_posts) {
            const posts = Array.isArray(currentProfile.sample_posts)
                ? currentProfile.sample_posts.join('\n\n---\n\n')
                : currentProfile.sample_posts;
            document.getElementById('voiceSamplePosts').value = posts;
        }

        document.getElementById('voiceBackdrop').classList.add('active');
        return true; // Modal shown, pause generation
    }

    async function saveVoiceProfile() {
        const toneSlider = document.getElementById('voiceToneSlider').value;
        let tone = 'mixte';
        if (toneSlider < 33) tone = 'professionnel';
        else if (toneSlider > 66) tone = 'decontracte';

        const tutoiement = document.querySelector('input[name="voice_tutoiement"]:checked').value === 'true';
        const samplePosts = document.getElementById('voiceSamplePosts').value.trim();

        try {
            await saveProfile({
                ...currentProfile,
                tone,
                tutoiement,
                sample_posts: samplePosts ? [samplePosts] : null,
                voice_profile_set: true
            });

            document.getElementById('voiceBackdrop').classList.remove('active');

            // If there was a pending generation, continue it
            if (window.pendingSuggestion) {
                const suggestion = window.pendingSuggestion;
                window.pendingSuggestion = null;

                setTimeout(() => {
                    generateFromSuggestion(suggestion, null);
                }, 300);
            } else if (window.pendingUserInput) {
                const userInput = window.pendingUserInput;
                window.pendingUserInput = null;

                // Wait a bit for the modal to close
                setTimeout(() => {
                    document.getElementById('generateBtn').click();
                }, 300);
            }

            return true;
        } catch (err) {
            alert('Erreur lors de la sauvegarde: ' + err.message);
            return false;
        }
    }
})();
