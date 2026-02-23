import { verifyAuth, withCORS } from './_auth.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS
    withCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    // Create authenticated Supabase client with user's JWT token
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        }
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const { mode, platform, user_input, template_override, suggestion_context } = req.body || {};

    if (!platform) {
        return res.status(400).json({ error: 'Platform required' });
    }

    if (mode === 'free_input' && !user_input) {
        return res.status(400).json({ error: 'User input required for free_input mode' });
    }

    try {
        // 1. Load social profile
        const { data: profile, error: profileError } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(400).json({ error: 'Social profile not found. Complete onboarding first.' });
        }

        // 2. Load recent hooks (30 days, same platform, for anti-repetition)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: recentHooks } = await supabase
            .from('social_posts')
            .select('hook, hook_pattern, generated_at')
            .eq('user_id', user.id)
            .eq('platform', platform)
            .gte('generated_at', thirtyDaysAgo)
            .order('generated_at', { ascending: false });

        // 3. Build CRM context
        const crmContext = await buildCRMContext(supabase, user.id);

        // 4. Determine template (for Sprint 1, we don't use calendar templates, just free input)
        const today = getDayInfo();

        // 5. Build system prompt
        const systemPrompt = buildSystemPrompt(profile, today, platform, crmContext, recentHooks || []);

        // 6. Build user prompt
        let userPrompt = '';
        if (mode === 'free_input') {
            userPrompt = `Génère un post ${platform} à partir de ce vécu :\n\n"${user_input}"\n\nRetourne UNIQUEMENT le JSON sans explication.`;
        } else if (mode === 'suggestion' && suggestion_context) {
            // Suggestion mode: generate from CRM suggestion context
            const ctx = suggestion_context;
            userPrompt = `Génère un post ${platform} basé sur cette suggestion CRM :\n\nType : ${ctx.type}\nTitre : ${ctx.title || ''}\nDescription : ${ctx.description || ''}\nDonnées : ${JSON.stringify(ctx.data || {})}\n\nRetourne UNIQUEMENT le JSON sans explication.`;
        } else {
            // Calendar-based suggestions (fallback)
            userPrompt = `Génère le post ${platform} du jour selon les données CRM fournies.\n\nRetourne UNIQUEMENT le JSON sans explication.`;
        }

        // 7. Call Claude Haiku
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[Social] Anthropic error:', response.status, errBody);
            return res.status(502).json({ error: 'Generation failed' });
        }

        const result = await response.json();
        const rawText = result.content?.[0]?.text || '';

        // Parse JSON response
        let postData;
        try {
            // Remove markdown code blocks if present
            const jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            postData = JSON.parse(jsonText);
        } catch (parseErr) {
            console.error('[Social] JSON parse error:', parseErr, 'Raw:', rawText);
            return res.status(500).json({ error: 'Failed to parse AI response' });
        }

        // 8. Save to DB
        const { data: savedPost, error: saveError } = await supabase
            .from('social_posts')
            .insert({
                user_id: user.id,
                category: mode === 'free_input' ? 'user_story' : 'calendar_suggestion',
                platform,
                content: postData.content,
                hook: postData.hook,
                hook_pattern: postData.hook_pattern,
                template_id: null, // Sprint 1: no template
                objective: null,
                format_type: 'post_texte',
                visual_recommendation: postData.visual_recommendation,
                completeness: postData.completeness || {
                    hook_quality: true,
                    local_anchor: true,
                    terrain_proof: true,
                    cta_present: true
                },
                compliance_flags: postData.compliance_flags || {},
                user_edited: false,
                source_type: mode === 'free_input' ? 'user_input' : 'calendar_suggestion',
                source_data: mode === 'free_input' ? { user_input } : {},
                calendar_day: today.jour,
                status: 'draft',
                generated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (saveError) {
            console.error('[Social] Save error:', saveError);
            return res.status(500).json({ error: 'Failed to save post' });
        }

        // Return result with post_id
        return res.status(200).json({
            ...postData,
            post_id: savedPost.id
        });

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Generation timeout' });
        }
        console.error('[Social] Generate error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
}

// ===== CRM CONTEXT BUILDER =====
async function buildCRMContext(supabase, userId) {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const [sales, mandates, visits, notes, sellersCount, buyersCount] = await Promise.all([
            // Recent sales (14 days)
            supabase
                .from('sellers')
                .select('property_type, address, budget, status, last_activity_at')
                .eq('user_id', userId)
                .eq('status', 'sold')
                .gte('last_activity_at', fourteenDaysAgo),

            // Active mandates
            supabase
                .from('sellers')
                .select('property_type, address, budget, mandate_start_date, status')
                .eq('user_id', userId)
                .eq('status', 'mandate'),

            // Recent visits (7 days)
            supabase
                .from('visits')
                .select('created_at, feedback, rating')
                .eq('user_id', userId)
                .gte('created_at', sevenDaysAgo),

            // Recent notes (last 3)
            supabase
                .from('lead_notes')
                .select('content, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(3),

            // Sellers count (30 days)
            supabase
                .from('sellers')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('created_at', thirtyDaysAgo),

            // Buyers count (30 days)
            supabase
                .from('buyers')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('created_at', thirtyDaysAgo)
        ]);

        return {
            recent_sales: sales.data || [],
            active_mandates: mandates.data || [],
            recent_visits: visits.data || [],
            recent_notes: (notes.data || []).map(n => n.content),
            monthly_stats: {
                sales_count: (sales.data || []).length,
                mandates_count: (mandates.data || []).length,
                visits_count: (visits.data || []).length,
                estimations_count: sellersCount.count || 0,
                buyers_count: buyersCount.count || 0
            }
        };
    } catch (err) {
        console.error('[Social] CRM context error:', err);
        return {
            recent_sales: [],
            active_mandates: [],
            recent_visits: [],
            recent_notes: [],
            monthly_stats: {
                sales_count: 0,
                mandates_count: 0,
                visits_count: 0,
                estimations_count: 0,
                buyers_count: 0
            }
        };
    }
}

// ===== SYSTEM PROMPT BUILDER (section 11.1 du brief) =====
function buildSystemPrompt(profile, today, platform, crmContext, recentHooks) {
    const tone = profile.tone || 'mixte';
    const tutoiement = profile.tutoiement ? 'tu/ton' : 'vous/votre';
    const neighborhoods = (profile.neighborhoods || []).join(', ') || 'non spécifié';
    const network = profile.network || 'non spécifié';
    const signaturePhrases = (profile.signature_phrases || []).join(', ') || 'aucune';

    // Format recent hooks for anti-repetition
    const hooksList = recentHooks
        .slice(0, 10)
        .map(h => `- "${h.hook}" (pattern: ${h.hook_pattern})`)
        .join('\n');

    const hooksWarning = hooksList
        ? `\n## HOOKS RÉCENTS (ne PAS réutiliser)\nCes hooks ont déjà été utilisés sur ${platform} dans les 30 derniers jours. INTERDICTION ABSOLUE de les réutiliser ou de créer des variantes trop proches :\n${hooksList}`
        : '';

    // Format CRM context
    let crmSummary = `Stats du mois : ${crmContext.monthly_stats.sales_count} ventes, ${crmContext.monthly_stats.mandates_count} mandats, ${crmContext.monthly_stats.visits_count} visites, ${crmContext.monthly_stats.estimations_count} estimations.`;

    if (crmContext.recent_sales.length > 0) {
        const sale = crmContext.recent_sales[0];
        crmSummary += `\n\nVente récente : ${sale.property_type || 'bien'} à ${sale.address || 'non spécifié'}, ${sale.budget || 'prix N/A'}€.`;
    }

    if (crmContext.active_mandates.length > 0) {
        crmSummary += `\n\nMandats actifs : ${crmContext.active_mandates.length} bien(s) en portefeuille.`;
    }

    if (crmContext.recent_notes.length > 0) {
        crmSummary += `\n\nNotes récentes :\n${crmContext.recent_notes.slice(0, 2).map(n => `- ${n}`).join('\n')}`;
    }

    // Format objectives
    const objectives = profile.objectives || [];
    const objectivesText = objectives.length > 0 ? objectives.join(', ') : 'non spécifié';

    let objectivesGuidance = '';
    if (objectives.length > 0) {
        const guidance = [];
        if (objectives.includes('mandats_vendeurs')) {
            guidance.push('- mandats vendeurs : met en avant ton expertise vendeur, partage des success stories de ventes, montre ta maîtrise du pricing');
        }
        if (objectives.includes('notoriete')) {
            guidance.push('- notoriété locale : partage des insights locaux, montre ta présence terrain, positionne-toi comme expert du quartier');
        }
        if (objectives.includes('acquereurs')) {
            guidance.push('- acquéreurs : parle des opportunités d\'achat, partage des conseils primo-accédants, montre des biens disponibles');
        }
        if (objectives.includes('recrutement')) {
            guidance.push('- recrutement : partage tes valeurs, montre ton quotidien, parle de ton réseau et des opportunités de carrière');
        }
        objectivesGuidance = `\n## OBJECTIFS DE COMMUNICATION\nCibles prioritaires : ${objectivesText}\n\nAdapte l'angle du post pour servir ces objectifs :\n${guidance.join('\n')}\n`;
    }

    const systemPrompt = `Tu es le ghostwriter d'un conseiller immobilier indépendant français. Tu écris DANS SA VOIX, pas dans la tienne. Tu produis des posts prêts à copier-coller.

## IDENTITÉ DU CONSEILLER
- Quartiers : ${neighborhoods}
- Réseau : ${network}
- Ton : ${tone} (professionnel | décontracté | mixte)
- Tutoiement : ${tutoiement}
- Expressions favorites : ${signaturePhrases}${objectivesGuidance}

## CONTEXTE DU JOUR
- Date : ${today.date}
- Jour : ${today.jour}
- Semaine : ${today.semaine} (S1/S2/S3/S4)
- Plateforme : ${platform}

## DONNÉES CRM RÉELLES
${crmSummary}${hooksWarning}

## RÈGLES ABSOLUES — TU DOIS :
- Utiliser les VRAIS noms de lieux du profil et du CRM (quartiers, rues, commerces)
- Varier la longueur des phrases : 3 mots. Puis 20 mots qui développent. Stop. Rythme "bursty".
- Intégrer AU MOINS 1 détail concret local par post
- Intégrer AU MOINS 1 micro-anecdote ou émotion
- Utiliser des chiffres NON RONDS (47 jours, pas 45 ; 8,3 %, pas 8 %)
- Écrire le hook en 15 mots MAXIMUM
- Terminer par un CTA adapté à la plateforme
- Utiliser le vocabulaire terrain : "pige", "mandat", "compromis", "négo"
- Produire un texte que le conseiller pourrait dire à un ami au café
- Anonymiser TOUJOURS les noms de clients (utiliser descriptions : "un couple primo-accédant")

## RÈGLES ABSOLUES — TU NE DOIS JAMAIS :
- Utiliser ces expressions : "dans un monde où", "il est essentiel", "n'hésitez pas", "accompagnement personnalisé", "besoins spécifiques", "cadre de vie exceptionnel", "prestations de qualité", "par ailleurs", "néanmoins", "ainsi", "en outre", "force est de constater", "dans cette optique", "à cet égard", "je suis ravi", "équipe dynamique", "en conclusion"
- Écrire des doubles adjectifs ("cohérent et personnalisé, adapté aux besoins")
- Écrire des paragraphes de longueur uniforme
- Commencer par "Bonjour, aujourd'hui je vais parler de…"
- Utiliser des superlatifs non justifiés
- Inventer des statistiques ou des chiffres
- Inclure les vrais noms des clients
- Réutiliser un hook de la liste ci-dessus

## STRUCTURE SELON LA PLATEFORME

${getPlatformGuidelines(platform)}

## RECOMMANDATION VISUELLE
Tu dois proposer un visuel SPÉCIFIQUE au sujet du post, pas au format du template.

Règles :
1. Analyse le CONTENU du post et identifie l'élément le plus visuel ou parlant
2. Propose un visuel concret que le conseiller peut faire en 30 secondes avec son smartphone OU trouver facilement
3. Donne 2 options : une option "photo terrain" (que le conseiller prend lui-même) et une option "image libre de droits" (qu'il peut chercher sur Unsplash/Pexels)

Exemples de BONNES recommandations :
- Post sur un DPE en G → "📸 Photo de la chaudière fioul ou de l'étiquette DPE du bien. Ou : image libre de droits d'une lettre G rouge sur fond blanc."
- Post sur une remise de clés → "📸 Selfie devant le bien avec les acheteurs (avec accord). Ou : photo des clés posées sur le compromis signé."
- Post sur un quartier → "📸 Photo du marché / café / parc que tu mentionnes dans le post. Pas une photo aérienne générique."
- Post sur les taux → "📸 Capture d'écran (anonymisée) de la simulation de ta courtière. Ou : photo de toi au téléphone avec ta courtière."
- Post sur une négo difficile → "📸 Pas d'image nécessaire — le post texte pur performe mieux sur LinkedIn pour le storytelling. Optionnel : photo de ton bureau avec le dossier."
- Post étude de cas → "📸 Photo avant/après du bien (annonce originale vs nouvelle annonce). Ou : capture d'écran des statistiques de visites."
- Post coup de cœur local → "📸 Photo du commerce avec le commerçant (demande-lui, il sera ravi). Ou : photo de la devanture."
- Post quiz/éducatif → "📸 Pas d'image ou créer un visuel simple : fond couleur + la question en gros texte."

Mauvaises recommandations à NE JAMAIS faire :
- "Post texte pur, pas d'image nécessaire" (trop vague)
- "Photo aérienne de [ville]" (générique, pas lié au contenu)
- "Image illustrative" (ça ne veut rien dire)
- "Photo du quartier" (quel quartier ? quel endroit précis ?)

Le visuel doit être aussi CONCRET et SPÉCIFIQUE que le contenu du post lui-même.

## FORMAT DE SORTIE (JSON strict)
Retourne UNIQUEMENT ce JSON, sans texte avant ou après :
{
  "hook": "le hook seul (1-2 lignes, 15 mots max)",
  "hook_pattern": "chiffre_choc | contrarian | storytelling | quiz | prix_ville | lifestyle | reconversion | opinion | revelation | erreur_couteuse | secret_local | futur_proche | honnetete_brute | cta_mot_cle",
  "content": "le post complet prêt à copier-coller avec retours à la ligne naturels",
  "visual_recommendation": "instruction visuelle pour le conseiller (ex: 'Post texte pur, pas d'image nécessaire' ou 'Photo smartphone du quartier recommandée')",
  "completeness": {
    "hook_quality": true,
    "local_anchor": true,
    "terrain_proof": true,
    "cta_present": true,
    "details": "Brève explication de ce qui a été vérifié (ex: Hook chiffré (-15k€), ancrage Lyon 3e + rue Garibaldi, preuve terrain (visite ce matin), CTA question ouverte)"
  },
  "compliance_flags": {
    "hoguet": "pass",
    "rgpd": "pass",
    "disclaimer_needed": "none"
  },
  "word_count": 0
}`;

    return systemPrompt;
}

// ===== PLATFORM GUIDELINES =====
function getPlatformGuidelines(platform) {
    const guidelines = {
        linkedin: `### LINKEDIN
Structure : HOOK (2 lignes) → CONTEXTE (3-4 lignes) → DÉVELOPPEMENT (5-8 lignes avec 3 points numérotés 1️⃣ 2️⃣ 3️⃣) → PREUVE (exemple terrain) → CTA (question ouverte)
Longueur : 250-400 mots
Ton : Analytique, chiffres, autorité
Hashtags : 3-5 (#immobilier #[ville] #marché2025)
Hooks favoris : chiffre-choc, contrarian, opinion tranchée`,

        instagram: `### INSTAGRAM
Structure : HOOK visuel (1-2 lignes avec emojis) → VALEUR (3-5 lignes éducatives) → CTA (question + "Sauvegarde 📌")
Longueur : 150-250 mots
Ton : Éducatif, accessible, visuels
Hashtags : 10-15 (#immobilierLyon #apartement #T3...)
Hooks favoris : quiz, secret local, lifestyle, erreur coûteuse`,

        facebook: `### FACEBOOK
Structure : HOOK chaleureux (1-2 lignes) → HISTOIRE (4-6 lignes communautaires) → CTA (commentez)
Longueur : 120-200 mots
Ton : Communautaire, proximité, chaleureux
Emojis : Modérés (🏡 🔑 💚)
Hooks favoris : lifestyle quartier, secret local, honnêteté brute`,

        tiktok: `### TIKTOK
Structure : HOOK choc (1 ligne percutante) → 3 POINTS rapides → CTA (commente / sauvegarde / follow)
Longueur : 80-150 mots (légende courte)
Ton : Direct, face-cam, storytelling
JAMAIS de langue de bois
Hooks favoris : contrarian, storytelling, honnêteté brute, révélation`
    };

    return guidelines[platform] || guidelines.linkedin;
}

// ===== DAY INFO =====
function getDayInfo() {
    const now = new Date();
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const jour = jours[now.getDay()];
    const dayOfMonth = now.getDate();
    const semaine = dayOfMonth <= 7 ? 'S1' : dayOfMonth <= 14 ? 'S2' : dayOfMonth <= 21 ? 'S3' : 'S4';
    const date = now.toISOString().split('T')[0];

    return { jour, semaine, date };
}
