/**
 * scrape-listing.js
 * Scrape une URL d'annonce immobilière.
 * Mode 'preview' : extraction rapide OG tags (photo + titre), sans IA (~1-2s).
 * Mode par défaut : extraction complète via Claude Haiku (agency, price, etc.).
 * Dépendances : _auth.js (verifyAuth, withCORS)
 */
import { verifyAuth, withCORS } from './_auth.js';

// --- Extraction OG tags via regex ---

function extractMeta(html, property) {
    const patterns = [
        new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'),
        new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, 'i'),
    ];
    for (const p of patterns) {
        const m = html.match(p);
        if (m) return m[1].trim();
    }
    return null;
}

function extractTitle(html) {
    const ogTitle = extractMeta(html, 'og:title');
    if (ogTitle) return ogTitle;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
}

function extractImage(html) {
    return extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || null;
}

// --- Fallbacks spécifiques par domaine (pour le mode preview) ---

const DOMAIN_FALLBACKS = {
    'efficity.com': efficityFallback,
};

function efficityFallback(url) {
    // URL: /achat-immobilier/maison_96-m2_lyon_69009_28165417/
    const idMatch = url.match(/[_-](\d{6,})\/?(?:\?.*)?$/);
    if (!idMatch) return { image_url: null, title: null };
    const listingId = idMatch[1];
    const image_url = `https://d1q967606ga7w2.cloudfront.net/common/house/${listingId}/photos/xxl/2.png`;
    let title = null;
    const pathMatch = url.match(/\/([^/]+)_(\d+)\/?(?:\?.*)?$/);
    if (pathMatch) {
        title = pathMatch[1]
            .replace(/-/g, ' ')
            .replace(/_/g, ' ')
            .replace(/\bm2\b/gi, 'm²')
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
    }
    return { image_url, title };
}

function getDomainFallback(url) {
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        for (const [domain, handler] of Object.entries(DOMAIN_FALLBACKS)) {
            if (hostname.includes(domain)) return handler(url);
        }
    } catch (e) { /* URL invalide */ }
    return null;
}

function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return null; }
}

// --- Handler principal ---

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const { url, mode } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL manquante' });

    // Mode 'preview' : extraction rapide OG tags, pas d'IA
    if (mode === 'preview') {
        return handlePreview(req, res, url);
    }

    // Mode par défaut : extraction complète via Claude Haiku
    return handleFullScrape(req, res, url);
}

// --- Mode preview : OG tags + fallback domaine ---

async function handlePreview(req, res, url) {
    const domain = extractDomain(url);

    try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 8000);

        const pageResp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'fr-FR,fr;q=0.9'
            },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(fetchTimeout);

        if (!pageResp.ok) {
            const fallback = getDomainFallback(url);
            if (fallback) return res.status(200).json({ ...fallback, domain });
            return res.status(200).json({ image_url: null, title: null, domain, error: 'inaccessible' });
        }

        const html = (await pageResp.text()).substring(0, 30000);
        let image_url = extractImage(html);
        let title = extractTitle(html);

        // Normaliser les URLs relatives/protocol-relative
        if (image_url) {
            if (image_url.startsWith('//')) image_url = 'https:' + image_url;
            else if (image_url.startsWith('/')) {
                try { image_url = new URL(image_url, url).href; } catch (e) { /* ignore */ }
            }
        }

        // Fallback domaine si pas d'OG tags
        if (!image_url && !title) {
            const fallback = getDomainFallback(url);
            if (fallback) return res.status(200).json({ ...fallback, domain });
        }

        return res.status(200).json({ image_url, title, domain });

    } catch (err) {
        const fallback = getDomainFallback(url);
        if (err.name === 'AbortError') {
            if (fallback) return res.status(200).json({ ...fallback, domain });
            return res.status(200).json({ image_url: null, title: null, domain, error: 'timeout' });
        }
        console.error('[LinkPreview] Error:', err.message);
        if (fallback) return res.status(200).json({ ...fallback, domain });
        return res.status(200).json({ image_url: null, title: null, domain, error: err.message });
    }
}

// --- Mode full scrape : extraction IA via Claude Haiku ---

async function handleFullScrape(req, res, url) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    try {
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
        if (html.length > 15000) html = html.substring(0, 15000);

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
