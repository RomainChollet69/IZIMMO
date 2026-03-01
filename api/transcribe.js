import { verifyAuth, withCORS } from './_auth.js';

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

    // Build FormData for OpenAI Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: cleanMime });
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'fr');

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
        return res.status(200).json({ text: result.text || '' });
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
