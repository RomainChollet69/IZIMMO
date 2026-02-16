// Vercel Serverless Function — Scrape listing URL + extract info via Claude Haiku
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL manquante' });
    }

    try {
        // 1. Fetch the listing page
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 10000);

        const pageResp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'fr-FR,fr;q=0.9'
            },
            signal: controller.signal
        });
        clearTimeout(fetchTimeout);

        if (!pageResp.ok) {
            return res.status(200).json({ error: 'Page inaccessible', agency: null, price: null });
        }

        let html = await pageResp.text();
        // Truncate to 15000 chars to stay within API limits
        if (html.length > 15000) html = html.substring(0, 15000);

        // 2. Send to Claude Haiku for extraction
        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                messages: [{
                    role: 'user',
                    content: `Extrais les informations suivantes de cette page d'annonce immobilière. Retourne UNIQUEMENT un JSON valide, sans texte autour.

Champs à extraire :
- agency: nom de l'agence immobilière (string ou null)
- price: prix en nombre entier sans symbole (number ou null)
- description: résumé court de l'annonce en 1-2 phrases (string ou null)
- surface: surface en m² (string ou null, ex: "85 m²")
- date: date de publication au format YYYY-MM-DD (string ou null)
- platform: plateforme (seloger/leboncoin/bienici/pap/autre)

HTML tronqué de la page :
${html}`
                }]
            })
        });

        if (!claudeResp.ok) {
            console.error('Claude API error:', await claudeResp.text());
            return res.status(200).json({ error: 'Extraction échouée', agency: null, price: null });
        }

        const claudeData = await claudeResp.json();
        const text = claudeData.content?.[0]?.text || '{}';

        // Parse JSON from Claude response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(200).json({ error: 'Extraction échouée', agency: null, price: null });
        }

        const extracted = JSON.parse(jsonMatch[0]);
        return res.status(200).json({
            agency: extracted.agency || null,
            price: extracted.price || null,
            description: extracted.description || null,
            surface: extracted.surface || null,
            date: extracted.date || null,
            platform: extracted.platform || null
        });

    } catch (err) {
        console.error('Scrape error:', err);
        return res.status(200).json({ error: err.message, agency: null, price: null });
    }
}
