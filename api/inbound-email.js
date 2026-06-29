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
    'myselogerpro.com',          // SeLoger Pro (leads pro)
    'leboncoin.fr',
    'bienici.com',
    'pap.fr',
    'logic-immo.com',
    'logicimmo.com',
    'meilleursagents.com',
    'avendrealouer.fr',
    'ouestfrance-immo.com',
    'paruvendu.fr',
    'paruvendupro.fr',           // ParuVendu Pro
    'green-acres.fr',
    'green-acres.com',
    // Figaro Immobilier & partenaires
    'lefigaro.fr',               // couvre immobilier.lefigaro.fr, proprietes.lefigaro.fr
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

        // 4ter. Ignorer les newsletters / rapports de stats des portails : ce sont des domaines
        //       légitimes (leboncoin, bienici...) mais PAS des demandes de contact. On les écarte
        //       avant Claude (économie d'appel). Pas de flag "transfert toute la boîte" : c'est
        //       bien un portail, juste du bruit marketing.
        if (isPortalNewsletterOrReport(originalFrom, subject)) {
            console.log(`[InboundEmail] Newsletter/rapport portail ignoré: "${subject}" de "${originalFrom}"`);
            return res.status(200).json({ message: 'Portal newsletter/report, ignored' });
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

// Sous-domaines d'envoi de masse (newsletters / notifs marketing), jamais utilisés pour les leads.
// Ex : news.leboncoin.fr (newsletter), newsletter.seloger.com...
const NEWSLETTER_SUBDOMAINS = /(^|\.)(news|newsletter|newsletters|mailing|emailing|communication|mkt|marketing|actu|actualites)\./i;

// Sujets de newsletters / rapports de stats. Les vraies demandes de visite n'ont JAMAIS ces
// formulations (elles disent "vous a contacté", "demande de visite", "souhaite visiter"...).
const NON_LEAD_SUBJECT = /rapport d['’ ]?activit|statistiques? de (publication|diffusion)|bilan (hebdo|de diffusion|d['’ ]?activit)|votre rapport|se d[ée]sabonner|newsletter|nouveaux crit[èe]res d['’ ]?achat|tendances? (immo|du march)|conseils? (pro|immo)|webinaire|offre commerciale/i;

// Newsletter ou rapport de stats d'un portail (légitime côté domaine, mais pas une demande de
// contact). Détection volontairement sûre pour ne jamais écarter une vraie demande.
function isPortalNewsletterOrReport(fromField, subject) {
    const domain = extractSenderDomain(fromField);
    if (domain && NEWSLETTER_SUBDOMAINS.test(domain)) return true;
    if (subject && NON_LEAD_SUBJECT.test(subject)) return true;
    return false;
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
  "property_surface": 88 | null,
  "property_rooms": 4 | null,
  "property_url": "https://www.leboncoin.fr/ad/.../123456789" | null,
  "portal_name": "seloger | leboncoin | bienici | pap | logicimmo | meilleursagents | jinka | autre" | null
}

RÈGLES :
- is_visit_request = true si c'est un message d'un portail concernant un bien (demande de visite, demande d'info, nouveau message, prise de contact, favori)
- is_visit_request = false pour les newsletters, rapports de stats, bilans/rapports d'activité ("Rapport d'activité hebdomadaire", "statistiques de publication/diffusion : X vues, Y favoris"), confirmations de publication, conseils/tendances, pubs et offres commerciales
- En cas de doute SUR UN MESSAGE QUI S'ADRESSE PERSONNELLEMENT AU VENDEUR (un internaute, un nom, un téléphone, "souhaite visiter"), mets is_visit_request = true (mieux vaut un faux positif qu'un faux négatif). Mais un email générique de stats/newsletter (chiffres globaux, "cher partenaire", aucun contact nommé) reste false.
- Détecte le portail depuis l'objet, l'expéditeur ou le contenu
- Le téléphone doit être au format français (06/07) avec espaces
- property_price en nombre entier sans symbole (ex: 515000). IMPORTANT : extrais le prix depuis la description du bien dans l'email (souvent en bas : "Maison 4 pièces 96 m² / 515000 €")
- property_surface : surface en m² (nombre entier, ex: 88). Extrais-la du titre du bien ("Appartement 4 pièces 88 m²" → 88)
- property_rooms : nombre de pièces (nombre entier, ex: 4). Extrais-le du titre ("4 pièces" → 4, "T3" → 3, "studio" → 1)
- property_url : l'URL complète de l'annonce sur le portail si présente (ex: "Lien : https://www.leboncoin.fr/ad/ventes_immobilieres/3151902619"). Garde l'URL telle quelle.
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
    if (!parsed.property_address && !parsed.property_type && !parsed.property_reference
        && !parsed.property_url && !parsed.property_surface) return null;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: sellers } = await supabaseAdmin
        .from('sellers')
        .select('id, first_name, last_name, address, property_type, rooms, surface, budget, mandate_price, mandate_reference, links, portal_references')
        .eq('user_id', userId)
        .in('status', ['mandate', 'commercialisation']); // Ne matcher qu'avec les biens sous mandat

    if (!sellers || sellers.length === 0) return null;

    // Tous les nombres de 6+ chiffres d'une chaîne = identifiants d'annonces portail
    const bigNums = (str) => (typeof str === 'string' ? (str.match(/\d{6,}/g) || []) : []);

    // 0. Matching par identifiant d'annonce (priorité maximale, le plus fiable) :
    //    on compare l'URL de l'annonce ET la référence de l'email aux liens du bien
    //    ET à sa référence de mandat (ex: réf efficity). Même annonce / même réf = match sûr.
    const emailIds = new Set(bigNums(parsed.property_url || ''));
    const reqRefDigits = parsed.property_reference ? parsed.property_reference.replace(/\D/g, '') : '';
    if (reqRefDigits.length >= 5) emailIds.add(reqRefDigits);

    if (emailIds.size > 0) {
        for (const seller of sellers) {
            const sellerIds = (seller.links || []).flatMap(bigNums);
            const mref = (seller.mandate_reference || '').replace(/\D/g, '');
            if (mref.length >= 5) sellerIds.push(mref);
            // Références portail apprises (Réf Pro, identiques sur tous les portails) :
            // signal le plus fiable une fois qu'un match manuel les a renseignées.
            (seller.portal_references || []).forEach(r => {
                const d = String(r).replace(/\D/g, '');
                if (d.length >= 5) sellerIds.push(d);
            });
            if (sellerIds.some(id => emailIds.has(id))) {
                console.log(`[InboundEmail:Match] ID annonce/réf [${[...emailIds].join(',')}] → seller ${seller.id}`);
                return { id: seller.id, confidence: 'high' };
            }
        }
    }

    // 1. Système de points : ville (priorité 1) > surface (2) > prix (3).
    //    On score chaque bien, on prend le meilleur s'il dépasse le seuil ET devance
    //    nettement le 2e (sinon ambigu -> pas de match, l'agent matche à la main).
    const scored = sellers
        .map(s => ({ seller: s, score: scoreSellerForRequest(s, parsed) }))
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
        const best = scored[0];
        const secondScore = scored[1] ? scored[1].score : 0;
        if (best.score >= MATCH_ACCEPT_MIN && (best.score - secondScore) >= MATCH_MARGIN) {
            const confidence = best.score >= MATCH_HIGH_MIN ? 'high' : 'medium';
            console.log(`[InboundEmail:Match] Score ${best.score} (2e: ${secondScore}) → seller ${best.seller.id} [${confidence}]`);
            return { id: best.seller.id, confidence };
        }
    }

    return null;
}

// Normalise un type de bien pour comparaison (appartement / maison / terrain / immeuble / local)
function normalizeType(t) {
    if (!t) return '';
    const s = String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (s.includes('appart') || /\bt\d/.test(s) || s.includes('studio')) return 'appartement';
    if (s.includes('maison') || s.includes('villa')) return 'maison';
    if (s.includes('terrain')) return 'terrain';
    if (s.includes('immeuble')) return 'immeuble';
    if (s.includes('local') || s.includes('commerce') || s.includes('bureau')) return 'local';
    return s.split(/\s+/)[0] || '';
}

// Convertit "299 000 €", "88 m²", "299000" en nombre (0 si vide/illisible)
function toNum(v) {
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

// Extrait le premier entier d'une valeur ("T4" → 4, "4 pièces" → 4)
function toInt(v) {
    if (v == null) return 0;
    const m = String(v).match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
}

// Mots-clés de voie : leur présence signale une vraie adresse (pas juste une ville).
const STREET_KEYWORDS = /\b(rue|avenue|av|bd|boulevard|place|allee|chemin|impasse|cours|passage|route|voie|montee|quai|parc|square|sentier|clos|lotissement|traverse)\b/;

// Une adresse "ville seule" (ex: "Caluire-et-Cuire", "CALUIRE-ET-CUIRE, 69300") n'a ni
// mot de voie ni numéro de rue (1-4 chiffres) : insuffisante pour un match adresse fiable,
// car n'importe quel bien stocké avec sa ville scorerait au maximum. On route alors vers
// le matching ville+prix (étape 2) qui, lui, vérifie le prix.
function addressIsCityOnly(raw) {
    if (!raw) return true;
    const norm = String(raw).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (STREET_KEYWORDS.test(norm)) return false;
    const nums = norm.match(/\d+/g) || [];
    return !nums.some(n => n.length >= 1 && n.length <= 4); // un CP (5 chiffres) ne compte pas
}

// Score de correspondance bien <-> demande (système de points).
// Priorités demandées : VILLE (1) > SURFACE (2) > PRIX (3).
// Le prix est volontairement tolérant : la baisse de prix n'est pas toujours saisie dans
// Léon, donc un prix Léon plus élevé que le portail reste acceptable.
// Le TYPE est un garde-fou strict : un appartement ne matche jamais une maison (-> -1, exclu).
function scoreSellerForRequest(seller, parsed) {
    const rType = normalizeType(parsed.property_type);
    const sType = normalizeType(seller.property_type);
    if (rType && sType && rType !== sType) return -1; // type incompatible = exclu

    let score = 0;

    // --- VILLE (priorité 1, 50 pts) + bonus adresse précise (jusqu'à 25 pts) ---
    if (parsed.property_address && seller.address) {
        const reqNorm = normalizeAddress(parsed.property_address);
        const sellerNorm = normalizeAddress(seller.address);
        const sellerJoined = sellerNorm.join(' ');
        const cpMatch = reqNorm.join(' ').match(/\b(\d{5})\b/);
        const reqCP = cpMatch ? cpMatch[1] : '';
        const cityWords = reqNorm.filter(w => !/^\d+$/.test(w) && w.length > 2);
        const cpOk = reqCP && sellerJoined.includes(reqCP);
        const cityOk = cityWords.length > 0 && cityWords.some(w => sellerJoined.includes(w));
        if (cpOk || cityOk) score += 50;
        // Bonus si l'email porte une vraie adresse (pas juste la ville) qui recoupe le bien
        if (!addressIsCityOnly(parsed.property_address)) {
            const common = reqNorm.filter(w => sellerNorm.includes(w));
            const overlap = Math.max(common.length / Math.max(reqNorm.length, 1), common.length / Math.max(sellerNorm.length, 1));
            score += Math.round(overlap * 25);
        }
    }

    // --- SURFACE (priorité 2, 40 pts) ---
    const rSurf = toNum(parsed.property_surface);
    const sSurf = toNum(seller.surface);
    if (rSurf && sSurf) {
        const d = Math.abs(sSurf - rSurf) / rSurf;
        if (d <= 0.03) score += 40;
        else if (d <= 0.07) score += 28;
        else if (d <= 0.12) score += 15;
    }

    // --- PRIX (priorité 3, 25 pts, tolérant aux baisses non saisies) ---
    const rPrice = toNum(parsed.property_price);
    const sPrice = toNum(seller.budget || seller.mandate_price);
    if (rPrice && sPrice) {
        const ad = Math.abs(sPrice - rPrice) / rPrice;
        if (ad <= 0.03) score += 25;
        else if (ad <= 0.08) score += 18;
        else if (ad <= 0.15) score += 12;
        // Prix Léon plus haut que le portail = baisse probablement non saisie -> on tolère
        else if (sPrice > rPrice && (sPrice - rPrice) / rPrice <= 0.30) score += 8;
    }

    return score;
}

// Seuils d'acceptation du score (sur ~140 max).
const MATCH_ACCEPT_MIN = 60;   // en deça : on ne matche pas (mieux vaut "Aucun bien matché")
const MATCH_HIGH_MIN = 90;     // au dessus : confiance haute
const MATCH_MARGIN = 12;       // écart minimal avec le 2e pour éviter l'ambiguïté

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
