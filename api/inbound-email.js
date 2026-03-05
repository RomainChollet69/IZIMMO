/**
 * inbound-email.js
 * Webhook public pour Mailgun Inbound Parse.
 * Reçoit les emails portails transférés par les agents, parse avec Claude Haiku,
 * matche avec les sellers existants, et stocke dans visit_requests.
 * Auth : signature HMAC Mailgun (pas d'auth Supabase — webhook public).
 * Dépendances : @supabase/supabase-js, busboy, crypto (Node built-in)
 */

import { getSupabaseAdmin } from '../lib/auth.js';
import { createHmac } from 'crypto';
import Busboy from 'busboy';

// Désactiver le body parser Vercel — Mailgun envoie du multipart/form-data
export const config = { api: { bodyParser: false } };

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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
  "portal_name": "seloger | leboncoin | bienici | pap | logicimmo | meilleursagents | autre" | null
}

RÈGLES :
- is_visit_request = true si c'est un message d'un portail concernant un bien (demande de visite, demande d'info, nouveau message, prise de contact)
- is_visit_request = false UNIQUEMENT pour les newsletters, rapports de stats, confirmations de publication, pubs
- En cas de doute, mets is_visit_request = true (mieux vaut un faux positif qu'un faux négatif)
- Détecte le portail depuis l'objet, l'expéditeur ou le contenu
- Le téléphone doit être au format français (06/07) avec espaces
- property_price en nombre entier sans symbole
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
    if (!parsed.property_address && !parsed.property_type) return null;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: sellers } = await supabaseAdmin
        .from('sellers')
        .select('id, first_name, last_name, address, property_type, budget')
        .eq('user_id', userId)
        .in('status', ['estimation', 'mandat', 'commercialisation', 'offre']);

    if (!sellers || sellers.length === 0) return null;

    // Matching par adresse (mots communs significatifs)
    if (parsed.property_address) {
        const searchWords = normalizeAddress(parsed.property_address);
        let bestMatch = null;
        let bestScore = 0;

        for (const seller of sellers) {
            if (!seller.address) continue;
            const sellerWords = normalizeAddress(seller.address);
            const common = searchWords.filter(w => sellerWords.includes(w));
            const score = common.length / Math.max(searchWords.length, 1);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = seller;
            }
        }

        if (bestMatch && bestScore >= 0.6) {
            return { id: bestMatch.id, confidence: bestScore >= 0.8 ? 'high' : 'medium' };
        }
    }

    // Fallback : type + prix à ±10%
    if (parsed.property_type && parsed.property_price) {
        const priceMargin = parsed.property_price * 0.1;
        const match = sellers.find(s => {
            if (!s.property_type || !s.budget) return false;
            const typeMatch = s.property_type.toLowerCase().includes(parsed.property_type.toLowerCase());
            const priceMatch = Math.abs(s.budget - parsed.property_price) <= priceMargin;
            return typeMatch && priceMatch;
        });

        if (match) return { id: match.id, confidence: 'low' };
    }

    return null;
}

function normalizeAddress(address) {
    return address
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !ADDRESS_STOP_WORDS.has(w));
}
