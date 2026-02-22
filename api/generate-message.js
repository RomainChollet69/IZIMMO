import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req, res) {
    // CORS
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

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
        relance_estimation: "Relancer le vendeur après l'envoi d'une estimation sans retour de sa part",
        proposition_baisse: "Proposer une baisse de prix au vendeur pour dynamiser les visites",
        point_visites: "Faire un point sur les visites effectuées sur le bien",
        anniversaire_mandat: "Marquer l'anniversaire du mandat et faire un bilan",
        bonne_nouvelle: "Annoncer une bonne nouvelle (offre reçue, visite très intéressante...)",
        remerciement: "Remercier le vendeur (après signature, pour sa confiance...)",
        mandat_signe: "Féliciter le vendeur pour la signature du mandat et confirmer les prochaines étapes",
        demande_avis: "Demander un avis Google au client après une vente réussie, de manière chaleureuse et non insistante",
        relance_recommandation: "Prendre des nouvelles du client et lui demander s'il connaît quelqu'un qui souhaite vendre ou acheter (3 ou 6 mois après la transaction)",
        suivi_acquereur_pret: "Prendre des nouvelles du financement de l'acquéreur (prêt bancaire) après une vente",
        relance_fin_mandat_concurrent: "Contacter un vendeur dont le mandat chez un agent concurrent arrive probablement à échéance, avec tact et professionnalisme",
        redaction_annonce: "Rédiger une annonce immobilière complète et attractive pour ce bien. Structure : titre accrocheur, description engageante, points forts, informations pratiques (surface, pièces, DPE si dispo). Ne PAS formater comme un message de communication mais comme une vraie annonce immobilière",
        repositionnement_prix: "Préparer un argumentaire de repositionnement prix pour le vendeur. S'appuyer sur les principes de Shift de Gary Keller : la fenêtre d'opportunité (première impression cruciale), le coût de la surévaluation (plus on attend, plus on perd), le concept des deux marchés (biens positionnés pour se vendre vs ceux qui stagnent). Être empathique mais factuel, utiliser les données fournies dans les instructions supplémentaires",
        libre: "Message libre selon les instructions de l'utilisateur"
    };

    const buyerScenarios = {
        confirmation_visite: "Confirmer un rendez-vous de visite d'un bien avec l'acquéreur",
        envoi_bien: "Envoyer les détails d'un bien correspondant à la recherche de l'acquéreur",
        retour_visite: "Demander un retour / ressenti après une visite",
        relance: "Relancer l'acquéreur qui n'a pas donné suite",
        point_recherche: "Faire un point sur l'avancement de la recherche immobilière",
        bonne_nouvelle: "Annoncer une bonne nouvelle (nouveau bien correspondant, offre acceptée...)",
        felicitations_achat: "Féliciter chaleureusement l'acquéreur pour son achat immobilier",
        selection_biens: "Envoyer une sélection de biens correspondant aux critères de recherche de l'acquéreur",
        demande_avis: "Demander un avis Google à l'acquéreur après une transaction réussie, de manière chaleureuse",
        relance_recommandation: "Prendre des nouvelles de l'acquéreur et lui demander s'il connaît quelqu'un qui cherche ou vend un bien",
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

    const isAnnonce = scenario === 'redaction_annonce';
    const isArgPrix = scenario === 'repositionnement_prix';

    let systemPrompt;
    if (isAnnonce) {
        systemPrompt = `Tu es un expert en rédaction d'annonces immobilières. Tu rédiges des annonces attractives et complètes pour un agent immobilier professionnel.

Règles:
- Structure l'annonce : titre accrocheur (1 ligne), description engageante (2-3 paragraphes), points forts en puces, informations pratiques
- Utilise les informations du bien (adresse, surface, pièces, prix, type) pour personnaliser
- Sois vendeur mais honnête — pas de superlatifs excessifs
- Ne mets JAMAIS de placeholder entre crochets [xxx] — utilise les vraies informations ou omets le détail
- Retourne UNIQUEMENT l'annonce, sans explication ni commentaire`;
    } else if (isArgPrix) {
        systemPrompt = `Tu es un consultant expert en stratégie de prix immobilier, inspiré des principes de Shift de Gary Keller. Tu prépares des argumentaires de repositionnement prix pour aider un agent immobilier à convaincre son vendeur.

Règles:
- Structure l'argumentaire : constat factuel, analyse du marché, recommandation, bénéfices pour le vendeur
- Cite les principes clés : fenêtre d'opportunité, coût de la surévaluation, concept des deux marchés
- Sois empathique mais factuel — pas de culpabilisation du vendeur
- Utilise les données chiffrées fournies dans le contexte
- Ne mets JAMAIS de placeholder entre crochets [xxx]
- Retourne UNIQUEMENT l'argumentaire, sans explication`;
    } else {
        systemPrompt = `Tu es un assistant de rédaction pour un agent immobilier professionnel. Tu rédiges des messages personnalisés pour ses clients.

Règles:
- ${channelInstructions[channel] || channelInstructions.sms}
- Utilise les informations du contact pour personnaliser le message (prénom, adresse, prix, etc.)
- Sois professionnel mais chaleureux
- Ne mets JAMAIS de placeholder entre crochets [xxx] — utilise les vraies informations ou omets le détail
- Si une info n'est pas disponible, formule autrement sans placeholder
- Retourne UNIQUEMENT le message, sans explication ni commentaire`;
    }

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
