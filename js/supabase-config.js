// IZIMMO — Configuration Supabase partagée
const SUPABASE_URL = 'https://aofrngjcfemiptljtyif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZnJuZ2pjZmVtaXB0bGp0eWlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODAwMTIsImV4cCI6MjA4NjU1NjAxMn0.0tnkQYIjgBbvTA_60Eix5Zpau5j3kBV8YTsjpp9utOA';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sources de leads VENDEURS — charte graphique IZIMMO
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
