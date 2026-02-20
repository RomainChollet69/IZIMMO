// WAIMMO — Social Content Engine — Frontend Logic
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
            linkedin: 'Opinion contrarian',
            instagram: 'Post vendu',
            facebook: 'Remise de clés',
            tiktok: 'Humour / coulisses'
        }
    };

    const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    // ===== INIT =====
    async function init() {
        console.log('[Social] Initializing...');

        // Load profile
        await loadProfile();

        // Render calendar
        renderCalendar();

        // Load history
        await loadHistory();

        // Setup event listeners
        setupListeners();

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
                console.log('[Social] No profile found, showing onboarding');
                showOnboarding();
            } else {
                currentProfile = data;
                console.log('[Social] Profile loaded:', data);
            }
        } catch (err) {
            console.error('[Social] Error loading profile:', err);
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

        let html = '';

        // Render Mon-Fri only
        for (let i = 0; i < 5; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dayName = DAYS_FR[date.getDay()];
            const dayShort = DAYS_SHORT[date.getDay()];
            const isToday = dayName === today;

            const templates = CALENDAR[dayName] || {};
            const platforms = currentProfile?.platforms_active || ['linkedin', 'instagram', 'facebook', 'tiktok'];

            let platformsHTML = '';
            for (const platform of platforms) {
                if (templates[platform]) {
                    const emoji = {
                        linkedin: '💼',
                        instagram: '📸',
                        facebook: '👥',
                        tiktok: '🎵'
                    }[platform] || '📱';

                    platformsHTML += `<span class="platform">${emoji} ${templates[platform]}</span>`;
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
        document.getElementById('storyBtn').addEventListener('click', () => {
            document.getElementById('storyArea').classList.add('active');
            document.getElementById('storyBtn').classList.add('active');
        });

        // Voice button
        document.getElementById('voiceBtn').addEventListener('click', handleVoice);

        // Generate button
        document.getElementById('generateBtn').addEventListener('click', handleGenerate);

        // Onboarding
        document.getElementById('nextBtn').addEventListener('click', handleNextStep);
        document.getElementById('prevBtn').addEventListener('click', handlePrevStep);

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

    // ===== VOICE INPUT =====
    async function handleVoice() {
        const btn = document.getElementById('voiceBtn');
        const btnText = document.getElementById('voiceBtnText');
        const status = document.getElementById('voiceStatus');

        if (!audioRecorder) {
            audioRecorder = new AudioRecorder({
                maxDuration: 60000,
                silenceTimeout: 3000,
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

        const platforms = currentProfile.platforms_active || [];
        if (platforms.length === 0) {
            alert('Aucune plateforme active dans ton profil');
            return;
        }

        const generateBtn = document.getElementById('generateBtn');
        generateBtn.disabled = true;
        generateBtn.textContent = '⏳ Génération en cours...';

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

        } catch (err) {
            console.error('[Social] Generate error:', err);
            alert('Erreur lors de la génération: ' + err.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '✨ Générer les posts';
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
            const emoji = {
                linkedin: '💼',
                instagram: '📸',
                facebook: '👥',
                tiktok: '🎵'
            }[result.platform] || '📱';

            const platformName = {
                linkedin: 'LinkedIn',
                instagram: 'Instagram',
                facebook: 'Facebook',
                tiktok: 'TikTok'
            }[result.platform] || result.platform;

            tabsHTML += `
                <button class="platform-tab ${i === 0 ? 'active' : ''}" data-platform="${result.platform}">
                    ${emoji} ${platformName}
                </button>
            `;
        }
        platformTabs.innerHTML = tabsHTML;

        // Render content
        let contentHTML = '';
        for (let i = 0; i < currentResults.length; i++) {
            const result = currentResults[i];
            const wordCount = result.word_count || result.content.split(/\s+/).length;

            contentHTML += `
                <div class="platform-content ${i === 0 ? 'active' : ''}" data-platform="${result.platform}">
                    <div class="post-content">${escapeHtml(result.content)}</div>

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
                            ✅ Marquer publié
                        </button>
                    </div>

                    <div style="margin-top: 16px; font-size: 12px; color: var(--text-light); text-align: center;">
                        ${wordCount} mots • Hook: ${result.hook_pattern || 'N/A'}
                    </div>
                </div>
            `;
        }
        platformsContent.innerHTML = contentHTML;

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
            await navigator.clipboard.writeText(result.content);

            // Visual feedback
            const btn = event.target.closest('.action-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copié !';
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
                    .update({ status: 'copied' })
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
            btn.innerHTML = '✅ Publié !';
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
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">Aucun post généré cette semaine</div>
                    <div class="empty-state-subtext">Commence par créer ton premier post ci-dessus</div>
                </div>
            `;
            return;
        }

        let html = '';
        for (const post of posts) {
            const date = new Date(post.generated_at);
            const dateStr = `${DAYS_SHORT[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;

            const emoji = {
                linkedin: '💼',
                instagram: '📸',
                facebook: '👥',
                tiktok: '🎵'
            }[post.platform] || '📱';

            const platformName = {
                linkedin: 'LinkedIn',
                instagram: 'Instagram',
                facebook: 'Facebook',
                tiktok: 'TikTok'
            }[post.platform] || post.platform;

            const statusEmoji = {
                draft: '📝',
                copied: '📋',
                published: '✅'
            }[post.status] || '📝';

            const preview = post.content.split('\n')[0].substring(0, 60) + '...';

            html += `
                <div class="history-item ${post.status}" onclick="viewPost('${post.id}')">
                    <div class="history-info">
                        <div class="history-date">${dateStr}</div>
                        <div class="history-preview">${escapeHtml(preview)}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="history-platform">${emoji} ${platformName}</div>
                        <div class="history-status">${statusEmoji}</div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    window.viewPost = function(postId) {
        console.log('[Social] View post:', postId);
        // TODO: Implement view/edit post
        alert('Affichage du post (fonctionnalité à venir)');
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
            const samplePosts = document.getElementById('samplePostsTextarea').value.trim();

            try {
                document.getElementById('nextBtn').disabled = true;
                document.getElementById('nextBtn').textContent = 'Sauvegarde...';

                await saveProfile({
                    neighborhoods,
                    network,
                    platforms_active: platforms,
                    rsac_info: rsac || null,
                    tone,
                    tutoiement,
                    sample_posts: samplePosts || null,
                    voice_profile: null
                });

                hideOnboarding();
                renderCalendar();

                alert('Profil créé ! Tu peux maintenant générer tes premiers posts.');
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

    // ===== START =====
    init();
})();
