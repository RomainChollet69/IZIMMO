export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { headers, sampleRows } = req.body;
    if (!headers || !Array.isArray(headers)) return res.status(400).json({ error: 'Missing headers' });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                messages: [{
                    role: 'user',
                    content: `Tu es un assistant qui mappe les colonnes d'un fichier Excel vers les champs d'un CRM immobilier.
Le fichier peut provenir d'une PIGE IMMOBILIÈRE (prospection téléphonique de biens en vente).

Champs CRM disponibles :
- first_name : prénom du propriétaire / vendeur
- last_name : nom de famille du propriétaire / vendeur
- full_name : nom complet (si prénom et nom sont dans la même colonne)
- phone : téléphone (principal, portable, domicile, propriétaire)
- email : email
- address : adresse du bien (rue, numéro de rue)
- postal_code : code postal (CP)
- city : ville / commune
- description : description du bien
- budget : prix / estimation / budget / prix de vente / prix affiché
- source : source du lead (pige, recommandation, etc.)
- notes : notes / commentaires / observations générales
- date : date de contact / date de création / date de pige / date de parution
- reminder : date de relance / date de rappel
- property_type : type de bien (appartement, maison, terrain, immeuble)
- surface : surface en m² (surface habitable)
- rooms : nombre de pièces (T1, T2, 3 pièces, etc.)
- status : statut du lead / température / avancement / colonne pipeline
- contact_note : colonnes d'historique de contacts (1er contact, 2ème contact, 3ème contact, relance 1, relance 2, suivi, commentaire contact, résultat appel, etc.). Plusieurs colonnes peuvent être mappées sur contact_note.
- ignore : colonne à ignorer (non pertinente : numéro de ligne, référence annonce, lien URL, photo, agence, etc.)

RÈGLES DE MAPPING POUR LA PIGE :
- "Nom", "NOM", "Propriétaire", "Vendeur" → last_name (pas full_name, sauf si les données montrent prénom+nom)
- "Prénom" → first_name
- "NOM / PRENOM", "Nom / Prénom", "Nom Prénom", "NOM PRENOM" → full_name (prénom+nom dans la même colonne)
- "Tel", "Tél", "Téléphone", "Tel propriétaire", "Mobile", "Portable" → phone
- "TEL / MOBILE", "Tel / Mobile", "Tel/Mobile", "Tél/Portable" → phone
- "Adresse", "Rue" → address
- "ADRESSE DU BIEN", "Adresse du bien", "Adresse bien" → address
- "CP", "Code postal" → postal_code
- "Ville", "VILLE", "Commune", "Localisation", "Secteur" → city
- "Prix", "Prix affiché", "Estimation", "Prix de vente", "Montant" → budget
- "Surface", "m²", "M2", "Surf.", "Surface habitable", "TAILLE", "Taille" → surface
- "Pièces", "Nb pièces", "Type", "T1/T2/T3..." → rooms
- "Type de bien", "Nature", "Catégorie" → property_type
- "1er contact", "2ème contact", "3ème contact", "Contact 1", "Contact 2", "Relance", "Suivi", "Résultat", "Commentaire", "Historique", "RDV", "Action" → contact_note
- "commentaires plus", "Commentaires plus", "Commentaires", "observations" → contact_note
- "date dernière appel", "Date dernier appel", "Date dernier contact" → contact_note
- "Date", "Date de parution", "Date annonce", "Mise en vente", "Date de pige" → date
- "Statut", "État", "Avancement", "Résultat final" → status
- "Source", "Provenance", "Origine" → source
- "Ref", "Référence", "N°", "Lien", "URL", "Photo", "Agence", "Mandataire", "Prix/m²", "formule automatique" → ignore
- Les colonnes contenant "Caractéristiques" ou "qui expliquent" → description
- "COMMENTAIRE" (singulier, sans précision) → description (description générale du bien)
- "Numéro" (quand il contient des numéros de téléphone) → phone
- "Typologie" ou "Nb pièces" → rooms

Colonnes du fichier Excel : ${JSON.stringify(headers)}

Exemples de données (premières lignes) :
${(sampleRows || []).slice(0, 3).map((row, i) => `Ligne ${i + 1}: ${JSON.stringify(row)}`).join('\n')}

Retourne UNIQUEMENT un JSON valide. Pour chaque colonne Excel, indique le champ CRM correspondant.
Format : { "colonne_excel": "champ_crm", ... }
Si tu n'es pas sûr, mets "ignore".`
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.error('Claude API error:', response.status);
            return res.status(502).json({ error: 'Mapping failed' });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.status(400).json({ error: 'Mapping failed' });

        return res.status(200).json(JSON.parse(jsonMatch[0]));
    } catch (err) {
        if (err.name === 'AbortError') return res.status(504).json({ error: 'Mapping timeout' });
        console.error('Map-columns error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}
