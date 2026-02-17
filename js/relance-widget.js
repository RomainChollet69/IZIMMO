// WAIMMO — Widget Panneau Relances (vendeurs + acquéreurs)
(function () {
    'use strict';

    // ===== STYLES =====
    const style = document.createElement('style');
    style.textContent = `
        /* Overlay */
        .relance-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 9993;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s, visibility 0.3s;
        }
        .relance-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        /* Panneau coulissant */
        .relance-panel {
            position: fixed;
            top: 0;
            right: -420px;
            width: 400px;
            max-width: 92vw;
            height: 100vh;
            background: white;
            z-index: 9994;
            box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .relance-panel.active {
            right: 0;
        }

        /* Header */
        .relance-header {
            padding: 20px 20px 16px;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
        }
        .relance-header-left h3 {
            font-family: 'Barlow Semi Condensed', sans-serif;
            font-weight: 800;
            font-size: 20px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
        }
        .relance-header-left .relance-subtitle {
            font-size: 13px;
            opacity: 0.85;
            margin-top: 2px;
        }
        .relance-close-btn {
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
            flex-shrink: 0;
        }
        .relance-close-btn:hover {
            background: rgba(255, 255, 255, 0.35);
        }

        /* Filtres */
        .relance-filters {
            display: flex;
            gap: 6px;
            padding: 12px 20px;
            border-bottom: 1px solid #E1E8ED;
            flex-shrink: 0;
            overflow-x: auto;
        }
        .relance-filter-btn {
            padding: 6px 12px;
            border-radius: 20px;
            border: 1px solid #E1E8ED;
            background: white;
            font-family: 'Inter', sans-serif;
            font-size: 12px;
            font-weight: 600;
            color: #7F8C8D;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
        }
        .relance-filter-btn:hover { border-color: #ff6b6b; color: #ff6b6b; }
        .relance-filter-btn.active {
            background: #ff6b6b;
            color: white;
            border-color: #ff6b6b;
        }

        /* Liste */
        .relance-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px 20px;
        }
        .relance-list::-webkit-scrollbar { width: 4px; }
        .relance-list::-webkit-scrollbar-thumb { background: #CFD8DC; border-radius: 4px; }

        .relance-empty {
            text-align: center;
            padding: 40px 20px;
            color: #B0BEC5;
        }
        .relance-empty-icon { font-size: 40px; margin-bottom: 12px; }
        .relance-empty-text { font-size: 14px; }

        .relance-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid #f0f2f5;
            cursor: pointer;
            transition: background 0.2s;
            border-radius: 8px;
            margin: 0 -8px;
            padding-left: 8px;
            padding-right: 8px;
        }
        .relance-item:hover { background: #f8f9fa; }
        .relance-item:last-child { border-bottom: none; }

        .relance-type-badge {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 2px 8px;
            border-radius: 4px;
            flex-shrink: 0;
            letter-spacing: 0.3px;
        }
        .relance-type-badge.seller {
            background: #E3F2FD;
            color: #1565C0;
        }
        .relance-type-badge.buyer {
            background: #F3E5F5;
            color: #7B1FA2;
        }

        .relance-item-info {
            flex: 1;
            min-width: 0;
        }
        .relance-item-name {
            font-weight: 600;
            font-size: 14px;
            color: #2C3E50;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .relance-item-detail {
            font-size: 12px;
            color: #7F8C8D;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 1px;
        }

        .relance-item-date {
            text-align: right;
            flex-shrink: 0;
        }
        .relance-date-label {
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
        }
        .relance-date-label.overdue { color: #FF4757; }
        .relance-date-label.today { color: #FF9800; }
        .relance-date-label.upcoming { color: #66BB6A; }
        .relance-date-sub {
            font-size: 10px;
            color: #B0BEC5;
            margin-top: 1px;
        }

        /* Section day divider */
        .relance-divider {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 10px 0 4px;
            color: #7F8C8D;
            border-bottom: 1px solid #E1E8ED;
            margin-bottom: 4px;
        }

        /* Footer */
        .relance-footer {
            padding: 12px 20px;
            border-top: 1px solid #E1E8ED;
            font-size: 12px;
            color: #7F8C8D;
            text-align: center;
            flex-shrink: 0;
        }

        /* Mobile */
        @media (max-width: 768px) {
            .relance-panel {
                width: 100vw;
                max-width: 100vw;
                right: -100vw;
            }
            .relance-filters { gap: 4px; padding: 10px 14px; }
            .relance-filter-btn { font-size: 11px; padding: 5px 10px; }
            .relance-list { padding: 8px 14px; }
        }
    `;
    document.head.appendChild(style);

    // ===== HTML =====
    const overlay = document.createElement('div');
    overlay.className = 'relance-overlay';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.className = 'relance-panel';
    panel.innerHTML = `
        <div class="relance-header">
            <div class="relance-header-left">
                <h3>Relances</h3>
                <div class="relance-subtitle" id="relanceSubtitle">Chargement...</div>
            </div>
            <button class="relance-close-btn">✕</button>
        </div>
        <div class="relance-filters">
            <button class="relance-filter-btn active" data-filter="due">Toutes dues</button>
            <button class="relance-filter-btn" data-filter="overdue">En retard</button>
            <button class="relance-filter-btn" data-filter="today">Aujourd'hui</button>
            <button class="relance-filter-btn" data-filter="upcoming">7 prochains jours</button>
            <button class="relance-filter-btn" data-filter="all">Toutes</button>
        </div>
        <div class="relance-list" id="relanceList"></div>
        <div class="relance-footer" id="relanceFooter"></div>
    `;
    document.body.appendChild(panel);

    // ===== REFS =====
    const closeBtn = panel.querySelector('.relance-close-btn');
    const listEl = document.getElementById('relanceList');
    const subtitleEl = document.getElementById('relanceSubtitle');
    const footerEl = document.getElementById('relanceFooter');
    const filterBtns = panel.querySelectorAll('.relance-filter-btn');

    let allRelances = [];
    let currentFilter = 'due';
    let isOpen = false;

    // ===== OPEN / CLOSE =====
    function openPanel() {
        isOpen = true;
        panel.classList.add('active');
        overlay.classList.add('active');
        loadRelances();
    }

    function closePanel() {
        isOpen = false;
        panel.classList.remove('active');
        overlay.classList.remove('active');
    }

    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closePanel();
    });

    // Hook into the existing alert counter
    document.addEventListener('DOMContentLoaded', () => {
        const alertEl = document.getElementById('alertCounter');
        if (alertEl) {
            // Remove any existing click listener by cloning
            const newAlertEl = alertEl.cloneNode(true);
            alertEl.parentNode.replaceChild(newAlertEl, alertEl);
            newAlertEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isOpen) closePanel();
                else openPanel();
            });
        }
    });

    // ===== FILTERS =====
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderRelances();
        });
    });

    // ===== AUTH HELPER =====
    async function getUserId() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session ? session.user.id : null;
    }

    // ===== LOAD =====
    async function loadRelances() {
        const userId = await getUserId();
        if (!userId) return;

        const [sellersResult, buyersResult] = await Promise.all([
            supabaseClient
                .from('sellers')
                .select('id, first_name, last_name, phone, reminder, status, property_type, address, budget')
                .eq('user_id', userId)
                .not('reminder', 'is', null)
                .order('reminder', { ascending: true }),
            supabaseClient
                .from('buyers')
                .select('id, first_name, last_name, phone, reminder, status, property_type, sector, budget_min, budget_max')
                .eq('user_id', userId)
                .not('reminder', 'is', null)
                .order('reminder', { ascending: true })
        ]);

        const sellers = (sellersResult.data || []).map(s => ({ ...s, leadType: 'seller' }));
        const buyers = (buyersResult.data || []).map(b => ({ ...b, leadType: 'buyer' }));

        allRelances = [...sellers, ...buyers].sort((a, b) => new Date(a.reminder) - new Date(b.reminder));

        renderRelances();
        updateFilterCounts();
    }

    // ===== DATE HELPERS =====
    function getToday() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getDayDiff(reminderStr) {
        const today = getToday();
        const rd = new Date(reminderStr);
        rd.setHours(0, 0, 0, 0);
        return Math.ceil((rd - today) / 86400000);
    }

    function getRelanceCategory(item) {
        const diff = getDayDiff(item.reminder);
        if (diff < 0) return 'overdue';
        if (diff === 0) return 'today';
        return 'upcoming';
    }

    function formatRelanceDate(reminderStr) {
        const d = new Date(reminderStr);
        const months = ['janv.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        return `${d.getDate()} ${months[d.getMonth()]}`;
    }

    // ===== FILTER =====
    function getFilteredRelances() {
        const today = getToday();
        const in7days = new Date(today);
        in7days.setDate(in7days.getDate() + 7);

        switch (currentFilter) {
            case 'due':
                return allRelances.filter(r => {
                    const rd = new Date(r.reminder); rd.setHours(0, 0, 0, 0);
                    return rd <= today;
                });
            case 'overdue':
                return allRelances.filter(r => {
                    const rd = new Date(r.reminder); rd.setHours(0, 0, 0, 0);
                    return rd < today;
                });
            case 'today':
                return allRelances.filter(r => {
                    const rd = new Date(r.reminder); rd.setHours(0, 0, 0, 0);
                    return rd.getTime() === today.getTime();
                });
            case 'upcoming':
                return allRelances.filter(r => {
                    const rd = new Date(r.reminder); rd.setHours(0, 0, 0, 0);
                    return rd > today && rd <= in7days;
                });
            case 'all':
                return allRelances;
            default:
                return allRelances;
        }
    }

    // ===== UPDATE FILTER COUNTS =====
    function updateFilterCounts() {
        const today = getToday();
        const in7days = new Date(today);
        in7days.setDate(in7days.getDate() + 7);

        let dueCount = 0, overdueCount = 0, todayCount = 0, upcomingCount = 0;

        allRelances.forEach(r => {
            const rd = new Date(r.reminder); rd.setHours(0, 0, 0, 0);
            if (rd < today) { overdueCount++; dueCount++; }
            else if (rd.getTime() === today.getTime()) { todayCount++; dueCount++; }
            else if (rd <= in7days) { upcomingCount++; }
        });

        const counts = { due: dueCount, overdue: overdueCount, today: todayCount, upcoming: upcomingCount, all: allRelances.length };
        filterBtns.forEach(btn => {
            const f = btn.dataset.filter;
            const labels = {
                due: `Toutes dues (${counts.due})`,
                overdue: `En retard (${counts.overdue})`,
                today: `Aujourd'hui (${counts.today})`,
                upcoming: `7 jours (${counts.upcoming})`,
                all: `Toutes (${counts.all})`
            };
            btn.textContent = labels[f] || f;
        });

        subtitleEl.textContent = dueCount > 0
            ? `${dueCount} lead${dueCount > 1 ? 's' : ''} à relancer`
            : 'Aucune relance en attente';
    }

    // ===== RENDER =====
    function renderRelances() {
        const filtered = getFilteredRelances();

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div class="relance-empty">
                    <div class="relance-empty-icon">✅</div>
                    <div class="relance-empty-text">Aucune relance ${currentFilter === 'all' ? 'planifiée' : 'dans cette catégorie'}</div>
                </div>`;
            footerEl.textContent = '';
            return;
        }

        let html = '';
        let lastCategory = '';

        filtered.forEach(item => {
            const cat = getRelanceCategory(item);
            const diff = getDayDiff(item.reminder);

            // Day divider
            if (currentFilter === 'all' || currentFilter === 'due') {
                const catLabel = cat === 'overdue' ? '🔴 En retard' : cat === 'today' ? '🟠 Aujourd\'hui' : '📅 À venir';
                if (cat !== lastCategory) {
                    html += `<div class="relance-divider">${catLabel}</div>`;
                    lastCategory = cat;
                }
            }

            const name = [(item.first_name || ''), (item.last_name || '')].filter(Boolean).join(' ') || 'Sans nom';
            const typeBadge = item.leadType === 'seller'
                ? '<span class="relance-type-badge seller">Vendeur</span>'
                : '<span class="relance-type-badge buyer">Acquéreur</span>';

            // Detail line
            let detail = '';
            if (item.phone) detail += item.phone;
            if (item.leadType === 'seller' && item.address) {
                detail += (detail ? ' · ' : '') + item.address;
            }
            if (item.leadType === 'buyer' && item.sector) {
                detail += (detail ? ' · ' : '') + item.sector;
            }

            // Date display
            let dateLabel = '';
            let dateClass = '';
            if (diff < 0) {
                dateLabel = `J${diff}`;
                dateClass = 'overdue';
            } else if (diff === 0) {
                dateLabel = 'Aujourd\'hui';
                dateClass = 'today';
            } else {
                dateLabel = `J+${diff}`;
                dateClass = 'upcoming';
            }

            const page = item.leadType === 'seller' ? 'index.html' : 'acquereurs.html';

            html += `<div class="relance-item" data-id="${item.id}" data-type="${item.leadType}" onclick="window.relanceWidget.goToLead('${item.id}', '${item.leadType}')">
                ${typeBadge}
                <div class="relance-item-info">
                    <div class="relance-item-name">${escapeHtml(name)}</div>
                    ${detail ? `<div class="relance-item-detail">${escapeHtml(detail)}</div>` : ''}
                </div>
                <div class="relance-item-date">
                    <div class="relance-date-label ${dateClass}">${dateLabel}</div>
                    <div class="relance-date-sub">${formatRelanceDate(item.reminder)}</div>
                </div>
            </div>`;
        });

        listEl.innerHTML = html;

        const sellers = filtered.filter(r => r.leadType === 'seller').length;
        const buyers = filtered.filter(r => r.leadType === 'buyer').length;
        footerEl.textContent = `${sellers} vendeur${sellers > 1 ? 's' : ''} · ${buyers} acquéreur${buyers > 1 ? 's' : ''}`;
    }

    // ===== GLOBAL: UPDATE ALERT COUNTER =====
    // This replaces the page-local updateAlertCounter to count BOTH tables
    window.updateRelanceCounter = async function () {
        const userId = await getUserId();
        if (!userId) return;

        const today = new Date().toISOString().split('T')[0];

        const [sellersRes, buyersRes] = await Promise.all([
            supabaseClient
                .from('sellers')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .lte('reminder', today)
                .not('reminder', 'is', null),
            supabaseClient
                .from('buyers')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .lte('reminder', today)
                .not('reminder', 'is', null)
        ]);

        const total = (sellersRes.count || 0) + (buyersRes.count || 0);

        const numEl = document.getElementById('alertNumber');
        const counterEl = document.getElementById('alertCounter');
        if (numEl) numEl.textContent = total;
        if (counterEl) {
            if (total > 0) counterEl.classList.add('has-alerts');
            else counterEl.classList.remove('has-alerts');
        }
    };

    // ===== NAVIGATE TO LEAD =====
    window.relanceWidget = {
        goToLead: function (id, leadType) {
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            const targetPage = leadType === 'seller' ? 'index.html' : 'acquereurs.html';

            if (currentPage === targetPage || currentPage === '' && targetPage === 'index.html') {
                // Same page: close panel and open the lead modal
                closePanel();
                if (leadType === 'seller' && typeof editSeller === 'function') {
                    editSeller(id);
                } else if (leadType === 'buyer' && typeof editBuyer === 'function') {
                    editBuyer(id);
                }
            } else {
                // Different page: navigate with query param
                window.location.href = `${targetPage}?openLead=${id}`;
            }
        }
    };

    // ===== INIT =====
    // Update counter on load
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) window.updateRelanceCounter();
    });
    // Also try immediately
    window.updateRelanceCounter();
})();
