/**
 * api/submit-form.js
 * Endpoint public pour le formulaire acquéreur (formulaire.html).
 * Insère dans la table buyers avec le service role (bypass RLS).
 * Pas d'auth requise — le formulaire est public.
 */

import { getSupabaseAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const { first_name, last_name, phone } = body;

    if (!first_name || !last_name || !phone) {
        return res.status(400).json({ error: 'first_name, last_name et phone requis' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Construire le buyer
    const buyerData = {
        first_name,
        last_name,
        phone,
        email: body.email || null,
        source: body.source || null,
        property_type: body.property_type || null,
        rooms: body.rooms || null,
        sector: body.sector || null,
        surface_min: body.surface_min ? parseInt(body.surface_min) : null,
        budget_min: body.budget_min ? parseInt(body.budget_min) : null,
        budget_max: body.budget_max ? parseInt(body.budget_max) : null,
        criteria: body.criteria || null,
        bank_approval: body.bank_approval || null,
        timeline: body.timeline || null,
        dealbreakers: body.dealbreakers || null,
        status: 'nouveau'
    };

    // Associer au bon agent
    if (body.user_id) buyerData.user_id = body.user_id;

    const { data, error } = await supabaseAdmin.from('buyers').insert([buyerData]).select();

    if (error) {
        console.error('[SubmitForm] Insert error:', error);
        return res.status(500).json({ error: error.message });
    }

    console.log('[SubmitForm] Buyer créé:', data[0]?.id, first_name, last_name);
    return res.status(200).json({ success: true, id: data[0]?.id });
}
