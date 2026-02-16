// WAIMMO — Configuration Supabase partagée
const SUPABASE_URL = 'https://aofrngjcfemiptljtyif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZnJuZ2pjZmVtaXB0bGp0eWlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODAwMTIsImV4cCI6MjA4NjU1NjAxMn0.0tnkQYIjgBbvTA_60Eix5Zpau5j3kBV8YTsjpp9utOA';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sources de leads VENDEURS — charte graphique WAIMMO
const SOURCE_CONFIG = {
    boitage: { label: '📬 Boîtage', bg: '#DCEDC8', color: '#33691E' },
    recommandation: { label: '🤝 Recommandation', bg: '#B3E5FC', color: '#01579B' },
    pige: { label: '📰 Pige', bg: '#F8BBD0', color: '#880E4F' },
    siteimmo: { label: '🌐 Site Immo', bg: '#D1C4E9', color: '#4527A0' },
    boucheaoreille: { label: '🗣️ Bouche à oreille', bg: '#FFE0B2', color: '#E65100' },
    efficity: { label: '🏢 Efficity', bg: '#B2DFDB', color: '#004D40' },
    autre: { label: '📌 Autre', bg: '#CFD8DC', color: '#37474F' }
};

// Sources de leads ACQUÉREURS
const BUYER_SOURCE_CONFIG = {
    site_annonce: { label: '🌐 Site d\'annonce', bg: '#D1C4E9', color: '#4527A0' },
    efficity: { label: '🏢 Efficity', bg: '#B2DFDB', color: '#004D40' },
    recommandation: { label: '🤝 Recommandation', bg: '#B3E5FC', color: '#01579B' },
    appel_entrant: { label: '📞 Appel entrant', bg: '#DCEDC8', color: '#33691E' },
    reseaux_sociaux: { label: '📱 Réseaux sociaux', bg: '#FFE0B2', color: '#E65100' },
    autre: { label: '📌 Autre', bg: '#CFD8DC', color: '#37474F' }
};

function getSourceTag(source) {
    const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.autre;
    return `<span class="card-tag" style="background:${config.bg};color:${config.color}">${config.label}</span>`;
}

function getBuyerSourceTag(source) {
    const config = BUYER_SOURCE_CONFIG[source] || BUYER_SOURCE_CONFIG.autre;
    return `<span class="card-tag" style="background:${config.bg};color:${config.color}">${config.label}</span>`;
}

// ===== AUTOCOMPLETE CONTACTS =====
(function () {
    const style = document.createElement('style');
    style.textContent = `
        .ac-wrapper { position: relative; }
        .ac-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #E1E8ED;
            border-top: none;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            max-height: 220px;
            overflow-y: auto;
            z-index: 10000;
            display: none;
        }
        .ac-dropdown.active { display: block; }
        .ac-item {
            padding: 10px 14px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.15s;
        }
        .ac-item:last-child { border-bottom: none; }
        .ac-item:hover, .ac-item.ac-selected { background: #f0f2f5; }
        .ac-name { font-weight: 600; font-size: 14px; color: #2C3E50; }
        .ac-details { font-size: 12px; color: #7F8C8D; margin-top: 2px; }
    `;
    document.head.appendChild(style);
})();

function setupContactAutocomplete(lastNameId, firstNameId, phoneId, emailId) {
    const lastNameInput = document.getElementById(lastNameId);
    if (!lastNameInput) return;

    const formGroup = lastNameInput.closest('.form-group');
    formGroup.classList.add('ac-wrapper');

    const dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    formGroup.appendChild(dropdown);

    let debounceTimer = null;
    let results = [];
    let selIdx = -1;

    lastNameInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = lastNameInput.value.trim();
        if (q.length < 2) { dropdown.classList.remove('active'); return; }
        debounceTimer = setTimeout(() => searchContacts(q), 300);
    });

    lastNameInput.addEventListener('keydown', (e) => {
        if (!dropdown.classList.contains('active')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selIdx = Math.min(selIdx + 1, results.length - 1);
            highlightItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selIdx = Math.max(selIdx - 1, 0);
            highlightItem();
        } else if (e.key === 'Enter' && selIdx >= 0) {
            e.preventDefault();
            pickContact(results[selIdx]);
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!formGroup.contains(e.target)) dropdown.classList.remove('active');
    });

    async function searchContacts(query) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('contacts')
            .select('*')
            .eq('user_id', session.user.id)
            .ilike('name', '%' + query + '%')
            .order('name')
            .limit(8);

        if (error || !data || data.length === 0) {
            dropdown.classList.remove('active');
            return;
        }

        results = data;
        selIdx = -1;
        dropdown.innerHTML = data.map((c, i) => {
            const det = [c.phone, c.email].filter(Boolean).join(' · ');
            return `<div class="ac-item" data-i="${i}">
                <div class="ac-name">${escapeHtml(c.name)}</div>
                ${det ? `<div class="ac-details">${escapeHtml(det)}</div>` : ''}
            </div>`;
        }).join('');
        dropdown.classList.add('active');

        dropdown.querySelectorAll('.ac-item').forEach(item => {
            item.addEventListener('click', () => pickContact(data[parseInt(item.dataset.i)]));
        });
    }

    function highlightItem() {
        dropdown.querySelectorAll('.ac-item').forEach((el, i) => {
            el.classList.toggle('ac-selected', i === selIdx);
        });
    }

    function pickContact(contact) {
        const parts = (contact.name || '').trim().split(/\s+/);
        const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
        const lastName = parts.length > 1 ? parts[parts.length - 1] : '';

        document.getElementById(firstNameId).value = firstName;
        document.getElementById(lastNameId).value = lastName;
        if (contact.phone && document.getElementById(phoneId)) document.getElementById(phoneId).value = contact.phone;
        if (contact.email && document.getElementById(emailId)) document.getElementById(emailId).value = contact.email;

        dropdown.classList.remove('active');
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== AUTOCOMPLETE ADRESSE (api-adresse.data.gouv.fr) =====
(function () {
    const style = document.createElement('style');
    style.textContent = `
        .addr-wrapper { position: relative; }
        .addr-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #ddd;
            border-top: none;
            border-radius: 0 0 8px 8px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.12);
            max-height: 200px;
            overflow-y: auto;
            z-index: 10001;
            display: none;
        }
        .addr-dropdown.active { display: block; }
        .addr-option {
            padding: 10px 14px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.15s;
            font-size: 14px;
            color: #2C3E50;
        }
        .addr-option:last-child { border-bottom: none; }
        .addr-option:hover, .addr-option.addr-sel { background: #f5f5f5; }
        .addr-option .addr-context {
            font-size: 12px;
            color: #7F8C8D;
            margin-top: 2px;
        }
    `;
    document.head.appendChild(style);
})();

function setupAddressAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const formGroup = input.closest('.form-group');
    formGroup.classList.add('addr-wrapper');

    const dropdown = document.createElement('div');
    dropdown.className = 'addr-dropdown';
    formGroup.appendChild(dropdown);

    let debounceTimer = null;
    let features = [];
    let selIdx = -1;

    // Clear geo data when user types manually
    input.addEventListener('input', () => {
        input.dataset.latitude = '';
        input.dataset.longitude = '';
        input.dataset.city = '';
        input.dataset.postalCode = '';

        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 3) { dropdown.classList.remove('active'); return; }
        debounceTimer = setTimeout(() => fetchAddresses(q), 300);
    });

    input.addEventListener('keydown', (e) => {
        if (!dropdown.classList.contains('active')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selIdx = Math.min(selIdx + 1, features.length - 1);
            highlightAddr();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selIdx = Math.max(selIdx - 1, 0);
            highlightAddr();
        } else if (e.key === 'Enter' && selIdx >= 0) {
            e.preventDefault();
            pickAddr(features[selIdx]);
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!formGroup.contains(e.target)) dropdown.classList.remove('active');
    });

    async function fetchAddresses(query) {
        try {
            const url = 'https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(query) + '&limit=5';
            const resp = await fetch(url);
            if (!resp.ok) return;
            const json = await resp.json();

            if (!json.features || json.features.length === 0) {
                dropdown.classList.remove('active');
                return;
            }

            features = json.features;
            selIdx = -1;
            dropdown.innerHTML = features.map((f, i) => {
                const p = f.properties;
                return `<div class="addr-option" data-i="${i}">
                    ${escapeHtml(p.label)}
                    ${p.context ? `<div class="addr-context">${escapeHtml(p.context)}</div>` : ''}
                </div>`;
            }).join('');
            dropdown.classList.add('active');

            dropdown.querySelectorAll('.addr-option').forEach(el => {
                el.addEventListener('click', () => pickAddr(features[parseInt(el.dataset.i)]));
            });
        } catch (err) {
            console.error('Erreur API adresse:', err);
        }
    }

    function highlightAddr() {
        dropdown.querySelectorAll('.addr-option').forEach((el, i) => {
            el.classList.toggle('addr-sel', i === selIdx);
        });
    }

    function pickAddr(feature) {
        const p = feature.properties;
        const coords = feature.geometry.coordinates;

        input.value = p.label;
        input.dataset.latitude = coords[1];
        input.dataset.longitude = coords[0];
        input.dataset.city = p.city || '';
        input.dataset.postalCode = p.postcode || '';

        dropdown.classList.remove('active');
    }
}
