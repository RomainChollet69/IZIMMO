/**
 * api/submit-form.js
 * Endpoint public pour le formulaire acquéreur (formulaire.html).
 * Insère dans la table buyers avec le service role (bypass RLS).
 * Pas d'auth requise — le formulaire est public.
 * Envoie une notification email à l'agent quand un formulaire est complété.
 */

import { getSupabaseAdmin } from '../lib/auth.js';
import { sendEmail } from '../lib/mailgun-send.js';

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
        surface_min: body.surface_min && parseInt(body.surface_min) > 0 ? parseInt(body.surface_min) : null,
        budget_max: body.budget_max && parseInt(body.budget_max) > 0 ? parseInt(body.budget_max) : null,
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

    const buyerId = data[0]?.id;
    console.log('[SubmitForm] Buyer créé:', buyerId, first_name, last_name);

    // Notification email à l'agent (non-bloquant)
    if (body.user_id) {
        notifyAgent(supabaseAdmin, body.user_id, { first_name, last_name, phone, email: body.email, property_type: body.property_type, sector: body.sector, budget_max: body.budget_max, surface_min: body.surface_min, criteria: body.criteria, bank_approval: body.bank_approval, timeline: body.timeline }).catch(err => {
            console.error('[SubmitForm] Erreur notification agent:', err.message);
        });
    }

    return res.status(200).json({ success: true, id: buyerId });
}

/**
 * Envoie un email de notification à l'agent quand un acquéreur complète le formulaire.
 */
async function notifyAgent(supabaseAdmin, userId, buyer) {
    // Récupérer l'email de l'agent (dans auth.users) et son nom (dans profiles)
    const [{ data: authData }, { data: profile }] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(userId),
        supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single()
    ]);

    const agentEmail = authData?.user?.email;
    if (!agentEmail) {
        console.log('[SubmitForm] Pas d\'email agent, skip notification');
        return;
    }

    const buyerName = `${buyer.first_name} ${buyer.last_name}`;
    const agentName = profile?.full_name || 'Agent';

    // Construire le résumé des critères
    const criteres = [];
    if (buyer.property_type) criteres.push(`Type : ${buyer.property_type}`);
    if (buyer.sector) criteres.push(`Secteur : ${buyer.sector}`);
    if (buyer.budget_max) criteres.push(`Budget max : ${parseInt(buyer.budget_max).toLocaleString('fr-FR')} €`);
    if (buyer.surface_min) criteres.push(`Surface min : ${buyer.surface_min} m²`);
    if (buyer.criteria) criteres.push(`Critères : ${buyer.criteria}`);
    if (buyer.bank_approval) criteres.push(`Financement : ${buyer.bank_approval}`);
    if (buyer.timeline) criteres.push(`Délai : ${buyer.timeline}`);

    const criteresHtml = criteres.length > 0
        ? criteres.map(c => `<li style="padding:4px 0; color:#334155; font-size:14px">${c}</li>`).join('')
        : '<li style="padding:4px 0; color:#94a3b8; font-size:14px">Aucun critère renseigné</li>';

    const html = `
    <div style="max-width:500px; margin:0 auto; font-family:Inter,Arial,sans-serif; background:#f8fafc; padding:20px">
        <div style="background:white; border-radius:16px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,0.1)">
            <div style="text-align:center; margin-bottom:20px">
                <div style="display:inline-block; width:48px; height:48px; background:#22c55e; border-radius:50%; line-height:48px; font-size:22px; color:white">✓</div>
                <h2 style="margin:12px 0 4px; font-size:18px; font-weight:700; color:#1e293b">Nouveau lead qualifié !</h2>
                <p style="margin:0; font-size:14px; color:#64748b">Un acquéreur a complété le formulaire</p>
            </div>

            <div style="background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:12px; padding:16px; margin-bottom:16px">
                <div style="font-size:16px; font-weight:700; color:#166534">${buyerName}</div>
                <div style="font-size:13px; color:#15803d; margin-top:4px">
                    📞 ${buyer.phone || '—'}${buyer.email ? ' · ✉ ' + buyer.email : ''}
                </div>
            </div>

            <div style="margin-bottom:16px">
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px">Critères de recherche</div>
                <ul style="margin:0; padding:0 0 0 16px; list-style:disc">${criteresHtml}</ul>
            </div>

            <a href="https://www.avecleon.fr/acquereurs.html" style="
                display:block; text-align:center; padding:14px;
                background:linear-gradient(135deg,#667eea,#764ba2);
                color:white; border-radius:12px; text-decoration:none;
                font-size:14px; font-weight:700;
            ">Voir dans le pipeline</a>
        </div>
        <p style="text-align:center; font-size:11px; color:#94a3b8; margin-top:16px">
            Notification envoyée automatiquement par Léon suite à un formulaire complété.
        </p>
    </div>`;

    const domain = process.env.MAILGUN_DOMAIN || 'inbound.avecleon.fr';
    const result = await sendEmail({
        to: agentEmail,
        subject: `🎯 ${buyerName} a complété son formulaire acquéreur`,
        html,
        from: `Léon <noreply@${domain}>`
    });

    if (result.success) {
        console.log(`[SubmitForm] Notification envoyée à ${agentEmail} pour ${buyerName}`);
    } else {
        console.error(`[SubmitForm] Échec notification:`, result.error);
    }
}
