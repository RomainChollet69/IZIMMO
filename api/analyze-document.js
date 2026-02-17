export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('ANTHROPIC_API_KEY not configured');
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { fileUrl, fileType, leadType } = req.body || {};
    if (!fileUrl) return res.status(400).json({ error: 'No file URL provided' });

    const isImage = fileType && fileType.startsWith('image/');
    const isPdf = fileType === 'application/pdf';
    if (!isImage && !isPdf) {
        return res.status(400).json({ error: 'File type not supported for analysis' });
    }

    const isBuyer = leadType === 'buyer';

    const sellerFields = `- first_name, last_name : nom du propriétaire
- phone : téléphone
- email : email
- address : adresse du bien
- property_type : type de bien (appartement/maison/terrain/immeuble)
- surface : surface en m² (nombre seul, ex: 90)
- budget : prix/estimation en euros (nombre seul)
- description : description du bien
- notes : informations complémentaires`;

    const buyerFields = `- first_name, last_name : nom de l'acquéreur
- phone : téléphone
- email : email
- property_type : type de bien recherché (appartement/maison/terrain/immeuble)
- rooms : typologie (T1/T2/T3/T4/T5+)
- sector : secteur/ville recherché
- budget_min, budget_max : fourchette budget en euros (nombres seuls)
- surface_min : surface minimum en m² (nombre seul)
- notes : informations complémentaires`;

    const systemPrompt = `Tu es un assistant qui extrait des informations structurées depuis un document immobilier.
Analyse le document et retourne un JSON avec UNIQUEMENT les champs que tu peux identifier avec certitude.
Ne jamais inventer de données. Si un champ n'est pas présent dans le document, mets null.

Champs à extraire (lead ${isBuyer ? 'acquéreur' : 'vendeur'}) :
${isBuyer ? buyerFields : sellerFields}

Retourne UNIQUEMENT le JSON, sans commentaire ni explication.`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        // Fetch the file from signed URL
        const fileResp = await fetch(fileUrl);
        if (!fileResp.ok) throw new Error('Failed to fetch file');
        const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
        const base64 = fileBuffer.toString('base64');

        let userContent;
        if (isImage) {
            userContent = [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: fileType, data: base64 }
                },
                { type: 'text', text: 'Analyse ce document et extrais les informations structurées.' }
            ];
        } else {
            // PDF via document content type
            userContent = [
                {
                    type: 'document',
                    source: { type: 'base64', media_type: 'application/pdf', data: base64 }
                },
                { type: 'text', text: 'Analyse ce document et extrais les informations structurées.' }
            ];
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Analysis failed' });
        }

        const result = await response.json();
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
