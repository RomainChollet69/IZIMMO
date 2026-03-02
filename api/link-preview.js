/**
 * link-preview.js
 * Extrait les métadonnées (photo, titre) d'une URL d'annonce immobilière.
 * Stratégie : OG tags → fallback par domaine (Efficity CDN) → null gracieux.
 * Pas d'IA — extraction déterministe par regex (~1-2s).
 */
import { verifyAuth, withCORS } from './_auth.js';

// --- Extraction OG tags via regex (pas besoin de DOM parser) ---

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
    const ogImage = extractMeta(html, 'og:image');
    if (ogImage) return ogImage;
    // Fallback : twitter:image
    const twitterImage = extractMeta(html, 'twitter:image');
    if (twitterImage) return twitterImage;
    return null;
}

// --- Fallbacks spécifiques par domaine ---

const DOMAIN_FALLBACKS = {
    'efficity.com': efficityFallback,
};

function efficityFallback(url) {
    // URL pattern: /achat-immobilier/maison_96-m2_lyon_69009_28165417/
    // Extraire l'ID listing (dernier nombre de 6+ chiffres dans le path)
    const idMatch = url.match(/[_-](\d{6,})\/?(?:\?.*)?$/);
    if (!idMatch) return { image_url: null, title: null };

    const listingId = idMatch[1];

    // Construire l'URL image depuis le CDN Efficity
    const image_url = `https://d1q967606ga7w2.cloudfront.net/common/house/${listingId}/photos/xxl/2.png`;

    // Extraire un titre depuis le path URL
    // /achat-immobilier/maison_96-m2_lyon_69009_28165417/ → "Maison 96 m² Lyon 69009"
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
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch (e) {
        return null;
    }
}

// --- Handler principal ---

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL manquante' });

    const domain = extractDomain(url);

    try {
        // 1. Tenter le fetch HTML
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
            // Page inaccessible (403, 404, etc.) → tenter fallback domaine
            const fallback = getDomainFallback(url);
            if (fallback) {
                return res.status(200).json({ ...fallback, domain });
            }
            return res.status(200).json({ image_url: null, title: null, domain, error: 'inaccessible' });
        }

        // 2. Lire le HTML (limité à 30KB pour les meta tags dans le <head>)
        const html = (await pageResp.text()).substring(0, 30000);

        // 3. Extraire OG tags
        let image_url = extractImage(html);
        let title = extractTitle(html);

        // Normaliser les URLs relatives/protocol-relative
        if (image_url) {
            if (image_url.startsWith('//')) image_url = 'https:' + image_url;
            else if (image_url.startsWith('/')) {
                try { image_url = new URL(image_url, url).href; } catch (e) { /* ignore */ }
            }
        }

        // 4. Si pas d'OG tags trouvés → fallback domaine
        if (!image_url && !title) {
            const fallback = getDomainFallback(url);
            if (fallback) {
                return res.status(200).json({ ...fallback, domain });
            }
        }

        return res.status(200).json({ image_url, title, domain });

    } catch (err) {
        // Timeout ou erreur réseau → tenter fallback domaine
        if (err.name === 'AbortError') {
            const fallback = getDomainFallback(url);
            if (fallback) return res.status(200).json({ ...fallback, domain });
            return res.status(200).json({ image_url: null, title: null, domain, error: 'timeout' });
        }
        console.error('[LinkPreview] Error:', err.message);
        const fallback = getDomainFallback(url);
        if (fallback) return res.status(200).json({ ...fallback, domain });
        return res.status(200).json({ image_url: null, title: null, domain, error: err.message });
    }
}
