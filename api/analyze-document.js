import { verifyAuth, withCORS } from './_auth.js';

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

    const { fileUrl, fileContent, fileType, leadType } = req.body || {};
    console.log('Request body keys:', Object.keys(req.body || {}));
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

    const extractionPrompt = buildDocPrompt(leadType);

    function buildDocPrompt(lt) {
        return `Tu analyses un document lié à un lead immobilier (${lt === 'buyer' ? 'acquéreur' : 'vendeur'}).
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
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        let messages;

        if (isText) {
            // Text extracted from PDF client-side: send as plain text message
            messages = [{
                role: 'user',
                content: extractionPrompt + '\n\nContenu du document :\n' + fileContent
            }];
        } else if (isImage) {
            // Get base64 content
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
            // PDF via document content type
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
        // Only set system prompt for non-text (for text, it's embedded in the user message)
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

        // Extract JSON from response
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
