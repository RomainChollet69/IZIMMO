/**
 * analyze-document.js
 * Analyse de documents (PDF, images, texte) pour extraction de données de leads.
 * Mode standard : extraction depuis un document joint à un lead existant.
 * Mode screenshot_import : extraction depuis une capture d'écran de plateforme immobilière (SeLoger, LBC, Jinka...).
 * Dépendances : _auth.js (verifyAuth, withCORS)
 */

import { verifyAuth, withCORS } from './_auth.js';

/* ─── Prompts pour le mode screenshot_import ─── */

const SCREENSHOT_SELLER_PROMPT = `Tu analyses une capture d'écran ou un texte copié depuis une plateforme immobilière française (SeLoger, LeBonCoin, BienIci, Jinka, Efficity, Logic-Immo, PAP, MeilleursAgents, etc.).

CONTEXTE : L'utilisateur est un agent immobilier qui reçoit des alertes/emails de ces plateformes concernant des propriétaires qui vendent un bien ou des demandes liées à un bien en vente. Il fait une capture d'écran ou copie le texte et veut créer un lead vendeur.

IMPORTANT : retourne UNIQUEMENT les informations explicitement visibles. Ne JAMAIS inventer.

Retourne un JSON avec ces champs :
- "first_name": string ou null
- "last_name": string ou null
- "phone": string ou null (format français : 06 12 34 56 78)
- "email": string ou null
- "address": string ou null — adresse complète du bien
- "city": string ou null — ville seule
- "postal_code": string ou null — code postal seul
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "surface": number ou null — en m²
- "rooms": string ou null — nombre de pièces (ex: "4 pièces", "T3")
- "budget": number ou null — prix en euros (nombre pur sans € ni espace)
- "description": string ou null — description physique courte du bien
- "annexes": array ou null — parmi ["parking", "cave", "balcon", "terrasse", "jardin", "garage", "piscine", "ascenseur"]
- "source": string ou null — déterminée par la plateforme détectée :
  - Si SeLoger, LeBonCoin, BienIci, Logic-Immo, Jinka, PAP, MeilleursAgents → "siteimmo"
  - Si Efficity → "efficity"
  - Si pige mentionnée → "pige"
  - Sinon → "internet"
- "source_platform": string ou null — nom exact de la plateforme en minuscules (seloger, leboncoin, bienici, jinka, efficity, logic-immo, pap, meilleursagents)
- "notes": string ou null — infos complémentaires (référence annonce, DPE, message de l'acquéreur, remarques)
- "listing_url": string ou null — URL de l'annonce si visible

DÉTECTION DE PLATEFORME :
- Cherche les logos, noms de domaine, mises en page caractéristiques
- SeLoger / MySeLogerPro : logo bleu/blanc, "seloger.com", "MySeLogerPro"
- LeBonCoin : logo orange, "leboncoin.fr"
- Jinka : logo violet, "jinka.fr"
- Efficity : logo vert, "efficity.com"
- BienIci : logo bleu, "bienici.com"
- Logic-Immo : "logic-immo.com"

EXTRACTION DE CONTACTS :
- Souvent le nom du vendeur n'est PAS visible (caché derrière "Contacter")
- Le numéro de téléphone peut être partiellement masqué
- Extrais ce qui est visible, mets null pour le reste
- Ne confonds PAS le nom de l'agence/agent avec le nom du vendeur/acquéreur
- S'il y a un message d'un acquéreur intéressé, extrais son nom et email comme contact principal

Retourne UNIQUEMENT le JSON, sans commentaire.`;

const SCREENSHOT_BUYER_PROMPT = `Tu analyses une capture d'écran ou un texte copié depuis une plateforme immobilière française (SeLoger, LeBonCoin, BienIci, Jinka, Efficity, Logic-Immo, PAP, etc.).

CONTEXTE : L'utilisateur est un agent immobilier qui reçoit des demandes d'acquéreurs via ces plateformes (demandes d'information, demandes de visite, critères de recherche). Il fait une capture d'écran ou copie le texte et veut créer un lead acquéreur.

IMPORTANT : retourne UNIQUEMENT les informations explicitement visibles. Ne JAMAIS inventer.

Retourne un JSON avec ces champs :
- "first_name": string ou null
- "last_name": string ou null
- "phone": string ou null (format français : 06 12 34 56 78)
- "email": string ou null
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "rooms": string ou null — parmi "T1", "T2", "T3", "T4", "T5+"
- "sector": string ou null — ville(s) ou quartier(s) recherché(s), séparés par des virgules
- "surface_min": number ou null — surface minimum en m²
- "budget_max": number ou null — budget maximum en euros (nombre pur)
- "criteria": array ou null — parmi ["parking", "cave", "balcon", "terrasse", "jardin", "garage", "piscine", "ascenseur"]
- "dealbreakers": string ou null — éléments rédhibitoires mentionnés
- "source": string ou null — déterminée par la plateforme :
  - Si SeLoger, LeBonCoin, BienIci, Logic-Immo, Jinka, PAP → "site_annonce"
  - Si Efficity → "efficity"
  - Sinon → "autre"
- "source_platform": string ou null — nom de la plateforme en minuscules
- "notes": string ou null — infos complémentaires (message de l'acquéreur, référence annonce, remarques)

DÉTECTION DE PLATEFORME :
- Cherche les logos, noms de domaine, mises en page caractéristiques
- SeLoger / MySeLogerPro : logo bleu/blanc, "seloger.com", "MySeLogerPro"
- LeBonCoin : logo orange, "leboncoin.fr"
- Jinka : logo violet, "jinka.fr"
- Efficity : logo vert, "efficity.com"
- BienIci : logo bleu, "bienici.com"

EXTRACTION INTELLIGENTE :
- Si la capture montre une demande de visite sur un bien précis, extrais les infos du bien (surface, prix, type) comme critères de recherche de l'acquéreur
- Si des critères de recherche sont listés (budget, surface, pièces, localisation), extrais-les directement
- Le "rooms" doit correspondre au format T1/T2/T3/T4/T5+ : si "3 pièces" → "T3", si "4 pièces" → "T4", si "5 pièces ou plus" → "T5+"
- Ne confonds PAS le nom de l'agence avec le nom de l'acquéreur

Retourne UNIQUEMENT le JSON, sans commentaire.`;

/* ─── Handler ─── */

export default async function handler(req, res) {
    // CORS
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('ANTHROPIC_API_KEY not configured');
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const body = req.body || {};
    const { mode, leadType } = body;

    // Mode screenshot_import : extraction depuis capture d'écran ou texte collé
    if (mode === 'screenshot_import') {
        return handleScreenshotImport(req, res, body, apiKey);
    }

    // Mode par défaut : analyse de document (PDF, image, texte)
    return handleDocumentAnalysis(req, res, body, apiKey);
}

/* ─── Mode screenshot_import ─── */

async function handleScreenshotImport(req, res, body, apiKey) {
    const { image, text, imageType, leadType } = body;
    if (!image && !text) {
        return res.status(400).json({ error: 'No image or text provided' });
    }

    const isBuyer = leadType === 'buyer';
    const systemPrompt = isBuyer ? SCREENSHOT_BUYER_PROMPT : SCREENSHOT_SELLER_PROMPT;

    let messages;
    if (image) {
        messages = [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: imageType || 'image/png', data: image } },
                { type: 'text', text: 'Analyse cette capture d\'écran et extrais les informations du lead.' }
            ]
        }];
    } else {
        messages = [{
            role: 'user',
            content: systemPrompt + '\n\nTexte collé :\n' + text
        }];
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const requestBody = {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages
        };
        if (image) requestBody.system = systemPrompt;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[ScreenshotImport] Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Extraction failed', detail: errBody });
        }

        const result = await response.json();
        const content = result.content?.[0]?.text || '{}';

        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        jsonStr = jsonStr.trim();

        const fields = JSON.parse(jsonStr);
        console.log('[ScreenshotImport] Extracted:', Object.keys(fields).filter(k => fields[k] !== null).join(', '));

        return res.status(200).json({ fields });
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Extraction timeout (30s)' });
        }
        console.error('[ScreenshotImport] Error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

/* ─── Mode document (existant) ─── */

async function handleDocumentAnalysis(req, res, body, apiKey) {
    const { fileUrl, fileContent, fileType, leadType } = body;
    console.log('Request body keys:', Object.keys(body));
    console.log('File type:', fileType);
    console.log('File content length:', fileContent?.length);
    console.log('Lead type:', leadType);

    if (!fileUrl && !fileContent) return res.status(400).json({ error: 'No file URL or content provided' });

    const isImage = fileType && fileType.startsWith('image/');
    const isPdf = fileType === 'application/pdf';
    const isText = fileType === 'text/plain';
    if (!isImage && !isPdf && !isText) {
        return res.status(400).json({ error: 'File type not supported: ' + fileType });
    }

    const extractionPrompt = `Tu analyses un document lié à un lead immobilier (${leadType === 'buyer' ? 'acquéreur' : 'vendeur'}).
Extrais UNIQUEMENT les informations présentes dans le document. Retourne un JSON valide.

Champs à extraire :
- first_name (string) : prénom du propriétaire/vendeur (PAS l'agent immobilier qui a fait le rapport)
- last_name (string) : nom du propriétaire/vendeur (PAS l'agent immobilier)
- phone (string) : téléphone du propriétaire (PAS celui de l'agent)
- email (string) : email du propriétaire (PAS celui de l'agent)
- address (string) : adresse complète du bien
- description (string) : description courte (type, pièces, étages, état)
- budget (number) : prix estimé ou prix de vente en euros (nombre entier). Si une fourchette est donnée (ex: "de 750 000 € à 780 000 €"), prendre la moyenne.
- surface (string) : surface habitable en m²
- property_type (string) : "appartement", "maison", "terrain" ou "immeuble"
- annexes (array) : tableau avec les éléments trouvés parmi ces valeurs EXACTES : "parking", "cave", "balcon", "terrasse", "jardin", "garage", "piscine"
  IMPORTANT pour les annexes :
  - Si le document mentionne "piscine" → inclure "piscine"
  - Si le document mentionne "terrain", "verger", "potager", "extérieur" → inclure "jardin"
  - Si le document mentionne "garage" → inclure "garage"
  - Si le document mentionne "parking" ou "place de stationnement" → inclure "parking"
  - Si le document mentionne "cave", "cellier", "sous-sol" → inclure "cave"
  - Si le document mentionne "terrasse" → inclure "terrasse"
  - Si le document mentionne "balcon", "loggia" → inclure "balcon"
- rooms (string) : nombre de pièces ou type (ex: "7 pièces", "T3")
- contact_date (string) : date au format YYYY-MM-DD. Utiliser la date du document/rapport/estimation si présente (ex: "Établi le 07 mars 2025" → "2025-03-07"). Sinon null.
- notes (string) : informations complémentaires importantes qui ne rentrent dans aucun autre champ (état du bien, DPE, points forts, points faibles, chauffage, etc.)

RÈGLES IMPORTANTES :
- Distinguer le PROPRIÉTAIRE (client vendeur) de l'AGENT IMMOBILIER qui a rédigé le rapport. Ne pas confondre leurs coordonnées.
- Si le document est un avis de valeur ou une estimation, le nom en haut avec la photo est souvent l'agent. Le propriétaire est mentionné comme "À la demande de M. XXX".
- Si un champ n'est pas dans le document, mets null.
- Ne JAMAIS inventer d'informations.
- Retourne UNIQUEMENT le JSON, sans commentaire ni explication.`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        let messages;

        if (isText) {
            messages = [{
                role: 'user',
                content: extractionPrompt + '\n\nContenu du document :\n' + fileContent
            }];
        } else if (isImage) {
            let base64;
            if (fileContent) {
                base64 = fileContent;
            } else {
                const fileResp = await fetch(fileUrl);
                if (!fileResp.ok) throw new Error('Failed to fetch file');
                const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
                base64 = fileBuffer.toString('base64');
            }
            messages = [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: fileType, data: base64 } },
                    { type: 'text', text: 'Analyse ce document et extrais les informations structurées.' }
                ]
            }];
        } else {
            let base64;
            if (fileContent) {
                base64 = fileContent;
            } else {
                const fileResp = await fetch(fileUrl);
                if (!fileResp.ok) throw new Error('Failed to fetch file');
                const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
                base64 = fileBuffer.toString('base64');
            }
            messages = [{
                role: 'user',
                content: [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                    { type: 'text', text: 'Analyse ce document et extrais les informations structurées.' }
                ]
            }];
        }

        const requestBody = {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages
        };
        if (!isText) {
            requestBody.system = extractionPrompt;
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeout);

        console.log('Claude response status:', response.status);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Analysis failed', detail: errBody });
        }

        const result = await response.json();
        console.log('Claude response:', JSON.stringify(result).substring(0, 500));
        const content = result.content?.[0]?.text || '{}';

        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        jsonStr = jsonStr.trim();

        const fields = JSON.parse(jsonStr);
        return res.status(200).json({ fields });
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Analysis timeout' });
        }
        console.error('Analyze-document error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
