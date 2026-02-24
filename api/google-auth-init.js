/**
 * google-auth-init.js
 * Génère un nonce CSRF et retourne l'URL d'autorisation Google OAuth.
 * Le nonce est stocké dans oauth_states pour vérification dans le callback.
 * Dépendances : _auth.js (verifyAuth, withCORS, getSupabaseAdmin)
 */

import { verifyAuth, withCORS, getSupabaseAdmin } from './_auth.js';
import crypto from 'crypto';

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
].join(' ');

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;

        if (!clientId || !redirectUri) {
            console.error('[GoogleAuthInit] GOOGLE_CLIENT_ID ou GOOGLE_REDIRECT_URI non configurés');
            return res.status(500).json({ error: 'Google OAuth not configured' });
        }

        const supabaseAdmin = getSupabaseAdmin();

        // Générer un nonce unique
        const nonce = crypto.randomUUID();

        // Nettoyer les anciens nonces de cet utilisateur (> 15 min)
        await supabaseAdmin
            .from('oauth_states')
            .delete()
            .eq('user_id', user.id)
            .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

        // Stocker le nonce
        const { error: insertError } = await supabaseAdmin
            .from('oauth_states')
            .insert({ user_id: user.id, nonce });

        if (insertError) {
            console.error('[GoogleAuthInit] Erreur insertion nonce:', insertError);
            return res.status(500).json({ error: 'Failed to create auth state' });
        }

        // Construire l'URL Google OAuth
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: GOOGLE_SCOPES,
            access_type: 'offline',
            prompt: 'consent',
            state: nonce
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        console.log('[GoogleAuthInit] URL OAuth générée pour user:', user.id);
        return res.status(200).json({ auth_url: authUrl });

    } catch (err) {
        console.error('[GoogleAuthInit] Erreur:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
