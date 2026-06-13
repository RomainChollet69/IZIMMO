/**
 * inbound-email.js
 * Webhook public pour Mailgun Inbound Parse.
 * Reçoit les emails portails transférés par les agents, parse avec Claude Haiku,
 * matche avec les sellers existants, et stocke dans visit_requests.
 * Auth : signature HMAC Mailgun (pas d'auth Supabase — webhook public).
 * Dépendances : @supabase/supabase-js, busboy, crypto (Node built-in)
 */

import { getSupabaseAdmin } from '../lib/auth.js';
import { sendEmail } from '../lib/mailgun-send.js';
import { createHmac } from 'crypto';
import Busboy from 'busboy';

// Désactiver le body parser Vercel — Mailgun envoie du multipart/form-data
export const config = { api: { bodyParser: false } };

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// =================================================================
// Allowlist des portails immobiliers (filtre expéditeur)
// =================================================================
// Beaucoup de consultants activent par erreur le transfert de TOUTE leur boîte
// (au lieu d'un filtre Gmail ciblé) → des emails internes (facturation@efficity.com),
// LinkedIn, newsletters... arrivent jusqu'à Léon. On rejette ici tout expéditeur
// qui n'est PAS un portail immobilier connu, AVANT d'appeler Claude (coût + bruit).
//
// Matching : domaine racine avec sous-domaines (mail.seloger.com → seloger.com).
// AJOUTER tout nouveau portail ici. ⚠️ Surveiller les logs "Expéditeur non-portail
// rejeté" : un portail manquant = ses leads silencieusement ignorés.
const PORTAL_SENDER_DOMAINS = [
    // Portails d'annonces nationaux
    'seloger.com',
    'leboncoin.fr',
    'bienici.com',
    'pap.fr',
    'logic-immo.com',
    'logicimmo.com',
    'meilleursagents.com',
    'avendrealouer.fr',
    'ouestfrance-immo.com',
    'paruvendu.fr',
    'green-acres.fr',
    'green-acres.com',
    // Figaro Immobilier & partenaires
    'explorimmo.com',
    'figaro-immo.com',
    'properstar.com',
    'properstar.fr',
    // Haut de gamme
    'bellesdemeures.com',
    'luxresidence.com',
    // Agrégateurs / spécialisés
    'jinka.fr',
    'superimmo.com',
    'locservice.fr'
];

// Mots vides français ignorés lors du matching d'adresse
const ADDRESS_STOP_WORDS = new Set([
    'de', 'du', 'des', 'la', 'le', 'les', 'l', 'et', 'à', 'a', 'en',
    'rue', 'avenue', 'boulevard', 'place', 'allée', 'chemin', 'impasse',
    'cours', 'passage', 'route', 'voie'
]);

// =================================================================
// Handler principal
// =================================================================

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // 1. Parse multipart form-data
        const fields = await parseMultipart(req);

        // 2. Vérifier signature Mailgun
        if (!verifyMailgunSignature(fields)) {
            console.error('[InboundEmail] Signature Mailgun invalide');
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // 3. Résoudre l'agent depuis l'adresse recipient
        const recipient = fields.recipient || '';
        const agent = await resolveAgent(recipient);
        if (!agent) {
            console.log('[InboundEmail] Agent non trouvé pour:', recipient);
            return res.status(200).json({ message: 'Unknown recipient, ignored' });
        }

        // 4. Intercepter les emails de confirmation de transfert (Gmail, Outlook)
        const sender = fields.sender || fields.from || '';
        const subject = fields.subject || '';
        const confirmResult = await handleForwardingConfirmation(agent.user_id, sender, subject, fields);
        if (confirmResult) {
            console.log(`[InboundEmail] Confirmation transfert interceptée pour agent ${agent.user_id}`);
            return res.status(200).json({ message: 'Forwarding confirmation captured' });
        }

        // 4bis. Filtre expéditeur : ne traiter QUE les emails issus d'un portail immobilier.
        // On lit le header "From" (expéditeur d'origine préservé par le transfert), PAS
        // l'enveloppe `sender` qui, sur un transfert Gmail, porte l'adresse du consultant.
        const originalFrom = fields.from || fields.From || fields.sender || '';
        if (!isPortalSender(originalFrom)) {
            console.log(`[InboundEmail] Expéditeur non-portail rejeté: "${originalFrom}" (recipient: ${recipient})`);
            // Signal de "transfert toute la boîte" → avertissement ciblé sur la page Visites.
            await flagNonPortalSender(agent.user_id, originalFrom);
            return res.status(200).json({ message: 'Sender not a known portal, ignored' });
        }

        // 5. Déduplication par email_message_id
        const messageId = fields['Message-Id'] || fields['message-id'] || `auto-${Date.now()}`;
        const isDuplicate = await checkDuplicate(agent.user_id, messageId);
        if (isDuplicate) {
            console.log('[InboundEmail] Email déjà traité:', messageId);
            return res.status(200).json({ message: 'Already processed' });
        }

        // 6. Parser le contenu avec Claude Haiku
        const emailBody = fields['body-plain'] || fields['body-html'] || '';

        const parsed = await parseEmailWithClaude(emailBody, subject, sender);
        if (!parsed || !parsed.is_visit_request) {
            console.log('[InboundEmail] Pas une demande de visite:', subject);
            return res.status(200).json({ message: 'Not a visit request, ignored' });
        }

        // 7. Matcher avec les sellers existants de l'agent
        const matchResult = await matchSeller(agent.user_id, parsed);

        // 8. Insérer dans visit_requests
        const supabaseAdmin = getSupabaseAdmin();
        const emailDate = fields.timestamp
            ? new Date(parseInt(fields.timestamp) * 1000).toISOString()
            : new Date().toISOString();

        const { error: insertErr } = await supabaseAdmin
            .from('visit_requests')
            .insert({
                user_id: agent.user_id,
                email_message_id: messageId,
                email_from: sender,
                email_subject: subject,
                email_date: emailDate,
                email_snippet: emailBody.substring(0, 500),
                portal_name: parsed.portal_name || null,
                visitor_name: parsed.visitor_name || null,
                visitor_first_name: parsed.visitor_first_name || null,
                visitor_last_name: parsed.visitor_last_name || null,
                visitor_phone: parsed.visitor_phone || null,
                visitor_email: parsed.visitor_email || null,
                visitor_message: parsed.visitor_message || null,
                property_address: parsed.property_address || null,
                property_reference: parsed.property_reference || null,
                property_type: parsed.property_type || null,
                property_price: parsed.property_price || null,
                matched_seller_id: matchResult?.id || null,
                match_confidence: matchResult?.confidence || 'none',
                status: 'pending',
                parsed_data: parsed
            });

        if (insertErr) {
            // UNIQUE constraint = déduplication DB
            if (insertErr.code === '23505') {
                console.log('[InboundEmail] Doublon (constraint):', messageId);
                return res.status(200).json({ message: 'Duplicate' });
            }
            console.error('[InboundEmail] Insert error:', insertErr);
            return res.status(500).json({ error: 'Database error' });
        }

        console.log(`[InboundEmail] Demande créée: ${parsed.visitor_name || '?'} via ${parsed.portal_name || 'portail'} → agent ${agent.user_id}`);

        // 9. Envoi automatique email de qualification (si activé + email valide)
        await sendAutoReplyIfEnabled(supabaseAdmin, agent.user_id, parsed);

        return res.status(200).json({ message: 'Visit request created', portal: parsed.portal_name });

    } catch (err) {
        console.error('[InboundEmail] Error:', err);
        // Toujours répondre 200 à Mailgun pour éviter les retries infinis
        return res.status(200).json({ error: 'Processing error', message: err.message });
    }
}

// =================================================================
// Parse multipart form-data (Mailgun POST)
// =================================================================

function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const fields = {};
        const busboy = Busboy({ headers: req.headers });

        busboy.on('field', (name, value) => {
            fields[name] = value;
        });

        // Ignorer les pièces jointes
        busboy.on('file', (_name, file) => {
            file.resume();
        });

        busboy.on('finish', () => resolve(fields));
        busboy.on('error', reject);

        req.pipe(busboy);
    });
}

// =================================================================
// Vérification signature Mailgun (HMAC SHA256)
// =================================================================

function verifyMailgunSignature(fields) {
    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    if (!signingKey) {
        console.warn('[InboundEmail] MAILGUN_WEBHOOK_SIGNING_KEY non configurée — skip vérification');
        return true;
    }

    const { timestamp, token, signature } = fields;
    if (!timestamp || !token || !signature) return false;

    const hmac = createHmac('sha256', signingKey);
    hmac.update(timestamp + token);
    const expected = hmac.digest('hex');

    return expected === signature;
}

// =================================================================
// Filtre expéditeur : l'email provient-il d'un portail immobilier ?
// =================================================================

// Extrait le domaine d'un champ "From" ("Nom" <a@b.fr> ou a@b.fr) en minuscules.
function extractSenderDomain(fromField) {
    if (!fromField) return '';
    const match = fromField.match(/[^\s<>@]+@([^\s<>]+)/);
    if (!match) return '';
    return match[1].toLowerCase().replace(/[>.,;]+$/, '');
}

// True si le domaine est dans l'allowlist (matching racine + sous-domaines).
function isPortalSender(fromField) {
    const domain = extractSenderDomain(fromField);
    if (!domain) return false;
    return PORTAL_SENDER_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

// Horodate le dernier email non-portail reçu pour un agent (signal "transfert
// toute la boîte"). La page Visites s'en sert pour un avertissement ciblé.
// Best-effort : ne jamais faire échouer le webhook si l'update échoue.
async function flagNonPortalSender(userId, fromField) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin
            .from('user_integrations')
            .update({
                non_portal_last_at: new Date().toISOString(),
                non_portal_last_sender: (fromField || '').substring(0, 200)
            })
            .eq('user_id', userId);
    } catch (err) {
        console.error('[InboundEmail] flagNonPortalSender error:', err.message);
    }
}

// =================================================================
// Résoudre l'agent depuis l'adresse recipient
// =================================================================

async function resolveAgent(recipient) {
    const supabaseAdmin = getSupabaseAdmin();
    const emailLocal = recipient.split('@')[0];
    if (!emailLocal) return null;

    // Recherche par adresse exacte
    const { data } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id, inbound_email, inbound_email_token')
        .eq('inbound_email', recipient)
        .eq('email_forwarding_active', true)
        .single();

    if (data) return data;

    // Fallback : recherche par token (partie après le dernier tiret)
    const parts = emailLocal.split('-');
    const token = parts[parts.length - 1];
    if (!token) return null;

    const { data: byToken } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id, inbound_email, inbound_email_token')
        .eq('inbound_email_token', token)
        .eq('email_forwarding_active', true)
        .single();

    return byToken || null;
}

// =================================================================
// Déduplication
// =================================================================

async function checkDuplicate(userId, messageId) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data } = await supabaseAdmin
        .from('visit_requests')
        .select('id')
        .eq('user_id', userId)
        .eq('email_message_id', messageId)
        .limit(1);

    return data && data.length > 0;
}

// =================================================================
// Interception des emails de confirmation de transfert (Gmail, Outlook)
// =================================================================

// Patterns d'expéditeurs de confirmation connus
const CONFIRMATION_SENDERS = [
    'forwarding-noreply@google.com',     // Gmail
    'no-reply@microsoft.com',            // Outlook/365
    'postmaster@outlook.com'             // Outlook legacy
];

async function handleForwardingConfirmation(userId, sender, subject, fields) {
    // Vérifier si c'est un email de confirmation de transfert
    const senderLower = sender.toLowerCase();
    const isConfirmation = CONFIRMATION_SENDERS.some(s => senderLower.includes(s))
        && /confirm|transfert|forwarding|vérif/i.test(subject);

    if (!isConfirmation) return false;

    // Extraire le lien de confirmation depuis le body HTML ou plain
    const body = fields['body-html'] || fields['body-plain'] || '';
    const confirmLink = extractConfirmationLink(body);

    if (!confirmLink) {
        // Log le body pour debug — les liens Gmail peuvent avoir un format inattendu
        console.warn('[InboundEmail] Email de confirmation détecté mais aucun lien trouvé. Body (500 chars):', body.substring(0, 500));
        // Même sans lien, on return true pour éviter d'envoyer ça à Claude (gaspillage)
        return true;
    }

    // Sauvegarder le lien dans user_integrations
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
        .from('user_integrations')
        .update({
            forwarding_confirmation_link: confirmLink,
            forwarding_confirmation_date: new Date().toISOString()
        })
        .eq('user_id', userId);

    if (error) {
        console.error('[InboundEmail] Erreur sauvegarde lien confirmation:', error);
        return false;
    }

    return true;
}

function extractConfirmationLink(html) {
    // Décoder les entités HTML (&amp; → &, etc.) pour normaliser les liens
    const decoded = html.replace(/&amp;/g, '&').replace(/&#x3D;/g, '=').replace(/&#61;/g, '=');

    // Extraire TOUS les liens href du HTML
    const allHrefs = [];
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = hrefRegex.exec(decoded)) !== null) {
        allHrefs.push(m[1]);
    }

    // Aussi chercher les URLs en texte brut (pas dans des href)
    const plainUrls = decoded.match(/https?:\/\/[^\s<>"']+/gi) || [];
    const allLinks = [...allHrefs, ...plainUrls];

    // Priorité 1 : lien Google contenant "ConfirmForwarding" ou "confirm"
    const googleConfirm = allLinks.find(l => /google\.com/i.test(l) && /confirm/i.test(l));
    if (googleConfirm) return googleConfirm;

    // Priorité 2 : lien mail.google.com (page Gmail)
    const gmailLink = allLinks.find(l => /mail\.google\.com/i.test(l));
    if (gmailLink) return gmailLink;

    // Priorité 3 : lien Microsoft/Outlook de confirmation
    const msLink = allLinks.find(l => /(?:microsoft|outlook)\.com/i.test(l) && /(?:confirm|verify)/i.test(l));
    if (msLink) return msLink;

    // Priorité 4 : tout lien contenant "confirm" ou "verify"
    const confirmLink = allLinks.find(l => /(?:confirm|verify)/i.test(l) && /^https?:\/\//i.test(l));
    if (confirmLink) return confirmLink;

    // Priorité 5 : premier lien HTTP (hors images, CSS, trackers courants)
    const firstUseful = allLinks.find(l =>
        /^https?:\/\//i.test(l)
        && !/\.(png|jpg|gif|css|ico)/i.test(l)
        && !/tracking|pixel|beacon|unsubscribe/i.test(l)
    );
    if (firstUseful) return firstUseful;

    return null;
}

// =================================================================
// Parsing email avec Claude Haiku
// =================================================================

async function parseEmailWithClaude(body, subject, sender) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('[InboundEmail] ANTHROPIC_API_KEY not configured');
        return null;
    }

    const prompt = `Tu analyses un email transféré (forwarded) par un agent immobilier.
L'email ORIGINAL provient d'un portail immobilier français (SeLoger, LeBonCoin, Bien'ici, PAP, Logic-Immo, Figaro Immo, MeilleursAgents, etc.).

IMPORTANT : L'email a été transféré, donc :
- L'objet peut commencer par "Fwd:", "Tr:", "Re:" — IGNORE ces préfixes
- Le contenu peut contenir des en-têtes de transfert ("De:", "Envoyé:", "---------- Forwarded message ----------")
- Concentre-toi sur le CONTENU ORIGINAL du portail, pas sur les métadonnées de transfert
- Un "Nouveau message" ou "Nouvelle demande" d'un portail EST une demande de contact/visite

EXPÉDITEUR ORIGINAL OU TRANSFÉRÉ : ${sender}
OBJET : ${subject}

CONTENU :
${body.substring(0, 5000)}

Extrais les informations et retourne UNIQUEMENT un JSON valide :
{
  "is_visit_request": true | false,
  "visitor_name": "nom complet du visiteur/demandeur" | null,
  "visitor_first_name": "prénom" | null,
  "visitor_last_name": "nom de famille" | null,
  "visitor_phone": "téléphone au format 06 12 34 56 78" | null,
  "visitor_email": "email du visiteur" | null,
  "visitor_message": "message accompagnant la demande" | null,
  "property_address": "adresse du bien" | null,
  "property_reference": "référence annonce" | null,
  "property_type": "appartement | maison | terrain | commerce" | null,
  "property_price": 350000 | null,
  "portal_name": "seloger | leboncoin | bienici | pap | logicimmo | meilleursagents | jinka | autre" | null
}

RÈGLES :
- is_visit_request = true si c'est un message d'un portail concernant un bien (demande de visite, demande d'info, nouveau message, prise de contact, favori)
- is_visit_request = false UNIQUEMENT pour les newsletters, rapports de stats, confirmations de publication, pubs
- En cas de doute, mets is_visit_request = true (mieux vaut un faux positif qu'un faux négatif)
- Détecte le portail depuis l'objet, l'expéditeur ou le contenu
- Le téléphone doit être au format français (06/07) avec espaces
- property_price en nombre entier sans symbole (ex: 515000). IMPORTANT : extrais le prix depuis la description du bien dans l'email (souvent en bas : "Maison 4 pièces 96 m² / 515000 €")
- property_reference : extrais la référence annonce si présente (ex: "Référence : 193576")
- property_address : extrais l'adresse ou la ville si mentionnée
- Retourne UNIQUEMENT le JSON, sans markdown`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 512,
                messages: [{ role: 'user', content: prompt }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.error('[InboundEmail] Anthropic error:', response.status);
            return null;
        }

        const result = await response.json();
        const text = result.content?.[0]?.text || '';

        try {
            return JSON.parse(text);
        } catch (e) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        }
    } catch (err) {
        clearTimeout(timeout);
        console.error('[InboundEmail] Claude parse error:', err.message);
        return null;
    }
}

// =================================================================
// Matching avec sellers existants
// =================================================================

async function matchSeller(userId, parsed) {
    if (!parsed.property_address && !parsed.property_type && !parsed.property_reference) return null;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: sellers } = await supabaseAdmin
        .from('sellers')
        .select('id, first_name, last_name, address, property_type, budget, links')
        .eq('user_id', userId)
        .in('status', ['mandate', 'commercialisation']); // Ne matcher qu'avec les biens sous mandat

    if (!sellers || sellers.length === 0) return null;

    // 0. Matching par référence d'annonce (priorité maximale)
    const reqRef = parsed.property_reference ? parsed.property_reference.replace(/\D/g, '') : '';
    if (reqRef && reqRef.length >= 5) {
        for (const seller of sellers) {
            const sellerLinks = seller.links || [];
            for (const url of sellerLinks) {
                if (typeof url !== 'string') continue;
                // Extraire les nombres de 6+ chiffres des URLs
                const nums = url.match(/(\d{6,})/g);
                if (nums && nums.includes(reqRef)) {
                    console.log(`[InboundEmail:Match] Référence ${reqRef} trouvée dans ${url}`);
                    return { id: seller.id, confidence: 'high' };
                }
            }
        }
    }

    // 1. Matching par adresse (score bidirectionnel, seuils assouplis)
    if (parsed.property_address) {
        const searchWords = normalizeAddress(parsed.property_address);
        let bestMatch = null;
        let bestScore = 0;

        for (const seller of sellers) {
            if (!seller.address) continue;
            const sellerWords = normalizeAddress(seller.address);
            const common = searchWords.filter(w => sellerWords.includes(w));
            // Score bidirectionnel : prend le max pour gérer les adresses partielles
            const scoreFromSearch = common.length / Math.max(searchWords.length, 1);
            const scoreFromSeller = common.length / Math.max(sellerWords.length, 1);
            const score = Math.max(scoreFromSearch, scoreFromSeller);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = seller;
            }
        }

        if (bestMatch && bestScore >= 0.4) {
            return { id: bestMatch.id, confidence: bestScore >= 0.6 ? 'high' : 'medium' };
        }
    }

    // 2. Matching ville/CP + prix (quand l'adresse est juste une ville)
    if (parsed.property_address && parsed.property_price) {
        const normAddr = normalizeAddress(parsed.property_address).join(' ');
        const cpMatch = normAddr.match(/\b(69\d{3}|01\d{3}|38\d{3}|42\d{3})\b/);
        const reqCP = cpMatch ? cpMatch[1] : '';
        const cityWords = normalizeAddress(parsed.property_address).filter(w => !/^\d+$/.test(w) && w.length > 2);

        if (reqCP || cityWords.length > 0) {
            const priceMargin = parsed.property_price * 0.15;
            const cityMatches = sellers.filter(s => {
                if (!s.address || !s.budget) return false;
                const sellerNorm = normalizeAddress(s.address).join(' ');
                const cpOk = reqCP && sellerNorm.includes(reqCP);
                const cityOk = cityWords.length > 0 && cityWords.some(w => sellerNorm.includes(w));
                const priceOk = Math.abs(s.budget - parsed.property_price) <= priceMargin;
                return (cpOk || cityOk) && priceOk;
            });

            if (cityMatches.length === 1) {
                return { id: cityMatches[0].id, confidence: 'medium' };
            }
            if (cityMatches.length > 1) {
                cityMatches.sort((a, b) => Math.abs((a.budget || 0) - parsed.property_price) - Math.abs((b.budget || 0) - parsed.property_price));
                return { id: cityMatches[0].id, confidence: 'low' };
            }
        }
    }

    // 3. Fallback type + prix : DÉSACTIVÉ.
    // Trop de faux positifs (bienici/SeLoger/Gingka envoient parfois sans adresse →
    // toutes les demandes du même prix tombaient sur le même bien).
    // Mieux vaut "Aucun bien matché" + matching manuel que mauvais match silencieux.

    return null;
}

function normalizeAddress(address) {
    return address
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        // Normaliser les arrondissements : 9e, 9eme, 9ème → 9
        .replace(/(\d+)\s*(e|er|ere|eme|ème)\b/g, '$1')
        .split(/\s+/)
        .filter(w => (w.length > 1 || /^\d+$/.test(w)) && !ADDRESS_STOP_WORDS.has(w));
}

// =================================================================
// AUTO-REPLY : email de qualification acquéreur
// =================================================================

const EXCLUDED_EMAIL_DOMAINS = [
    'privaterelay.appleid.com',
    'noreply', 'no-reply', 'mailer-daemon'
];

async function sendAutoReplyIfEnabled(supabaseAdmin, userId, parsed) {
    try {
        const visitorEmail = parsed.visitor_email;
        console.log('[AutoReply] Début — email:', visitorEmail, '| userId:', userId);
        if (!visitorEmail) {
            console.log('[AutoReply] Pas d\'email visiteur, skip');
            return;
        }

        // Exclure les emails de service/relay
        const emailLower = visitorEmail.toLowerCase();
        if (EXCLUDED_EMAIL_DOMAINS.some(d => emailLower.includes(d))) {
            console.log('[AutoReply] Email exclu (service/relay):', visitorEmail);
            return;
        }

        // Vérifier si l'auto-reply est activé pour cet agent
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('auto_reply_enabled, full_name, agency_name, avatar_url, auto_reply_logo, auto_reply_show_photo, auto_reply_show_logo')
            .eq('id', userId)
            .maybeSingle();

        console.log('[AutoReply] Profile auto_reply_enabled:', profile?.auto_reply_enabled);
        if (!profile || !profile.auto_reply_enabled) {
            console.log('[AutoReply] Auto-reply désactivé, skip');
            return;
        }

        // Charger les infos agent pour personnaliser l'email
        const agentName = profile.full_name || '';
        const agencyName = profile.agency_name || '';
        const avatarUrl = profile.avatar_url || '';
        const logoUrl = profile.auto_reply_logo || '';
        const showPhoto = profile.auto_reply_show_photo !== false;
        const showLogo = profile.auto_reply_show_logo || false;

        // Construire l'URL du formulaire avec pré-remplissage
        const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : 'https://avecleon.fr';

        const formParams = new URLSearchParams({
            agent_id: userId,
            source: 'site_annonce'
        });
        // Nom : utiliser first/last si dispo, sinon découper visitor_name
        const vFirstName = parsed.visitor_first_name || (parsed.visitor_name || '').split(' ')[0] || '';
        const vLastName = parsed.visitor_last_name || (parsed.visitor_name || '').split(' ').slice(1).join(' ') || '';
        if (vFirstName) formParams.set('first_name', vFirstName);
        if (vLastName) formParams.set('last_name', vLastName);
        // Source portail
        if (parsed.portal_name) formParams.set('source', portalToBuyerSource(parsed.portal_name));
        if (visitorEmail) formParams.set('email', visitorEmail);
        if (parsed.visitor_phone) formParams.set('phone', parsed.visitor_phone);
        // Infos agent pour personnaliser le formulaire
        if (agentName) formParams.set('agent_name', agentName);
        if (agencyName) formParams.set('agency', agencyName);
        if (showPhoto && avatarUrl) formParams.set('photo', avatarUrl);
        if (showLogo && logoUrl) formParams.set('logo', logoUrl);

        const formUrl = `${baseUrl}/formulaire.html?${formParams.toString()}`;
        const firstName = parsed.visitor_first_name || parsed.visitor_name || '';

        const html = buildAutoReplyHtml(firstName, formUrl, {
            agentName, agencyName, avatarUrl, logoUrl, showPhoto, showLogo
        });

        // Expéditeur personnalisé
        const domain = process.env.MAILGUN_DOMAIN || 'inbound.avecleon.fr';
        const fromName = agentName && agencyName ? `${agentName} — ${agencyName}` : agentName || agencyName || 'Léon';

        const result = await sendEmail({
            to: visitorEmail,
            subject: 'Merci pour votre intérêt — Définissons votre projet ensemble',
            html,
            from: `${fromName} <noreply@${domain}>`
        });

        if (result.success) {
            console.log(`[AutoReply] Email envoyé à ${visitorEmail}`);
        } else {
            console.error(`[AutoReply] Échec envoi à ${visitorEmail}:`, result.error);
        }
    } catch (err) {
        // Ne pas faire échouer le webhook si l'auto-reply échoue
        console.error('[AutoReply] Erreur:', err.message);
    }
}

function portalToBuyerSource(portalName) {
    const p = (portalName || '').toLowerCase();
    if (p.includes('leboncoin') || p.includes('lbc')) return 'site_annonce';
    if (p.includes('seloger') || p.includes('logic')) return 'site_annonce';
    if (p.includes('bien') && p.includes('ici')) return 'site_annonce';
    if (p.includes('figaro')) return 'site_annonce';
    if (p.includes('jinka')) return 'site_annonce';
    return 'site_annonce';
}

function buildAutoReplyHtml(firstName, formUrl, opts = {}) {
    const { agentName, agencyName, avatarUrl, logoUrl, showPhoto, showLogo } = opts;
    const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
    const signatureName = agentName || 'Votre conseiller';
    const signatureAgency = agencyName ? `<br><span style="color:#78909C">${agencyName}</span>` : '';

    // Header : logo agence ou gradient simple
    let headerContent = '';
    if (showLogo && logoUrl) {
        headerContent = `<img src="${logoUrl}" alt="${agencyName || ''}" height="50" style="max-width:250px">`;
    } else if (agencyName) {
        headerContent = `<span style="font-size:22px;font-weight:700;color:#2C3E50;letter-spacing:0.5px">${agencyName}</span>`;
    }

    // Photo de l'agent
    let agentPhotoHtml = '';
    if (showPhoto && avatarUrl) {
        agentPhotoHtml = `<tr><td style="padding:24px 40px 0" align="center">
            <img src="${avatarUrl}" alt="${agentName || ''}" width="72" height="72" style="border-radius:50%;border:3px solid #E0E0E0;object-fit:cover" referrerpolicy="no-referrer">
            <p style="font-size:15px;font-weight:700;color:#2C3E50;margin:10px 0 0">${agentName || ''}</p>
            ${agencyName ? `<p style="font-size:13px;color:#78909C;margin:2px 0 0">${agencyName}</p>` : ''}
        </td></tr>`;
    }

    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

<!-- Header -->
<tr><td style="background:#F5F5F7;padding:28px 40px;text-align:center;border-bottom:1px solid #E8E8ED">
    ${headerContent}
</td></tr>

<!-- Photo agent -->
${agentPhotoHtml}

<!-- Body -->
<tr><td style="padding:${showPhoto && avatarUrl ? '16px' : '36px'} 40px 20px">
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 20px">
        ${greeting}
    </p>
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 20px">
        Merci de l'intérêt que vous portez à notre bien immobilier.
    </p>
    <p style="font-size:16px;color:#2C3E50;line-height:1.7;margin:0 0 20px">
        Afin de vous offrir le meilleur service et de personnaliser notre accompagnement,
        nous aurions besoin que vous complétiez le formulaire ci-dessous.
    </p>
</td></tr>

<!-- CTA Button -->
<tr><td style="padding:0 40px 36px" align="center">
    <a href="${formUrl}" style="
        display:inline-block;padding:16px 48px;
        background:#2C3E50;color:white;
        font-size:16px;font-weight:600;
        text-decoration:none;border-radius:8px;
        letter-spacing:0.3px;
    ">Compléter le formulaire</a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0">
    <p style="font-size:14px;color:#2C3E50;line-height:1.6;margin:0">
        À bientôt,<br>
        <strong>${signatureName}</strong>${signatureAgency}
    </p>
</td></tr>

</table>

<!-- Disclaimer -->
<p style="font-size:11px;color:#aaa;text-align:center;margin-top:20px;line-height:1.5">
    Cet email a été envoyé automatiquement suite à votre demande d'information.<br>
    Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.
</p>

</td></tr></table>
</body></html>`;
}
