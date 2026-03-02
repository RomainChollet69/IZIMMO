/**
 * parse-import-batch.js
 * Gère l'import CSV/Excel : mapping de colonnes IA (action=map-columns)
 * et parsing de lignes en leads structurés (action par défaut).
 * Dépendances : lib/auth.js (verifyAuth, withCORS)
 */
import { verifyAuth, withCORS } from '../lib/auth.js';

export default async function handler(req, res) {
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    // Route vers le sous-handler approprié
    const { action } = req.body || {};
    if (action === 'map-columns') return handleMapColumns(req, res, apiKey);
    return handleParseBatch(req, res, apiKey);
}

// ========== ACTION : map-columns ==========
async function handleMapColumns(req, res, apiKey) {
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
            console.error('[MapColumns] Claude API error:', response.status);
            return res.status(502).json({ error: 'Mapping failed' });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.status(400).json({ error: 'Mapping failed' });

        return res.status(200).json(JSON.parse(jsonMatch[0]));
    } catch (err) {
        if (err.name === 'AbortError') return res.status(504).json({ error: 'Mapping timeout' });
        console.error('[MapColumns] error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

// ========== ACTION : parse-batch (défaut) ==========
async function handleParseBatch(req, res, apiKey) {
    const { headers, rows, leadType } = req.body || {};
    if (!headers || !rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: 'Missing headers or rows' });
    }

    const isSeller = leadType === 'sellers';

    const fieldsBlock = isSeller ? `
- "first_name": string ou null — prénom (retirer civilité Mme/Mr/M./Monsieur/Madame)
- "last_name": string ou null — nom de famille
- "phone": string ou null — téléphone au format "06 12 34 56 78" (reformater si nécessaire)
- "email": string ou null
- "address": string ou null — adresse du bien (combiner rue + CP + ville si colonnes séparées)
- "description": string ou null — description du bien
- "budget": number ou null — prix en euros (nombre pur). "250K" ou "250k€" = 250000, "1.2M" = 1200000
- "source": string ou null — parmi "pige", "recommandation", "boitage", "boucheaoreille", "siteimmo", "efficity", "autre"
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "surface": number ou null — surface en m² (nombre pur). "128m2" → 128, "T3-88m2" → 88
- "date": string ou null — date au format "YYYY-MM-DD" (convertir depuis tout format)
- "reminder": string ou null — date de relance au format "YYYY-MM-DD"
- "status": string ou null — parmi "hot", "warm", "cold", "off_market", "mandate", "competitor", "sold", "lost"
- "notes": string ou null — informations complémentaires, commentaires généraux
- "contact_notes": array de strings ou null — historique de contacts (chaque entrée = "[Nom colonne] contenu")` : `
- "first_name": string ou null — prénom (retirer civilité)
- "last_name": string ou null — nom de famille
- "phone": string ou null — téléphone au format "06 12 34 56 78"
- "email": string ou null
- "budget_min": number ou null — budget minimum en euros
- "budget_max": number ou null — budget maximum en euros
- "source": string ou null — parmi "site_annonce", "efficity", "recommandation", "appel_entrant", "reseaux_sociaux", "autre"
- "property_type": string ou null — parmi "appartement", "maison", "terrain", "immeuble"
- "surface_min": number ou null — surface minimum recherchée en m²
- "rooms": string ou null — nombre de pièces (T1, T2, T3...)
- "sector": string ou null — ville, quartier ou code postal recherché
- "status": string ou null — parmi "new", "active", "offer", "closed"
- "notes": string ou null — informations complémentaires
- "contact_notes": array de strings ou null — historique de contacts`;

    const statusRules = isSeller ? `
Pour le status, déduis à partir des notes/commentaires :
- "chaud", "intéressé", "RDV", "urgent", "très intéressé", "à rappeler" → "hot"
- "tiède", "moyen", "en cours", "à suivre" → "warm"
- "froid", "NRP", "injoignable", "absent", "long terme" → "cold"
- "off market", "hors mandat", "visitable", "off-market" → "off_market"
- "mandat", "signé", "exclusif" → "mandate"
- "concurrent", "PAP", "autre agence", "pris" → "competitor"
- "vendu", "acte" → "sold"
- "perdu", "refus", "ne vend plus", "DEAD", "décédé", "abandonné" → "lost"
- Si tu ne peux pas déduire → null (le système appliquera le statut par défaut)` : `
Pour le status, déduis à partir des notes/commentaires :
- "nouveau", "récent" → "new"
- "actif", "recherche", "en cours" → "active"
- "offre", "proposition" → "offer"
- "conclu", "signé", "acheté" → "closed"
- Si tu ne peux pas déduire → null`;

    const systemPrompt = `Tu es un assistant qui extrait des leads immobiliers structurés depuis des lignes d'un fichier Excel/CSV.
CONTEXTE : Fichier de ${isSeller ? 'vendeurs (pige immobilière / prospection)' : 'acquéreurs'}.

Pour CHAQUE ligne qui contient des données utiles (au moins un nom ou un téléphone), retourne un objet lead avec ces champs :
${fieldsBlock}

RÈGLES :
- Si une ligne ne contient ni nom ni téléphone exploitable, mets-la dans "ignored" avec la raison
- Reformater les téléphones français : "0612345678" → "06 12 34 56 78"
- Les civilités (Mme, Mr, M., Monsieur, Madame, Mlle) doivent être retirées du nom
- Si prénom et nom sont dans la même cellule, les séparer (dernier mot = nom de famille)
- Les prix avec K/k = ×1000, M/m = ×1000000. "750K€" → 750000, "400K€ 410K€" → 400000 (prendre le premier)
- "en veut 300K€" → 300000. Extraire le nombre même si entouré de texte
- Convertir toute date en YYYY-MM-DD (gérer DD/MM/YYYY, dates Excel sérialisées, formats français abrégés)
- Ne JAMAIS inventer de données. Si un champ n'est pas dans la ligne, mettre null
- IMPORTANT : Pour "notes" et "contact_notes", préserve INTÉGRALEMENT et VERBATIM tout le contenu des cellules. Ne résume JAMAIS, ne tronque JAMAIS, ne sélectionne pas. Chaque ligne de texte doit être conservée mot pour mot dans son intégralité
${statusRules}

Retourne UNIQUEMENT un JSON valide au format :
{
  "leads": [ { "row_index": 0, ... }, { "row_index": 1, ... } ],
  "ignored": [ { "row_index": 2, "reason": "Ligne vide" } ]
}
Le row_index correspond à la position de la ligne dans le batch (0-indexed).`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000);

        const rowsText = rows.map((row, i) => {
            const obj = {};
            headers.forEach((h, idx) => {
                if (row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
                    obj[h] = row[idx];
                }
            });
            return `Ligne ${i}: ${JSON.stringify(obj)}`;
        }).join('\n');

        const userContent = `En-têtes : ${JSON.stringify(headers)}\n\n${rowsText}`;
        console.log(`[parse-import-batch] ${rows.length} rows, prompt ~${userContent.length} chars`);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 16000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Anthropic API error:', response.status, errBody);
            return res.status(502).json({
                error: `API error: ${response.status}`,
                detail: errBody.substring(0, 200)
            });
        }

        const result = await response.json();

        if (!result.content || !result.content[0] || !result.content[0].text) {
            console.error('Unexpected API response:', JSON.stringify(result).substring(0, 500));
            return res.status(502).json({
                error: 'Empty API response',
                detail: JSON.stringify(result).substring(0, 200)
            });
        }

        const content = result.content[0].text;
        console.log(`[parse-import-batch] Response: ${content.length} chars, stop_reason: ${result.stop_reason}`);

        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1];
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            console.error('JSON parse failed. Raw response:', content.substring(0, 500));
            return res.status(400).json({
                error: 'JSON parse failed',
                detail: content.substring(0, 200)
            });
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return res.status(200).json({
            leads: parsed.leads || [],
            ignored: parsed.ignored || []
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Timeout (55s)', detail: 'Batch trop volumineux' });
        }
        console.error('Parse-import-batch error:', err);
        return res.status(500).json({ error: 'Internal error', detail: err.message });
    }
}
