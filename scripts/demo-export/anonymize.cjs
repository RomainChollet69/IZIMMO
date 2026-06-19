/**
 * anonymize.js
 * Lit l'export brut du compte réel (fichier tool-results MCP), anonymise les
 * données (faux noms cohérents, téléphones -> 0102030405, emails -> exemple@mail.com,
 * scrub des textes libres, suppression des tokens) et génère js/demo-data.js.
 *
 * Usage : node scripts/demo-export/anonymize.js <chemin_export_brut> <chemin_sortie>
 * Les données réelles ne sont JAMAIS écrites sur disque (sortie = seed anonymisé only).
 */

const fs = require('fs');

const RAW_PATH = process.argv[2];
const OUT_PATH = process.argv[3] || 'js/demo-data.js';

// ===== Constantes démo =====
const DEMO_USER_ID = '00000000-0000-4000-8000-000000000000';
const FAKE_PHONE = '0102030405';
const FAKE_EMAIL = 'exemple@mail.com';
const DEMO_AGENT_NAME = 'Camille Martin';

// ===== Pools de faux noms (FR) =====
const FIRST = ['Julien','Camille','Thomas','Léa','Nicolas','Sophie','Antoine','Marine','Hugo','Chloé',
  'Maxime','Emma','Lucas','Manon','Romain','Sarah','Alexandre','Julie','Quentin','Laura',
  'Florian','Pauline','Guillaume','Aurélie','Benjamin','Céline','Damien','Elodie','Fabien','Inès',
  'Mathieu','Clara','Nathan','Justine','Olivier','Margaux','Pierre','Anaïs','Raphaël','Lucie'];
const LAST = ['Martin','Bernard','Dubois','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon',
  'Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel',
  'Girard','André','Lefèvre','Mercier','Dupont','Lambert','Bonnet','Rousseau','Blanc','Henry',
  'Garnier','Chevalier','Masson','Gauthier','Perrin','Robin','Clément','Morin','Nicolas','Picard'];

function fakeIdentity(i) {
  return {
    first: FIRST[i % FIRST.length],
    last: LAST[(i * 7 + 11) % LAST.length],
  };
}

// ===== Dictionnaire de remplacement pour scrub des textes libres =====
// realToken (lowercased) -> fakeReplacement
const nameMap = new Map();
function addNameMapping(real, fake) {
  if (!real || typeof real !== 'string') return;
  const key = real.trim().toLowerCase();
  if (key.length < 2) return;
  if (!nameMap.has(key)) nameMap.set(key, fake);
}

const PHONE_RE = /(?:(?:\+|00)33[\s.\-]?\(?0?\)?|0)[1-9](?:[\s.\-]?\d{2}){4}/g;
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

function scrub(text) {
  if (text == null || typeof text !== 'string' || !text) return text;
  let out = text;
  // 1) Remplacer les noms connus (les plus longs d'abord pour éviter les remplacements partiels)
  const keys = [...nameMap.keys()].sort((a, b) => b.length - a.length);
  for (const k of keys) {
    // \b ne marche pas avec les accents ; on borne par limites non-alphanumériques unicode
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|[^\\p{L}])(' + esc + ')(?![\\p{L}])', 'giu');
    out = out.replace(re, (m, pre) => pre + nameMap.get(k));
  }
  // 2) Scrub des emails et téléphones résiduels
  out = out.replace(EMAIL_RE, FAKE_EMAIL).replace(PHONE_RE, FAKE_PHONE);
  return out;
}

function scrubArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((x) => (typeof x === 'string' ? scrub(x) : x));
}

// ===== Chargement export brut =====
const raw = fs.readFileSync(RAW_PATH, 'utf8');
const outer = JSON.parse(raw).result;
const m = outer.match(/<untrusted-data-[0-9a-f-]+>\n([\s\S]*)\n<\/untrusted-data/);
const data = JSON.parse(m[1])[0].data;

const sellers = data.sellers || [];
const buyers = data.buyers || [];
const visits = data.visits || [];
const leadNotes = data.lead_notes || [];
const contacts = data.contacts || [];
const profiles = data.profiles || [];
const userIntegrations = data.user_integrations || [];
const pipelineConfigs = data.pipeline_configs || [];
const priceHistory = data.price_history || [];

// ===== Passe 1 : construire les identités fictives + dictionnaire de noms =====
let idx = 0;
const buyerIdToFakeName = new Map();

function assignIdentity(row) {
  const fake = fakeIdentity(idx++);
  const realFirst = row.first_name;
  const realLast = row.last_name;
  if (realFirst) addNameMapping(realFirst, fake.first);
  if (realLast) addNameMapping(realLast, fake.last);
  if (realFirst && realLast) {
    addNameMapping(`${realFirst} ${realLast}`, `${fake.first} ${fake.last}`);
    addNameMapping(`${realLast} ${realFirst}`, `${fake.last} ${fake.first}`);
  }
  return fake;
}

const sellerFakes = sellers.map(assignIdentity);
const buyerFakes = buyers.map((b, i) => {
  const fake = assignIdentity(b);
  buyerIdToFakeName.set(b.id, `${fake.first} ${fake.last}`);
  return fake;
});

// Personnes secondaires -> faux noms ajoutés au dictionnaire
function mapPersonField(value) {
  if (!value || typeof value !== 'string' || value.trim().length < 2) return value;
  const key = value.trim().toLowerCase();
  if (nameMap.has(key)) return nameMap.get(key);
  const fake = fakeIdentity(idx++);
  const fakeVal = `${fake.first} ${fake.last}`;
  addNameMapping(value, fakeVal);
  return fakeVal;
}

// Pré-remplir le dictionnaire avec contacts + champs secondaires (avant scrub)
contacts.forEach((c) => mapPersonField(c.name));
sellers.forEach((s) => { mapPersonField(s.contact2_name); mapPersonField(s.referrer_name); });
buyers.forEach((b) => { mapPersonField(b.referrer_name); });
visits.forEach((v) => { if (!v.buyer_id || !buyerIdToFakeName.has(v.buyer_id)) mapPersonField(v.buyer_name); });

// ===== Passe 2 : anonymisation =====
function anonSeller(s, i) {
  const f = sellerFakes[i];
  return {
    ...s,
    user_id: DEMO_USER_ID,
    first_name: s.first_name ? f.first : s.first_name,
    last_name: s.last_name ? f.last : s.last_name,
    phone: s.phone ? FAKE_PHONE : s.phone,
    email: s.email ? FAKE_EMAIL : s.email,
    contact2_name: s.contact2_name ? mapPersonField(s.contact2_name) : s.contact2_name,
    contact2_phone: s.contact2_phone ? FAKE_PHONE : s.contact2_phone,
    contact2_email: s.contact2_email ? FAKE_EMAIL : s.contact2_email,
    referrer_name: s.referrer_name ? mapPersonField(s.referrer_name) : s.referrer_name,
    notes: scrub(s.notes),
    description: scrub(s.description),
    competitor_description: scrub(s.competitor_description),
  };
}

function anonBuyer(b, i) {
  const f = buyerFakes[i];
  return {
    ...b,
    user_id: DEMO_USER_ID,
    first_name: b.first_name ? f.first : b.first_name,
    last_name: b.last_name ? f.last : b.last_name,
    phone: b.phone ? FAKE_PHONE : b.phone,
    email: b.email ? FAKE_EMAIL : b.email,
    referrer_name: b.referrer_name ? mapPersonField(b.referrer_name) : b.referrer_name,
    notes: scrub(b.notes),
    dealbreakers: scrub(b.dealbreakers),
    seller_address: scrub(b.seller_address),
    origin_property_label: scrub(b.origin_property_label),
  };
}

function anonVisit(v) {
  let buyerName = v.buyer_name;
  if (v.buyer_id && buyerIdToFakeName.has(v.buyer_id)) buyerName = buyerIdToFakeName.get(v.buyer_id);
  else if (buyerName) buyerName = mapPersonField(buyerName);
  return {
    ...v,
    user_id: DEMO_USER_ID,
    buyer_name: buyerName,
    visitor_phone: v.visitor_phone ? FAKE_PHONE : v.visitor_phone,
    visitor_email: v.visitor_email ? FAKE_EMAIL : v.visitor_email,
    notes: scrub(v.notes),
    positive_points: scrubArray(v.positive_points),
    negative_points: scrubArray(v.negative_points),
    google_event_id: null,
  };
}

function anonNote(n) {
  return {
    ...n,
    user_id: DEMO_USER_ID,
    content: scrub(n.content),
    image_url: null, // évite de pointer vers le storage réel
  };
}

function anonContact(c, i) {
  const f = fakeIdentity(idx + i);
  return {
    ...c,
    user_id: DEMO_USER_ID,
    name: c.name ? (nameMap.get(c.name.trim().toLowerCase()) || `${f.first} ${f.last}`) : c.name,
    phone: c.phone ? FAKE_PHONE : c.phone,
    email: c.email ? FAKE_EMAIL : c.email,
  };
}

function anonProfile(p) {
  return {
    ...p,
    id: DEMO_USER_ID,
    full_name: DEMO_AGENT_NAME,
    avatar_url: null,
    phone: p.phone ? FAKE_PHONE : p.phone,
    phone_pro: p.phone_pro ? FAKE_PHONE : p.phone_pro,
    agency_name: 'Cabinet Démo',
    auto_reply_logo: null,
  };
}

function anonIntegration(ui) {
  return {
    ...ui,
    user_id: DEMO_USER_ID,
    google_access_token: null,
    google_refresh_token: null,
    google_email: FAKE_EMAIL,
    google_calendar_connected: true,
    email_forwarding_active: true,
    inbound_email: null,
    inbound_email_token: null,
    forwarding_confirmation_link: null,
    non_portal_last_sender: ui.non_portal_last_sender ? FAKE_EMAIL : ui.non_portal_last_sender,
  };
}

const seed = {
  sellers: sellers.map(anonSeller),
  buyers: buyers.map(anonBuyer),
  visits: visits.map(anonVisit),
  lead_notes: leadNotes.map(anonNote),
  contacts: contacts.map(anonContact),
  profiles: profiles.map(anonProfile),
  user_integrations: userIntegrations.map(anonIntegration),
  pipeline_configs: pipelineConfigs.map((pc) => ({ ...pc, user_id: DEMO_USER_ID })),
  price_history: priceHistory.map((ph) => ({ ...ph, user_id: DEMO_USER_ID })),
};

// ===== Passe finale : override des textes libres anonymisés par IA =====
// (le scrub déterministe ne couvre pas les noms de TIERS cités dans les notes :
//  conjoints, copropriétaires, notaires, confrères... -> anonymisation IA)
const FT_IN = 'scripts/demo-export/freetext.json';
const FT_OUT = 'scripts/demo-export/freetext-anon.json';
if (fs.existsSync(FT_IN) && fs.existsSync(FT_OUT)) {
  const ftOrig = JSON.parse(fs.readFileSync(FT_IN, 'utf8'));
  const ftAnon = JSON.parse(fs.readFileSync(FT_OUT, 'utf8'));
  if (ftOrig.length !== ftAnon.length) throw new Error(`freetext mismatch: ${ftOrig.length} vs ${ftAnon.length}`);
  const ftMap = new Map(ftOrig.map((o, i) => [o, ftAnon[i]]));
  const sub = (v) => (typeof v === 'string' && ftMap.has(v) ? ftMap.get(v) : v);
  const subArr = (a) => (Array.isArray(a) ? a.map(sub) : a);
  seed.lead_notes.forEach((n) => { n.content = sub(n.content); });
  seed.sellers.forEach((s) => { s.notes = sub(s.notes); s.description = sub(s.description); });
  seed.buyers.forEach((b) => { b.notes = sub(b.notes); b.dealbreakers = sub(b.dealbreakers); });
  seed.visits.forEach((v) => {
    v.notes = sub(v.notes);
    v.positive_points = subArr(v.positive_points);
    v.negative_points = subArr(v.negative_points);
  });
  console.log('[anonymize] override IA textes libres appliqué (' + ftMap.size + ' entrées)');
} else {
  console.warn('[anonymize] freetext-anon.json absent : notes NON re-anonymisées par IA');
}

// ===== Garde-fou : vérifier qu'aucun email/téléphone réel ne subsiste =====
const serialized = JSON.stringify(seed);
const leakedEmails = (serialized.match(EMAIL_RE) || []).filter((e) => e !== FAKE_EMAIL);
const phoneLeak = (serialized.replace(new RegExp(FAKE_PHONE, 'g'), '').match(PHONE_RE) || []);
if (leakedEmails.length) console.warn('[anonymize] ATTENTION emails résiduels:', [...new Set(leakedEmails)].slice(0, 10));
if (phoneLeak.length) console.warn('[anonymize] ATTENTION téléphones résiduels:', [...new Set(phoneLeak)].slice(0, 10));

// ===== Écriture js/demo-data.js =====
const header = `/**
 * demo-data.js — Seed ANONYMISÉ du mode démo (généré par scripts/demo-export/anonymize.js).
 * Données dérivées d'un vrai compte mais : faux noms, téléphones -> ${FAKE_PHONE}, emails -> ${FAKE_EMAIL}.
 * Chargé UNIQUEMENT par demo.html (qui copie ce seed dans sessionStorage au démarrage de la démo).
 * NE PAS éditer à la main — régénérer via le script.
 */
window.DEMO_USER_ID = ${JSON.stringify(DEMO_USER_ID)};
window.DEMO_AGENT = ${JSON.stringify({ id: DEMO_USER_ID, email: FAKE_EMAIL, full_name: DEMO_AGENT_NAME })};
window.DEMO_SEED = ${JSON.stringify(seed)};
`;

fs.writeFileSync(OUT_PATH, header);
const counts = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.length]));
console.log('[anonymize] OK ->', OUT_PATH);
console.log('[anonymize] counts:', JSON.stringify(counts));
console.log('[anonymize] taille:', (header.length / 1024).toFixed(0), 'Ko');
