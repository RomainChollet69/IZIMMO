/**
 * google-auth-callback.js
 * Endpoint GET — redirect OAuth Google.
 * Vérifie le nonce CSRF, échange le code pour des tokens, stocke dans user_integrations.
 * Redirige vers parametres.html avec un query param de résultat.
 * Dépendances : _auth.js (getSupabaseAdmin)
 */

import { getSupabaseAdmin } from './_auth.js';

const PARAMETRES_URL = '/parametres.html';

export default async function handler(req, res) {
    // CORS minimal pour un endpoint de redirection
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'GET') {
        return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=method_not_allowed`);
    }

    const { code, state, error: oauthError } = req.query;

    // L'utilisateur a refusé l'autorisation
    if (oauthError) {
        console.error('[GoogleAuthCallback] OAuth error:', oauthError);
        return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=access_denied`);
    }

    if (!code || !state) {
        console.error('[GoogleAuthCallback] Code ou state manquant');
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
            console.error('[GoogleAuthCallback] Nonce invalide ou expiré:', state);
            return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=invalid_state`);
        }

        // Vérifier l'expiration (15 minutes)
        const nonceAge = Date.now() - new Date(oauthState.created_at).getTime();
        const MAX_NONCE_AGE_MS = 15 * 60 * 1000;
        if (nonceAge > MAX_NONCE_AGE_MS) {
            console.error('[GoogleAuthCallback] Nonce expiré:', nonceAge, 'ms');
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
            console.error('[GoogleAuthCallback] Échec échange token:', tokenData);
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
            console.warn('[GoogleAuthCallback] Impossible de récupérer l\'email Google:', e.message);
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
            console.error('[GoogleAuthCallback] Erreur upsert:', upsertError);
            return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=storage_failed`);
        }

        console.log('[GoogleAuthCallback] Calendar connecté pour user:', userId);
        return res.redirect(302, `${PARAMETRES_URL}?calendar=connected`);

    } catch (err) {
        console.error('[GoogleAuthCallback] Erreur inattendue:', err);
        return res.redirect(302, `${PARAMETRES_URL}?calendar=error&reason=internal_error`);
    }
}
