import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export async function verifyAuth(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
}

export function withCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Client Supabase admin (SERVICE_ROLE_KEY) — pour les opérations serveur
// qui ne peuvent pas passer par le token utilisateur (OAuth callback, gestion tokens)
let _supabaseAdmin = null;
export function getSupabaseAdmin() {
    if (!_supabaseAdmin) {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('[Auth] SUPABASE_SERVICE_ROLE_KEY not configured');
        }
        _supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabaseAdmin;
}
