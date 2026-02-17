export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { channel, scenario, leadData, notes, customPrompt, leadType } = req.body || {};
    if (!channel || !scenario || !leadData) return res.status(400).json({ error: 'Missing required fields' });

    const channelInstructions = {
        sms: "Message SMS court (max 160 caractères si possible, 300 max). Pas d'objet. Style direct et professionnel. Vouvoiement obligatoire.",
        whatsapp: "Message WhatsApp conversationnel mais professionnel. Peut inclure des emojis (modérément). 2-4 phrases max. Vouvoiement obligatoire.",
        email: "Email professionnel avec objet. Format:\nObjet : [objet]\n\n[corps du message]\n\nCordialement,\n[prénom de l'agent si disponible]. Vouvoiement obligatoire."
    };

    const sellerScenarios = {
        confirmation_rdv: "Confirmer un rendez-vous d'estimation avec le vendeur",
        compte_rendu_estimation: "Envoyer un compte-rendu après une estimation du bien",
        relance: "Relancer le vendeur qui n'a pas donné suite depuis un moment",
        proposition_baisse: "Proposer une baisse de prix au vendeur pour dynamiser les visites",
        point_visites: "Faire un point sur les visites effectuées sur le bien",
        anniversaire_mandat: "Marquer l'anniversaire du mandat et faire un bilan",
        bonne_nouvelle: "Annoncer une bonne nouvelle (offre reçue, visite très intéressante...)",
        remerciement: "Remercier le vendeur (après signature, pour sa confiance...)",
        libre: "Message libre selon les instructions de l'utilisateur"
    };

    const buyerScenarios = {
        confirmation_visite: "Confirmer un rendez-vous de visite d'un bien avec l'acquéreur",
        envoi_bien: "Envoyer les détails d'un bien correspondant à la recherche de l'acquéreur",
        retour_visite: "Demander un retour / ressenti après une visite",
        relance: "Relancer l'acquéreur qui n'a pas donné suite",
        point_recherche: "Faire un point sur l'avancement de la recherche immobilière",
        bonne_nouvelle: "Annoncer une bonne nouvelle (nouveau bien correspondant, offre acceptée...)",
        libre: "Message libre selon les instructions de l'utilisateur"
    };

    const scenarios = leadType === 'buyer' ? buyerScenarios : sellerScenarios;
    const scenarioDesc = scenarios[scenario] || scenario;

    // Build lead context
    let leadContext = '';
    if (leadData.first_name) leadContext += `Prénom: ${leadData.first_name}\n`;
    if (leadData.last_name) leadContext += `Nom: ${leadData.last_name}\n`;
    if (leadData.phone) leadContext += `Téléphone: ${leadData.phone}\n`;
    if (leadData.email) leadContext += `Email: ${leadData.email}\n`;
    if (leadData.address) leadContext += `Adresse du bien: ${leadData.address}\n`;
    if (leadData.budget) leadContext += `Prix/Estimation: ${leadData.budget}€\n`;
    if (leadData.property_type) leadContext += `Type de bien: ${leadData.property_type}\n`;
    if (leadData.surface) leadContext += `Surface: ${leadData.surface}m²\n`;
    if (leadData.sector) leadContext += `Secteur recherché: ${leadData.sector}\n`;
    if (leadData.rooms) leadContext += `Pièces: ${leadData.rooms}\n`;
    if (leadData.budget_min) leadContext += `Budget min: ${leadData.budget_min}€\n`;
    if (leadData.budget_max) leadContext += `Budget max: ${leadData.budget_max}€\n`;
    if (leadData.mandate_type) leadContext += `Type de mandat: ${leadData.mandate_type}\n`;
    if (leadData.mandate_price) leadContext += `Prix mandat: ${leadData.mandate_price}€\n`;

    let notesContext = '';
    if (notes && notes.length > 0) {
        notesContext = '\n\nDernières notes sur ce contact:\n' + notes.slice(0, 5).map(n => `- ${n}`).join('\n');
    }

    const systemPrompt = `Tu es un assistant de rédaction pour un agent immobilier professionnel. Tu rédiges des messages personnalisés pour ses clients.

Règles:
- ${channelInstructions[channel] || channelInstructions.sms}
- Utilise les informations du contact pour personnaliser le message (prénom, adresse, prix, etc.)
- Sois professionnel mais chaleureux
- Ne mets JAMAIS de placeholder entre crochets [xxx] — utilise les vraies informations ou omets le détail
- Si une info n'est pas disponible, formule autrement sans placeholder
- Retourne UNIQUEMENT le message, sans explication ni commentaire`;

    const userPrompt = `Contexte du ${leadType === 'buyer' ? 'acquéreur' : 'vendeur'}:\n${leadContext}${notesContext}

Scénario: ${scenarioDesc}${customPrompt ? `\nInstructions supplémentaires: ${customPrompt}` : ''}

Rédige le message en français.`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Generation failed' });
        }

        const result = await response.json();
        const message = result.content?.[0]?.text || '';

        return res.status(200).json({ message });
    } catch (err) {
        if (err.name === 'AbortError') return res.status(504).json({ error: 'Generation timeout' });
        console.error('Generate-message error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
