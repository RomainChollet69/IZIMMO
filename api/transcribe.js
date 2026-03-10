import { verifyAuth, withCORS } from '../lib/auth.js';

export default async function handler(req, res) {
    // CORS
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('OPENAI_API_KEY not configured');
        return res.status(500).json({ error: 'API key not configured' });
    }

    // Read raw body as buffer
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
        return res.status(400).json({ error: 'No audio data received' });
    }

    // Determine file extension and clean MIME type (strip codec info like ;codecs=opus)
    const rawContentType = req.headers['content-type'] || 'audio/webm';
    const isMP4 = rawContentType.includes('mp4');
    const ext = isMP4 ? 'mp4' : 'webm';
    const cleanMime = isMP4 ? 'audio/mp4' : 'audio/webm';

    console.log(`[Transcribe] Audio received: ${audioBuffer.length} bytes, type: ${rawContentType} → ${cleanMime}`);

    // Prompt Whisper : vocabulaire métier immobilier + communes françaises courantes
    // Ce prompt biaise la transcription vers l'orthographe correcte des noms propres
    const whisperPrompt = [
        // Métier immobilier
        'estimation, mandat, compromis, acte authentique, DPE, diagnostics, honoraires, FAI, net vendeur',
        // Communes Métropole de Lyon & alentours (noms composés problématiques)
        'Saint-Cyr-au-Mont-d\'Or, Saint-Didier-au-Mont-d\'Or, Saint-Romain-au-Mont-d\'Or',
        'Collonges-au-Mont-d\'Or, Couzon-au-Mont-d\'Or, Poleymieux-au-Mont-d\'Or, Curis-au-Mont-d\'Or',
        'Saint-Germain-au-Mont-d\'Or, Limonest, Lissieu, Chasselay, Civrieux-d\'Azergues',
        'Charbonnières-les-Bains, La Tour-de-Salvagny, Marcy-l\'Étoile, Francheville',
        'Tassin-la-Demi-Lune, Écully, Dardilly, Champagne-au-Mont-d\'Or',
        'Sainte-Foy-lès-Lyon, Oullins, Pierre-Bénite, La Mulatière',
        'Caluire-et-Cuire, Rillieux-la-Pape, Sathonay-Camp, Sathonay-Village',
        'Fontaines-sur-Saône, Fontaines-Saint-Martin, Rochetaillée-sur-Saône, Fleurieu-sur-Saône',
        'Neuville-sur-Saône, Albigny-sur-Saône, Genay, Montanay',
        'Villeurbanne, Vaulx-en-Velin, Bron, Vénissieux, Saint-Fons, Meyzieu',
        'Décines-Charpieu, Chassieu, Genas, Saint-Priest, Mions, Corbas',
        'Craponne, Grigny, Givors, Irigny, Vernaison, Charly, Millery',
        'Brignais, Chaponost, Messimy, Thurins, Vaugneray, Pollionnay',
        'Lyon, Villefranche-sur-Saône, L\'Arbresle, Belleville-en-Beaujolais',
        // Autres départements limitrophes
        'Bourgoin-Jallieu, Villefontaine, L\'Isle-d\'Abeau, Saint-Étienne, Vienne, Givors'
    ].join(', ');

    // Build FormData for OpenAI Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: cleanMime });
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'fr');
    formData.append('prompt', whisperPrompt);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[Transcribe] OpenAI error:', response.status, errBody);
            // Retourner le détail de l'erreur OpenAI pour le diagnostic
            let detail = `OpenAI ${response.status}`;
            try {
                const errJson = JSON.parse(errBody);
                detail = errJson.error?.message || detail;
            } catch (_) {
                detail = errBody.substring(0, 200) || detail;
            }
            return res.status(502).json({ error: 'Transcription failed', detail });
        }

        const result = await response.json();
        let text = (result.text || '').trim();

        // Whisper hallucine du texte sur du silence — filtrer les phrases connues
        const WHISPER_HALLUCINATIONS = [
            'sous-titres', 'amara.org', 'merci d\'avoir regardé',
            'thank you for watching', 'subtitles by', 'please subscribe',
            'soustitres', 'sous titres'
        ];
        const textLower = text.toLowerCase();
        if (WHISPER_HALLUCINATIONS.some(h => textLower.includes(h))) {
            console.log('[Transcribe] Hallucination Whisper filtrée:', text);
            text = '';
        }

        return res.status(200).json({ text });
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Transcription timeout' });
        }
        console.error('[Transcribe] Internal error:', err);
        return res.status(500).json({ error: 'Internal error', detail: err.message });
    }
}

export const config = {
    api: {
        bodyParser: false
    }
};
