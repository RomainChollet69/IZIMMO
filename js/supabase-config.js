// Léon — Configuration Supabase partagée
const SUPABASE_URL = 'https://aofrngjcfemiptljtyif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZnJuZ2pjZmVtaXB0bGp0eWlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODAwMTIsImV4cCI6MjA4NjU1NjAxMn0.0tnkQYIjgBbvTA_60Eix5Zpau5j3kBV8YTsjpp9utOA';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sources de leads VENDEURS — charte graphique Léon
const SOURCE_CONFIG = {
    boitage: { label: '📬 Boîtage', bg: '#DCEDC8', color: '#33691E' },
    recommandation: { label: '🤝 Recommandation', bg: '#B3E5FC', color: '#01579B' },
    pige: { label: '📰 Pige', bg: '#F8BBD0', color: '#880E4F' },
    siteimmo: { label: '🌐 Site Immo', bg: '#D1C4E9', color: '#4527A0' },
    efficity: { label: '🏢 Efficity', bg: '#B2DFDB', color: '#004D40' },
    internet: { label: '💻 Internet', bg: '#E1BEE7', color: '#6A1B9A' },
    ancien_client: { label: '🔄 Ancien Client', bg: '#FFE0B2', color: '#E65100' },
    acquereur: { label: '🏡 Acquéreur', bg: '#FFCCBC', color: '#BF360C' },
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
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-height: 200px;
            overflow-y: auto;
            z-index: 9999;
            display: none;
            margin-top: 4px;
        }
        .ac-dropdown.active { display: block; }
        .ac-item {
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.15s;
        }
        .ac-item:last-child { border-bottom: none; }
        .ac-item:hover, .ac-item.ac-selected { background: #f0f7ff; }
        .ac-name { font-weight: 700; font-size: 14px; color: #2C3E50; }
        .ac-details { font-size: 12px; color: #999; margin-top: 3px; }
        .ac-details span { margin-right: 10px; }
        @keyframes acFlash {
            0% { background-color: #fff9c4; }
            100% { background-color: white; }
        }
        .ac-flash { animation: acFlash 1s ease; }
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

    // Fermer au clic en dehors
    document.addEventListener('click', (e) => {
        if (!formGroup.contains(e.target)) dropdown.classList.remove('active');
    });

    // Fermer quand le champ perd le focus (délai pour permettre le clic sur une suggestion)
    lastNameInput.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('active'), 200);
    });

    async function searchContacts(query) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('contacts')
            .select('*')
            .eq('user_id', session.user.id)
            .ilike('name', '%' + query + '%')
            .limit(5);

        if (error || !data || data.length === 0) {
            dropdown.classList.remove('active');
            return;
        }

        results = data;
        selIdx = -1;
        dropdown.innerHTML = data.map((c, i) => {
            let details = [];
            if (c.phone) details.push(`<span>📞 ${escapeHtml(c.phone)}</span>`);
            if (c.email) details.push(`<span>📧 ${escapeHtml(c.email)}</span>`);
            return `<div class="ac-item" data-i="${i}">
                <div class="ac-name">${escapeHtml(c.name)}</div>
                ${details.length ? `<div class="ac-details">${details.join('')}</div>` : ''}
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

    function flashField(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('ac-flash');
        void el.offsetWidth;
        el.classList.add('ac-flash');
    }

    function pickContact(contact) {
        const parts = (contact.name || '').trim().split(/\s+/);
        const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
        const lastName = parts.length > 1 ? parts[parts.length - 1] : '';

        document.getElementById(lastNameId).value = lastName;
        document.getElementById(firstNameId).value = firstName;
        flashField(lastNameId);
        flashField(firstNameId);

        if (contact.phone && document.getElementById(phoneId)) {
            document.getElementById(phoneId).value = contact.phone;
            flashField(phoneId);
        }
        if (contact.email && document.getElementById(emailId)) {
            document.getElementById(emailId).value = contact.email;
            flashField(emailId);
        }

        dropdown.classList.remove('active');
    }
}

// Autocomplete pour le champ fullName (formulaire de création)
function setupFullNameAutocomplete(fullNameId, phoneId, emailId) {
    const fullNameInput = document.getElementById(fullNameId);
    if (!fullNameInput) return;

    const formGroup = fullNameInput.closest('.form-group');
    formGroup.classList.add('ac-wrapper');

    const dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    formGroup.appendChild(dropdown);

    let debounceTimer = null;
    let results = [];
    let selIdx = -1;

    fullNameInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = fullNameInput.value.trim();
        if (q.length < 2) { dropdown.classList.remove('active'); return; }
        debounceTimer = setTimeout(() => searchContacts(q), 300);
    });

    fullNameInput.addEventListener('keydown', (e) => {
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

    // Fermer au clic en dehors
    document.addEventListener('click', (e) => {
        if (!formGroup.contains(e.target)) dropdown.classList.remove('active');
    });

    // Fermer quand le champ perd le focus
    fullNameInput.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('active'), 200);
    });

    async function searchContacts(query) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('contacts')
            .select('*')
            .eq('user_id', session.user.id)
            .ilike('name', '%' + query + '%')
            .limit(5);

        if (error || !data || data.length === 0) {
            dropdown.classList.remove('active');
            return;
        }

        results = data;
        selIdx = -1;
        dropdown.innerHTML = data.map((c, i) => {
            let details = [];
            if (c.phone) details.push(`<span>📞 ${escapeHtml(c.phone)}</span>`);
            if (c.email) details.push(`<span>📧 ${escapeHtml(c.email)}</span>`);
            return `<div class="ac-item" data-i="${i}">
                <div class="ac-name">${escapeHtml(c.name)}</div>
                ${details.length ? `<div class="ac-details">${details.join('')}</div>` : ''}
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

    function flashField(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('ac-flash');
        void el.offsetWidth;
        el.classList.add('ac-flash');
    }

    function pickContact(contact) {
        // Pour fullName, on met le nom complet directement
        document.getElementById(fullNameId).value = contact.name || '';
        flashField(fullNameId);

        if (contact.phone && document.getElementById(phoneId)) {
            document.getElementById(phoneId).value = contact.phone;
            flashField(phoneId);
        }
        if (contact.email && document.getElementById(emailId)) {
            document.getElementById(emailId).value = contact.email;
            flashField(emailId);
        }

        dropdown.classList.remove('active');
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== AUTH HEADERS POUR EDGE FUNCTIONS =====
async function getAuthHeaders(contentType = 'application/json') {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = { 'Authorization': `Bearer ${session?.access_token || ''}` };
    if (contentType) headers['Content-Type'] = contentType;
    return headers;
}

// ===== FORMATAGE MONTANTS =====
function parseAmount(val) {
    if (!val && val !== 0) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(String(val).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

function formatEuro(amount) {
    if (!amount && amount !== 0) return '';
    const num = typeof amount === 'number' ? amount : parseAmount(amount);
    if (isNaN(num) || num === 0) return '';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(num);
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

// Multi-city sector autocomplete (for buyers)
function setupSectorAutocomplete() {
    const wrap = document.getElementById('sectorTagsWrap');
    const input = document.getElementById('sectorInput');
    const hidden = document.getElementById('sector');
    if (!wrap || !input) return;

    let sectorEntries = [];
    let features = [];
    let selIdx = -1;
    let debounceTimer = null;

    const formGroup = wrap.closest('.form-group');
    formGroup.classList.add('addr-wrapper');
    const dropdown = document.createElement('div');
    dropdown.className = 'addr-dropdown';
    formGroup.appendChild(dropdown);

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 3) { dropdown.classList.remove('active'); return; }
        debounceTimer = setTimeout(() => fetchCities(q), 300);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && sectorEntries.length > 0) {
            removeSectorEntry(sectorEntries.length - 1);
            return;
        }
        if (!dropdown.classList.contains('active')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(selIdx + 1, features.length - 1); highlight(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); highlight(); }
        else if (e.key === 'Enter' && selIdx >= 0) { e.preventDefault(); pickCity(features[selIdx]); }
        else if (e.key === 'Escape') { dropdown.classList.remove('active'); }
    });

    document.addEventListener('click', (e) => {
        if (!formGroup.contains(e.target)) dropdown.classList.remove('active');
    });

    async function fetchCities(query) {
        try {
            const url = 'https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(query) + '&limit=5&type=municipality';
            const resp = await fetch(url);
            if (!resp.ok) return;
            const json = await resp.json();
            if (!json.features || json.features.length === 0) { dropdown.classList.remove('active'); return; }
            features = json.features;
            selIdx = -1;
            dropdown.innerHTML = features.map((f, i) => {
                const p = f.properties;
                return `<div class="addr-option" data-i="${i}">${escapeHtml(p.label)}${p.context ? `<div class="addr-context">${escapeHtml(p.context)}</div>` : ''}</div>`;
            }).join('');
            dropdown.classList.add('active');
            dropdown.querySelectorAll('.addr-option').forEach(el => {
                el.addEventListener('click', () => pickCity(features[parseInt(el.dataset.i)]));
            });
        } catch (err) { console.error('Erreur API adresse:', err); }
    }

    function highlight() {
        dropdown.querySelectorAll('.addr-option').forEach((el, i) => el.classList.toggle('addr-sel', i === selIdx));
    }

    function pickCity(feature) {
        const p = feature.properties;
        const coords = feature.geometry.coordinates;
        const entry = { label: p.city || p.label, city: p.city || '', postalCode: p.postcode || '', lat: coords[1], lng: coords[0] };
        if (sectorEntries.some(e => e.city === entry.city && e.postalCode === entry.postalCode)) {
            input.value = '';
            dropdown.classList.remove('active');
            return;
        }
        sectorEntries.push(entry);
        input.value = '';
        dropdown.classList.remove('active');
        renderTags();
        syncHidden();
    }

    function removeSectorEntry(index) {
        sectorEntries.splice(index, 1);
        renderTags();
        syncHidden();
    }

    function renderTags() {
        wrap.querySelectorAll('.sector-tag').forEach(t => t.remove());
        sectorEntries.forEach((e, i) => {
            const tag = document.createElement('span');
            tag.className = 'sector-tag';
            tag.innerHTML = `${escapeHtml(e.label)} <button type="button" class="sector-tag-remove" onclick="event.stopPropagation()">&times;</button>`;
            tag.querySelector('.sector-tag-remove').addEventListener('click', () => removeSectorEntry(i));
            wrap.insertBefore(tag, input);
        });
        input.placeholder = sectorEntries.length > 0 ? 'Ajouter une ville...' : 'Tapez une ville...';
    }

    function syncHidden() {
        hidden.value = sectorEntries.map(e => e.label).join(' | ');
        hidden.dataset.entries = JSON.stringify(sectorEntries);
    }

    window.setSectorEntries = function(entries) {
        sectorEntries = entries;
        renderTags();
        syncHidden();
    };
    window.getSectorEntries = function() { return sectorEntries; };
}

// ===== COMPRESSION IMAGES AVANT UPLOAD =====
async function compressImage(file, maxWidth = 1600, quality = 0.7) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                const compressedFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                console.log(`Image compressée : ${(file.size / 1024).toFixed(0)} Ko → ${(compressedFile.size / 1024).toFixed(0)} Ko`);
                resolve(compressedFile);
            }, 'image/jpeg', quality);
        };
        img.src = URL.createObjectURL(file);
    });
}

async function prepareFileForUpload(file) {
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (imageTypes.includes(file.type)) {
        const compressed = await compressImage(file);
        const gain = file.size - compressed.size;
        return { file: compressed, originalSize: file.size, compressed: gain > 0 };
    }
    return { file, originalSize: file.size, compressed: false };
}
