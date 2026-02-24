/**
 * google-auth.js
 * Endpoint unifié OAuth Google Calendar.
 * POST → Génère un nonce CSRF et retourne l'URL d'autorisation.
 * GET  → Callback OAuth : échange code → tokens, stocke dans user_integrations.
 * Dépendances : _auth.js (verifyAuth, withCORS, getSupabaseAdmin)
 */

import { verifyAuth, withCORS, getSupabaseAdmin } from './_auth.js';
import crypto from 'crypto';

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
].join(' ');

const PARAMETRES_URL = '/parametres.html';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return handleCallback(req, res);
    }

    // POST = init
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    return handleInit(req, res);
}

// =================================================================
// POST — Générer nonce + URL OAuth
// =================================================================

async function handleInit(req, res) {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;

        if (!clientId || !redirectUri) {
            console.error('[GoogleAuth] GOOGLE_CLIENT_ID ou GOOGLE_REDIRECT_URI non configurés');
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
            console.error('[GoogleAuth] Erreur insertion nonce:', insertError);
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

        console.log('[GoogleAuth] URL OAuth générée pour user:', user.id);
        return res.status(200).json({ auth_url: authUrl });

    } catch (err) {
        console.error('[GoogleAuth] Erreur init:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

// =================================================================
// GET — Callback OAuth Google (redirect)
// =================================================================

async function handleCallback(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const { code, state, error: oauthError } = req.query;

    // L'utilisateur a refusé l'autorisation
    if (oauthError) {
        console.error('[GoogleAuth] OAuth error:', oauthError);
        return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=access_denied`);
    }

    if (!code || !state) {
        console.error('[GoogleAuth] Code ou state manquant');
        return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=missing_params`);
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();

        // 1. Vérifier le nonce (< 15 minutes, usage unique)
        const { data: oauthState, error: stateError } = await supabaseAdmin
            .from('oauth_states')
            .select('user_id, created_at')
            .eq('nonce', state)
            .single();

        if (stateError || !oauthState) {
            console.error('[GoogleAuth] Nonce invalide ou expiré:', state);
            return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=invalid_state`);
        }

        // Vérifier l'expiration (15 minutes)
        const nonceAge = Date.now() - new Date(oauthState.created_at).getTime();
        const MAX_NONCE_AGE_MS = 15 * 60 * 1000;
        if (nonceAge > MAX_NONCE_AGE_MS) {
            console.error('[GoogleAuth] Nonce expiré:', nonceAge, 'ms');
            await supabaseAdmin.from('oauth_states').delete().eq('nonce', state);
            return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=expired_state`);
        }

        const userId = oauthState.user_id;

        // Supprimer le nonce (usage unique)
        await supabaseAdmin.from('oauth_states').delete().eq('nonce', state);

        // 2. Échanger le code contre des tokens Google
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: process.env.GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('[GoogleAuth] Échec échange token:', tokenData);
            return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=token_exchange_failed`);
        }

        // 3. Récupérer l'email Google (pour affichage dans les paramètres)
        let googleEmail = null;
        try {
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const userInfo = await userInfoResponse.json();
            googleEmail = userInfo.email || null;
        } catch (e) {
            console.warn('[GoogleAuth] Impossible de récupérer l\'email Google:', e.message);
        }

        // 4. Upsert dans user_integrations
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        const { error: upsertError } = await supabaseAdmin
            .from('user_integrations')
            .upsert({
                user_id: userId,
                google_calendar_connected: true,
                google_access_token: tokenData.access_token,
                google_refresh_token: tokenData.refresh_token || null,
                google_token_expires_at: expiresAt,
                google_email: googleEmail
            }, {
                onConflict: 'user_id'
            });

        if (upsertError) {
            console.error('[GoogleAuth] Erreur upsert:', upsertError);
            return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=storage_failed`);
        }

        console.log('[GoogleAuth] Calendar connecté pour user:', userId);
        return res.redirect(302, `${PARAMETRES_URL}?calendar=connected`);

    } catch (err) {
        console.error('[GoogleAuth] Erreur callback:', err);
        return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=internal_error`);
    }
}
