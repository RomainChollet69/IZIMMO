// WAIMMO — Widget Todo List avec dictée vocale
(function () {
    'use strict';

    // ===== STYLES =====
    const style = document.createElement('style');
    style.textContent = `
        /* Bouton flottant */
        .todo-fab {
            position: fixed;
            bottom: 28px;
            right: 28px;
            height: 48px;
            padding: 0 18px;
            border-radius: 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
            z-index: 9990;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .todo-fab-icon { font-size: 20px; line-height: 1; }
        .todo-fab:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 24px rgba(102, 126, 234, 0.55);
        }
        .todo-fab.has-tasks::after {
            content: attr(data-count);
            position: absolute;
            top: -6px;
            right: -6px;
            background: #FF4757;
            color: white;
            font-size: 11px;
            font-weight: 700;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
        }

        /* Overlay */
        .todo-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 9991;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s, visibility 0.3s;
        }
        .todo-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        /* Panneau coulissant */
        .todo-panel {
            position: fixed;
            top: 0;
            right: -400px;
            width: 380px;
            max-width: 90vw;
            height: 100vh;
            background: white;
            z-index: 9992;
            box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .todo-panel.active {
            right: 0;
        }

        /* Header du panneau */
        .todo-panel-header {
            padding: 20px 20px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        .todo-panel-header h3 {
            font-family: 'Barlow Semi Condensed', sans-serif;
            font-weight: 800;
            font-size: 20px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .todo-close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .todo-close-btn:hover {
            background: rgba(255, 255, 255, 0.35);
        }

        /* Zone de saisie */
        .todo-input-area {
            padding: 16px 20px;
            border-bottom: 1px solid #E1E8ED;
            flex-shrink: 0;
        }
        .todo-input-row {
            display: flex;
            gap: 8px;
        }
        .todo-text-input {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid #E1E8ED;
            border-radius: 10px;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            color: #2C3E50;
            outline: none;
            transition: border-color 0.2s;
        }
        .todo-text-input:focus {
            border-color: #667eea;
        }
        .todo-text-input::placeholder {
            color: #B0BEC5;
        }
        .todo-add-btn {
            padding: 10px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
            transition: opacity 0.2s;
            flex-shrink: 0;
        }
        .todo-add-btn:hover {
            opacity: 0.9;
        }
        .todo-voice-btn {
            padding: 10px 14px;
            background: #f0f2f5;
            border: 1px solid #E1E8ED;
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
            transition: background 0.2s, border-color 0.2s;
            flex-shrink: 0;
        }
        .todo-voice-btn:hover {
            background: #e8eaf6;
        }
        .todo-voice-btn.recording {
            background: #FFEBEE;
            border-color: #FF4757;
            animation: todoPulse 1.2s infinite;
        }
        .todo-voice-btn.unavailable {
            opacity: 0.35;
            cursor: not-allowed;
        }
        @keyframes todoPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(255, 71, 87, 0); }
        }
        .todo-voice-status {
            font-size: 12px;
            color: #FF4757;
            margin-top: 6px;
            font-weight: 500;
            display: none;
        }
        .todo-voice-status.active {
            display: block;
        }

        /* Liste des tâches */
        .todo-list {
            flex: 1;
            overflow-y: auto;
            padding: 12px 20px;
        }
        .todo-list::-webkit-scrollbar { width: 4px; }
        .todo-list::-webkit-scrollbar-thumb { background: #CFD8DC; border-radius: 4px; }

        .todo-empty {
            text-align: center;
            padding: 40px 20px;
            color: #B0BEC5;
        }
        .todo-empty-icon {
            font-size: 40px;
            margin-bottom: 12px;
        }
        .todo-empty-text {
            font-size: 14px;
        }

        .todo-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 0;
            border-bottom: 1px solid #f0f2f5;
            animation: todoSlideIn 0.3s ease;
        }
        @keyframes todoSlideIn {
            from { opacity: 0; transform: translateX(20px); }
            to { opacity: 1; transform: translateX(0); }
        }
        .todo-item.done {
            opacity: 0.5;
        }
        .todo-item.done .todo-item-text {
            text-decoration: line-through;
            color: #B0BEC5;
        }
        .todo-checkbox {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 2px solid #CFD8DC;
            cursor: pointer;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            background: white;
        }
        .todo-checkbox:hover {
            border-color: #667eea;
        }
        .todo-item.done .todo-checkbox {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-color: transparent;
        }
        .todo-item.done .todo-checkbox::after {
            content: '✓';
            color: white;
            font-size: 13px;
            font-weight: 700;
        }
        .todo-item-text {
            flex: 1;
            font-size: 14px;
            color: #2C3E50;
            line-height: 1.4;
            word-break: break-word;
        }
        .todo-delete-btn {
            background: none;
            border: none;
            color: #CFD8DC;
            font-size: 16px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: color 0.2s;
            flex-shrink: 0;
        }
        .todo-delete-btn:hover {
            color: #FF4757;
        }

        /* Compteur en bas */
        .todo-footer {
            padding: 12px 20px;
            border-top: 1px solid #E1E8ED;
            font-size: 12px;
            color: #7F8C8D;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .todo-clear-done {
            background: none;
            border: none;
            color: #667eea;
            font-size: 12px;
            cursor: pointer;
            font-weight: 600;
        }
        .todo-clear-done:hover {
            text-decoration: underline;
        }

        /* Mobile */
        @media (max-width: 768px) {
            .todo-fab {
                bottom: 20px;
                right: 20px;
                height: 44px;
                padding: 0 14px;
                font-size: 13px;
            }
            .todo-panel {
                width: 100vw;
                max-width: 100vw;
                right: -100vw;
            }
        }
    `;
    document.head.appendChild(style);

    // ===== HTML =====
    const fab = document.createElement('button');
    fab.className = 'todo-fab';
    fab.innerHTML = '<span class="todo-fab-icon">✅</span> To Do List';
    fab.title = 'Todo List';
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.className = 'todo-overlay';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.className = 'todo-panel';

    panel.innerHTML = `
        <div class="todo-panel-header">
            <h3>Ma Todo List</h3>
            <button class="todo-close-btn">✕</button>
        </div>
        <div class="todo-input-area">
            <div class="todo-input-row">
                <input type="text" class="todo-text-input" placeholder="Ajouter une tâche…">
                <button class="todo-voice-btn ${hasSpeechRecognition ? '' : 'unavailable'}" title="Dictée vocale">🎙️</button>
                <button class="todo-add-btn">+</button>
            </div>
            <div class="todo-voice-status">🔴 Écoute en cours…</div>
        </div>
        <div class="todo-list"></div>
        <div class="todo-footer">
            <span class="todo-counter"></span>
            <button class="todo-clear-done">Supprimer terminées</button>
        </div>
    `;
    document.body.appendChild(panel);

    // ===== REFS =====
    const closeBtn = panel.querySelector('.todo-close-btn');
    const textInput = panel.querySelector('.todo-text-input');
    const addBtn = panel.querySelector('.todo-add-btn');
    const voiceBtn = panel.querySelector('.todo-voice-btn');
    const voiceStatus = panel.querySelector('.todo-voice-status');
    const listEl = panel.querySelector('.todo-list');
    const counterEl = panel.querySelector('.todo-counter');
    const clearDoneBtn = panel.querySelector('.todo-clear-done');

    let todos = [];
    let isOpen = false;
    let recognition = null;
    let isRecording = false;

    // ===== OUVRIR / FERMER =====
    function openPanel() {
        isOpen = true;
        panel.classList.add('active');
        overlay.classList.add('active');
        loadTodos();
    }

    function closePanel() {
        isOpen = false;
        panel.classList.remove('active');
        overlay.classList.remove('active');
        stopRecording();
    }

    fab.addEventListener('click', () => {
        if (isOpen) closePanel();
        else openPanel();
    });
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);

    // ===== SUPABASE CRUD =====
    async function getUserId() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session ? session.user.id : null;
    }

    async function loadTodos() {
        const userId = await getUserId();
        if (!userId) return;

        const { data, error } = await supabaseClient
            .from('todos')
            .select('*')
            .eq('user_id', userId)
            .order('done', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) { console.error('Todo load error:', error); return; }
        todos = data || [];
        renderTodos();
    }

    async function addTodo(text) {
        const trimmed = text.trim();
        if (!trimmed) return;

        const userId = await getUserId();
        if (!userId) return;

        const { data, error } = await supabaseClient
            .from('todos')
            .insert({ user_id: userId, text: trimmed, done: false })
            .select()
            .single();

        if (error) { console.error('Todo insert error:', error); return; }
        todos.unshift(data);
        renderTodos();
    }

    async function toggleTodo(id, done) {
        const { error } = await supabaseClient
            .from('todos')
            .update({ done })
            .eq('id', id);

        if (error) { console.error('Todo update error:', error); return; }

        const todo = todos.find(t => t.id === id);
        if (todo) todo.done = done;
        // Re-sort: pending first (newest first), done last (newest first)
        todos.sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return new Date(b.created_at) - new Date(a.created_at);
        });
        renderTodos();
    }

    async function deleteTodo(id) {
        const { error } = await supabaseClient
            .from('todos')
            .delete()
            .eq('id', id);

        if (error) { console.error('Todo delete error:', error); return; }
        todos = todos.filter(t => t.id !== id);
        renderTodos();
    }

    async function clearDoneTodos() {
        const userId = await getUserId();
        if (!userId) return;

        const doneIds = todos.filter(t => t.done).map(t => t.id);
        if (doneIds.length === 0) return;

        const { error } = await supabaseClient
            .from('todos')
            .delete()
            .in('id', doneIds);

        if (error) { console.error('Todo clear error:', error); return; }
        todos = todos.filter(t => !t.done);
        renderTodos();
    }

    // ===== RENDU =====
    function renderTodos() {
        const pending = todos.filter(t => !t.done).length;

        // Badge sur le FAB
        if (pending > 0) {
            fab.classList.add('has-tasks');
            fab.setAttribute('data-count', pending > 99 ? '99+' : pending);
        } else {
            fab.classList.remove('has-tasks');
        }

        // Compteur footer
        counterEl.textContent = `${pending} tâche${pending > 1 ? 's' : ''} en cours`;
        clearDoneBtn.style.display = todos.some(t => t.done) ? '' : 'none';

        // Liste
        if (todos.length === 0) {
            listEl.innerHTML = `
                <div class="todo-empty">
                    <div class="todo-empty-icon">📝</div>
                    <div class="todo-empty-text">Aucune tâche pour l'instant.<br>Ajoutez-en une !</div>
                </div>`;
            return;
        }

        listEl.innerHTML = todos.map(t => `
            <div class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}">
                <div class="todo-checkbox" data-action="toggle"></div>
                <span class="todo-item-text">${escapeHtml(t.text)}</span>
                <button class="todo-delete-btn" data-action="delete" title="Supprimer">🗑️</button>
            </div>
        `).join('');

        // Event delegation
        listEl.querySelectorAll('[data-action="toggle"]').forEach(el => {
            el.addEventListener('click', () => {
                const item = el.closest('.todo-item');
                const id = item.dataset.id;
                const todo = todos.find(t => t.id === id);
                if (todo) toggleTodo(id, !todo.done);
            });
        });

        listEl.querySelectorAll('[data-action="delete"]').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.closest('.todo-item').dataset.id;
                deleteTodo(id);
            });
        });
    }

    // ===== AJOUT PAR TEXTE =====
    function handleAddFromInput() {
        const text = textInput.value.trim();
        if (!text) return;
        addTodo(text);
        textInput.value = '';
        textInput.focus();
    }

    addBtn.addEventListener('click', handleAddFromInput);
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddFromInput();
    });

    // ===== DICTÉE VOCALE =====
    function startRecording() {
        if (!hasSpeechRecognition || isRecording) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceStatus.classList.add('active');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            processVoiceInput(transcript);
        };

        recognition.onerror = (event) => {
            console.warn('Speech error:', event.error);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
        };

        recognition.start();
    }

    function stopRecording() {
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceStatus.classList.remove('active');
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* already stopped */ }
            recognition = null;
        }
    }

    function processVoiceInput(transcript) {
        // Séparer par des mots clés : virgule, "et", "ensuite", "aussi", "puis"
        const separators = /\s*(?:,|\bet\b|\bensuite\b|\baussi\b|\bpuis\b)\s*/gi;
        const tasks = transcript.split(separators).map(t => t.trim()).filter(t => t.length > 0);

        if (tasks.length === 0) return;

        // Capitaliser la première lettre de chaque tâche
        tasks.forEach(task => {
            const capitalized = task.charAt(0).toUpperCase() + task.slice(1);
            addTodo(capitalized);
        });
    }

    voiceBtn.addEventListener('click', () => {
        if (!hasSpeechRecognition) {
            showSpeechFallbackPopup();
            return;
        }
        if (isRecording) stopRecording();
        else startRecording();
    });

    // ===== CLEAR DONE =====
    clearDoneBtn.addEventListener('click', clearDoneTodos);

    // ===== RACCOURCI CLAVIER =====
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closePanel();
    });

    // ===== CHARGER LE BADGE AU DÉMARRAGE =====
    async function initBadge() {
        const userId = await getUserId();
        if (!userId) return;

        const { data } = await supabaseClient
            .from('todos')
            .select('id', { count: 'exact' })
            .eq('user_id', userId)
            .eq('done', false);

        const count = data ? data.length : 0;
        if (count > 0) {
            fab.classList.add('has-tasks');
            fab.setAttribute('data-count', count > 99 ? '99+' : count);
        }
    }

    // Attendre que l'auth soit prête
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) initBadge();
    });

    // Au cas où la session est déjà active
    initBadge();
})();
