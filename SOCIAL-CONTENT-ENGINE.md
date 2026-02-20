# WAIMMO — Social Content Engine (Module Posts Réseaux Sociaux)

> Ce document est la spécification complète du module de génération de contenu social de WAIMMO.
> Il contient la base de connaissances métier, les prompts, le modèle de données, et toute la logique nécessaire à Claude Code pour implémenter `social.html` et `generate-social-post.js`.
> Basé sur l'analyse de 3 études approfondies (corpus 2024-2026, France + US), 40+ exemples réels documentés.
> Dernière mise à jour : 20 février 2026

---

## TABLE DES MATIÈRES

1. [Vision et positionnement](#1-vision-et-positionnement)
2. [Parcours utilisateur](#2-parcours-utilisateur)
3. [Modèle de données](#3-modèle-de-données)
4. [Logique métier](#4-logique-métier)
5. [Base de connaissances — Hooks](#5-base-de-connaissances--hooks)
6. [Base de connaissances — Templates par plateforme](#6-base-de-connaissances--templates-par-plateforme)
7. [Calendrier éditorial](#7-calendrier-éditorial)
8. [Guide anti-IA](#8-guide-anti-ia)
9. [Conformité et mentions légales](#9-conformité-et-mentions-légales)
10. [Recommandations visuelles](#10-recommandations-visuelles)
11. [Prompts complets](#11-prompts-complets)
12. [Onboarding profil social](#12-onboarding-profil-social)
13. [Implémentation technique](#13-implémentation-technique)

---

## 1. Vision et positionnement

### Ce que fait le module

Le module Social Content Engine permet au conseiller immobilier de générer chaque jour des posts prêts à publier sur LinkedIn, Instagram, Facebook et TikTok, personnalisés avec :
- **Ses données CRM réelles** (biens vendus, mandats en cours, visites récentes, notes terrain)
- **Son profil de voix** (ton, expressions, style d'écriture)
- **Le calendrier éditorial** (le bon format, sur la bonne plateforme, avec le bon objectif)
- **La conformité automatique** (mentions Hoguet, RGPD, disclaimers)

### Pourquoi c'est différent de ChatGPT

ChatGPT ne sait pas que le conseiller a vendu un T3 rue Garibaldi la semaine dernière, que son mandat à Villeurbanne expire dans 15 jours, ou qu'il a fait 3 estimations ce mois-ci. WAIMMO le sait — parce que ces données sont dans le CRM. Le moteur génère du contenu à partir du vécu réel, pas d'un prompt vague.

Différences concrètes :
- **Données CRM injectées** : le post "preuve sociale" utilise le vrai bien vendu cette semaine
- **Calendrier intégré** : le conseiller sait quoi poster quand, sans réfléchir
- **Anti-répétition** : les hooks des 30 derniers jours sont trackés, jamais réutilisés
- **Conformité auto** : les mentions légales sont ajoutées quand nécessaire
- **Multi-plateforme en 1 clic** : 4 posts avec des angles différents, pas des paraphrases
- **Cohérence sur 30 jours** : stratégie éditoriale complète, pas des posts isolés

### Cadence visée

- **Instagram, Facebook, TikTok** : 5 posts/semaine (hors stories)
- **LinkedIn** : 3 posts/semaine (lundi, mercredi, vendredi)

---

## 2. Parcours utilisateur

### 2.1 Page social.html — Structure

```
┌─────────────────────────────────────────────────────┐
│  📅 MES HISTOIRES DE LA SEMAINE                      │
│  [Lun ✅] [Mar 🔵] [Mer ○] [Jeu ○] [Ven ○]         │
│  Aujourd'hui : Mardi — Instagram Reel quartier       │
│                        Facebook Coup de cœur local    │
│                        TikTok Conseil face-cam        │
├─────────────────────────────────────────────────────┤
│  ✨ RACONTER UN MOMENT                               │
│                                                       │
│  [📋 Suggestion du jour]  [🎤 J'ai un truc à raconter]│
│                                                       │
│  ── Suggestion basée sur ta semaine ──               │
│  💡 Tu as vendu le T3 rue Garibaldi mardi dernier.   │
│  Ça ferait un beau post "remise de clés" LinkedIn.   │
│  [Raconter cette histoire]                            │
│                                                       │
│  💡 C'est mardi : Reel quartier sur Instagram.       │
│  Quel quartier veux-tu mettre en avant ?              │
│  [Lyon 3e] [Villeurbanne] [Part-Dieu] [Autre: ___]  │
│  [Raconter ce quartier]                               │
├─────────────────────────────────────────────────────┤
│  📝 MES PARTAGES DE LA SEMAINE                       │
│  Lun 17/02 — LinkedIn ✅ (partagé) — "Les taux..."  │
│  Lun 17/02 — Instagram ✅ (partagé) — Carrousel DPE │
│  Mar 18/02 — Facebook 📝 (brouillon) — "Coup de..." │
└─────────────────────────────────────────────────────┘
```

**Wording terrain** : dans toute l'interface, on utilise un vocabulaire "terrain" plutôt que "marketing". Pas "Créer un post" mais "Raconter un moment". Pas "Publier" mais "Partager". Pas "Contenu marketing" mais "Mes histoires". Pas "Marquer publié" mais "Marquer partagé". L'outil doit être perçu comme un prolongement naturel du métier, pas comme un outil marketing supplémentaire.

### 2.2 Mode 1 — Suggestion du jour (mode principal)

Le moteur analyse les données CRM du conseiller et propose des posts contextualisés :

**Déclencheurs CRM → type de post suggéré :**

| Événement CRM | Post suggéré | Plateforme idéale |
|---|---|---|
| Bien passé en "Vendu" cette semaine | Post preuve sociale "remise de clés" | Facebook, LinkedIn |
| Nouveau mandat signé | Teaser / reveal du bien | Instagram Stories, Facebook |
| 3+ estimations ce mois | Post autorité "analyse marché local" | LinkedIn |
| Visite avec feedback positif | Reel "visite express" (anonymisé) | Instagram, TikTok |
| Mandat > 45 jours sans offre | Carrousel "étude de cas : repositionnement" | LinkedIn |
| Acquéreur qui a visité 5+ biens | Story "les coulisses d'une recherche" | Instagram Stories |
| Note récente avec anecdote | Post storytelling "anecdote de terrain" | LinkedIn, TikTok |
| Rien de spécial | Post du calendrier éditorial du jour | Selon le jour |

**Logique de sélection :**
1. Vérifier les événements CRM des 7 derniers jours (requête Supabase)
2. Si événement trouvé → proposer le post contextualisé en priorité
3. Sinon → proposer le post du calendrier éditorial du jour
4. Le conseiller peut toujours basculer sur l'autre mode

### 2.3 Mode 2 — "J'ai un truc à raconter"

Le conseiller tape ou dicte son vécu. Exemples d'inputs réels :

> "Ce matin j'ai visité un T3 rue Garibaldi à Lyon 3e avec un couple de primo-accédants. L'appart est bien mais le DPE est en F, du coup les proprios ont dû baisser de 15 000 euros par rapport à leur estimation initiale."

> "On a signé chez le notaire ce matin pour le T4 de Villeurbanne. Les acheteurs étaient émus, c'est leur premier achat. 3 mois de recherche, 8 visites."

> "Je suis passé devant la nouvelle boulangerie rue des Tables Claudiennes, elle a rouvert après 3 mois de travaux. Ça change le quartier."

> "Les taux ont encore baissé cette semaine, ma courtière m'annonce 3.35% sur 20 ans. Il y a 2 mois c'était 3.60."

L'outil génère 1 post par plateforme active, chacun avec un **angle différent** :
- LinkedIn → angle analytique / autorité
- Instagram → angle éducatif / visuel
- Facebook → angle communautaire / proximité
- TikTok → angle storytelling / face-cam

### 2.4 Écran de résultats

**Principe UX critique** : le contenu généré s'affiche dans un **textarea éditable**, pas en lecture seule. Le conseiller est invité à personnaliser avant de copier. L'authenticité vient de cette retouche humaine.

Pour chaque post généré :

```
┌─────────────────────────────────────────────────────┐
│  📋 LINKEDIN — Post texte (285 mots)                 │
│                                                       │
│  ✏️ Ajoute ton grain de sel avant de partager 👆     │
│  ┌───────────────────────────────────────────────┐   │
│  │ -15 000 €.                                    │   │
│  │ C'est ce qu'un DPE en F a coûté à un vendeur, │   │
│  │ ce matin, à Lyon 3e.                          │   │
│  │                                                │   │
│  │ Je visitais un T3 rue Garibaldi avec un couple │   │
│  │ de primo-accédants. [... suite du post ...]   │   │
│  │                                                │   │
│  │ #immobilier #Lyon #DPE #marchéimmobilier      │   │
│  └───────────────────────────────────────────────┘   │
│  (textarea éditable — le conseiller modifie ici)     │
│                                                       │
│  ── ✅ Indicateur de complétude ──                   │
│  ✅ Hook chiffré ou accrocheur                       │
│  ✅ Ancrage local (lieu/quartier mentionné)           │
│  ✅ Preuve terrain (anecdote, chiffre vécu)           │
│  ✅ CTA adapté à la plateforme                       │
│  ⚠️ Touche perso (modifiez le post pour valider)     │
│                                                       │
│  ── 📸 Visuel recommandé ──                          │
│  Post texte pur (pas d'image nécessaire).            │
│  Optionnel : photo smartphone de la rue/quartier.    │
│                                                       │
│  [📋 Copier]  [🔄 Régénérer]  [✅ Marquer partagé]  │
└─────────────────────────────────────────────────────┘
```

**Indicateur de complétude** : chaque post est évalué automatiquement sur 5 critères factuels (pas de prédiction d'engagement). L'indicateur "Touche perso" passe de ⚠️ à ✅ dès que le conseiller modifie le texte (même 1 caractère). Cela encourage la retouche sans la rendre bloquante.

Critères de complétude :
| Critère | Comment c'est vérifié | Icône |
|---|---|---|
| Hook accrocheur | Présent dans le JSON de sortie, ≤15 mots | ✅ auto |
| Ancrage local | Détection d'un nom de lieu/quartier dans le texte | ✅ auto |
| Preuve terrain | Détection d'un chiffre, d'une date, ou d'une anecdote | ✅ auto |
| CTA adapté | Présent en fin de post | ✅ auto |
| Touche perso | Le conseiller a modifié le texte avant de copier | ⚠️→✅ au edit |

---

## 3. Modèle de données

### 3.1 Table `social_profiles` (existe, à enrichir)

```sql
-- Champs existants
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES auth.users(id),
tone TEXT,          -- 'professionnel' | 'decontracte' | 'mixte'
style TEXT,         -- description libre du style
sector TEXT,        -- ville/quartier principal
sample_posts TEXT,  -- posts existants collés par le conseiller

-- Nouveaux champs à ajouter
network TEXT,                    -- 'Efficity' | 'IAD' | 'Safti' | 'indépendant' | etc.
neighborhoods TEXT[],            -- ['Lyon 3e', 'Villeurbanne', 'Part-Dieu']
tutoiement BOOLEAN DEFAULT false,
platforms_active TEXT[],         -- ['linkedin', 'instagram', 'facebook', 'tiktok']
publishing_frequency TEXT DEFAULT 'regular', -- 'light' (2/sem) | 'regular' (3-4/sem) | 'intensive' (5/sem)
signature_phrases TEXT[],        -- expressions récurrentes du conseiller
rsac_info TEXT,                  -- 'RSAC Lyon n°XXX | CCI Lyon'
legal_mentions TEXT,             -- mentions légales pré-formatées pour la bio
voice_profile JSONB,             -- profil extrait par IA des sample_posts
onboarding_completed BOOLEAN DEFAULT false,
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
```

### 3.2 Table `social_posts` (existe, à enrichir)

```sql
-- Champs existants
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES auth.users(id),
category TEXT,
content TEXT,
platform TEXT,
status TEXT,        -- 'draft' | 'copied' | 'published'

-- Nouveaux champs à ajouter
hook TEXT,                       -- le hook seul (pour tracking anti-répétition)
hook_pattern TEXT,               -- 'chiffre_choc' | 'contrarian' | 'storytelling' | etc.
template_id TEXT,                -- ID du template utilisé (ex: 'LI-01')
objective TEXT,                  -- 'vendeur' | 'acquereur' | 'notoriete' | 'recrutement'
format_type TEXT,                -- 'post_texte' | 'carrousel' | 'reel_script' | 'face_cam'
carousel_slides JSONB,           -- [{slide: 1, text: "...", design_notes: "..."}]
tiktok_script JSONB,             -- [{sec: "0-3", action: "...", text_overlay: "..."}]
visual_recommendation TEXT,      -- instruction visuelle pour le conseiller
compliance_flags JSONB,          -- {hoguet: 'pass'|'warn', rgpd: 'pass'|'warn'}
completeness JSONB,              -- {hook_quality: true, local_anchor: true, terrain_proof: true, cta_present: true}
user_edited BOOLEAN DEFAULT false, -- passe à true dès que le conseiller modifie le texte
source_type TEXT,                -- 'crm_event' | 'user_input' | 'calendar_suggestion'
source_data JSONB,               -- données CRM qui ont alimenté le post
calendar_day TEXT,               -- 'lundi' | 'mardi' | etc.
generated_at TIMESTAMPTZ DEFAULT now(),
published_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT now()
```

### 3.3 Index et RLS

```sql
CREATE INDEX idx_social_posts_hooks ON social_posts (user_id, hook_pattern, generated_at);
CREATE INDEX idx_social_posts_week ON social_posts (user_id, platform, calendar_day, generated_at);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own posts" ON social_posts FOR ALL USING (auth.uid() = user_id);
ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profile" ON social_profiles FOR ALL USING (auth.uid() = user_id);
```

---

## 4. Logique métier

### 4.1 Sélection du template

```
ENTRÉE : jour_semaine + plateformes_actives + événements_crm

SI événement_crm récent ET pertinent :
  → Proposer le template lié à l'événement (ex: "vendu" → preuve sociale)
  → La plateforme est celle qui performe le mieux pour cet objectif
SINON :
  → Utiliser le calendrier éditorial du jour
  → Pour chaque plateforme active, sélectionner le template prévu

POUR chaque post à générer :
  1. Charger le template correspondant
  2. Charger le profil du conseiller
  3. Charger les hooks des 30 derniers jours sur cette plateforme
  4. Charger les données CRM pertinentes
  5. Appeler generate-social-post.js
```

### 4.2 Rotation des hooks

Règle absolue : **aucun hook_pattern identique sur la même plateforme dans les 14 jours**. Aucun hook textuel identique en 30 jours.

```javascript
const recentHooks = await supabase
  .from('social_posts')
  .select('hook, hook_pattern, platform')
  .eq('user_id', userId)
  .gte('generated_at', thirtyDaysAgo)
  .order('generated_at', { ascending: false });

const usedPatterns14d = recentHooks
  .filter(h => h.platform === targetPlatform && isWithin14Days(h.generated_at))
  .map(h => h.hook_pattern);
// Passé au prompt : "NE PAS utiliser les patterns suivants : [liste]"
```

### 4.3 Injection des données CRM

L'Edge Function récupère le contexte avant d'appeler Claude :

```javascript
const crmContext = {
  // Ventes récentes (sellers en status 'sold' dans les 14 derniers jours)
  recent_sales: await getRecentSales(userId, 14),
  // Ex: [{type: 'T3', address: 'rue Garibaldi, Lyon 3e', price: 275000,
  //       days_on_market: 12, buyer_type: 'primo-accédant'}]

  // Mandats actifs
  active_mandates: await getActiveMandates(userId),
  // Ex: [{type: 'T4', city: 'Villeurbanne', price: 380000,
  //       days_since_mandate: 23, visits_count: 5}]

  // Estimations récentes
  recent_estimations_count: await getRecentEstimationsCount(userId, 30),

  // Visites récentes avec feedback
  recent_visits: await getRecentVisits(userId, 7),
  // Ex: [{property: 'T3 Croix-Rousse', buyer: 'Couple 30-35 ans',
  //       feedback: 'Coup de cœur mais budget dépassé de 20k'}]

  // Notes récentes
  recent_notes: await getRecentNotes(userId, 3),

  // Stats du mois
  monthly_stats: {
    sales_count: 2, mandates_count: 4,
    visits_count: 12, estimations_count: 6
  }
};
```

### 4.4 Déclinaison par angle (règle critique)

Quand le même vécu génère des posts pour plusieurs plateformes, chaque plateforme prend un **angle distinct** :

| Plateforme | Angle | Exemple (sujet : DPE en F = -15k€) |
|---|---|---|
| LinkedIn | Analytique / autorité | "Les données montrent que le DPE impacte 37% des ventes à Lyon." |
| Instagram | Éducatif / visuel | Carrousel "5 choses que votre DPE change sur votre prix" |
| Facebook | Communautaire / proximité | "Propriétaires lyonnais : savez-vous combien votre DPE impacte votre prix ?" |
| TikTok | Storytelling / face-cam | "Ce matin, un vendeur a perdu 15 000 € à cause de ÇA…" |

**Règle** : Ne JAMAIS reformuler le même texte pour une autre plateforme. Changer l'ANGLE.


---

## 5. Base de connaissances — Hooks

### 5.1 Les 14 patterns de hooks

Chaque pattern est documenté avec : le biais cognitif qu'il active, les variables IA, des exemples reformulés, les plateformes idéales.

---

#### HOOK 1 — Le chiffre-choc local
**Biais** : Surprise + ancrage numérique. Un chiffre précis (non rond) augmente le taux de clic d'environ 22%.
**Variables** : {chiffre}, {localité}, {conséquence}
**Plateformes** : LinkedIn ★★★, Facebook ★★★, Instagram ★★, TikTok ★★

Exemples :
- "Le prix moyen au m² à {quartier} a pris 8,3 % en 6 mois. Et pourtant, 1 bien sur 3 reste invendable."
- "-15 000 €. C'est ce qu'un DPE en F a coûté à un vendeur, ce matin, à {ville}."
- "47 jours. C'est le temps moyen pour vendre un appartement à {quartier} en ce moment. Il y a un an, c'était 23."

Règle : toujours des chiffres **non ronds** (47, pas 45 ; 8,3 %, pas 8 %).

---

#### HOOK 2 — L'anti-conseil (contrarian)
**Biais** : Tension cognitive. Contredire une croyance crée un inconfort qui force la lecture.
**Variables** : {croyance_commune}, {votre_position}
**Plateformes** : LinkedIn ★★★, TikTok ★★★, Facebook ★★, Instagram ★

Exemples :
- "Ce n'est jamais vraiment LE bon moment pour vendre. Et c'est tant mieux."
- "Tout le monde dit que c'est le moment d'acheter. Je ne suis pas d'accord."
- "Stop. Ne mettez PAS votre bien en vente avant d'avoir vérifié ça…"

Règle : le contrarian doit être **argumenté** dans le corps du post.

---

#### HOOK 3 — L'histoire de négociation
**Biais** : Arc narratif (tension → résolution). Le cerveau veut connaître la fin.
**Variables** : {situation_initiale}, {obstacle}, {durée}
**Plateformes** : LinkedIn ★★★, TikTok ★★★, Facebook ★★, Instagram ★

Exemples :
- "Il y a 3 mois, cette maison était invendable. 47 jours sur le marché. Zéro offre."
- "Ma pire négociation de 2025… Le vendeur voulait 480 000 €. Mon acquéreur offre 410 000 €. Le vendeur raccroche."
- "Le bien était en vitrine depuis 11 semaines. Personne ne se projetait."

Règle : commencer in medias res, jamais par "Bonjour, je vais vous raconter…"

---

#### HOOK 4 — Le quiz / la question directe
**Biais** : Gap d'information. Le cerveau veut tester ses connaissances.
**Variables** : {question}, {options_ou_réponse_surprenante}
**Plateformes** : Instagram Stories ★★★, Facebook ★★★, TikTok ★★, LinkedIn ★

Exemples :
- "À votre avis, combien coûtent les frais de notaire dans l'ancien ? A) 3 % B) 5 % C) 8 %"
- "VRAI ou FAUX : on peut emprunter sans apport en 2025 ?"
- "Combien de visites faut-il en moyenne avant de trouver son bien à {ville} ?"

---

#### HOOK 5 — "Ce que X€ achètent à [Ville]"
**Biais** : Curiosité concrète + comparaison sociale.
**Variables** : {prix}, {ville}, {type_bien}
**Plateformes** : TikTok ★★★, Instagram Reels ★★★, Facebook ★★

Exemples :
- "Voici ce que 350 000 € achètent à {ville} en ce moment…"
- "Ce que 280 000 € vous offrent à {quartier} — et ce que vous perdez à 250 000 €."
- "Tour express : {prix}€ à {ville}. Vous achetez ou vous passez ?"

Règle : commencer par la pièce WOW, pas par l'entrée.

---

#### HOOK 6 — Le lifestyle de quartier
**Biais** : Appartenance et projection (je me vois vivre là).
**Variables** : {quartier}, {moment}, {ambiance}
**Plateformes** : Instagram Reels ★★★, TikTok ★★★, Facebook ★★

Exemples :
- "POV : vous vivez à {quartier} un samedi matin."
- "Le quartier le plus sous-coté de {ville}… et pourquoi ça ne va pas durer."
- "3 restos secrets de {quartier} que même les locaux ne connaissent pas tous."

---

#### HOOK 7 — La reconversion / le "avant-après" personnel
**Biais** : Identification narrative (si elle a réussi, je peux aussi).
**Variables** : {ancien_métier}, {résultat_actuel}, {durée}
**Plateformes** : LinkedIn ★★★, TikTok ★★★, Facebook ★★, Instagram ★★

Exemples :
- "Il y a 2 ans, j'étais infirmière. Aujourd'hui, j'ai accompagné 35 familles."
- "Je gagnais 1 800 € par mois en CDI. J'ai tout quitté pour devenir mandataire."
- "Sophie a rejoint l'équipe il y a 8 mois. Avant, assistante RH. Sa première vente ? Un studio à {ville}."

Règle : **JAMAIS** de promesse de revenus sans contexte. Disclaimer recrutement obligatoire.

---

#### HOOK 8 — L'opinion tranchée
**Biais** : Polarisation = engagement. Les gens répondent "d'accord/pas d'accord".
**Variables** : {opinion}, {justification_terrain}
**Plateformes** : LinkedIn ★★★, TikTok ★★, Facebook ★★

Exemples :
- "Non, le problème n'est pas les taux. C'est le stock."
- "Le mandataire n'est pas un agent au rabais. Les chiffres le prouvent."
- "J'adore quand j'entends : 'L'immobilier, c'est un métier passion.' Alors je pose toujours la même question…"

Règle : toujours nuancer et ajouter CTA débat.

---

#### HOOK 9 — La révélation (ce qu'on ne vous dit pas)
**Biais** : Gap d'information + sentiment d'accéder à un savoir caché.
**Variables** : {sujet_courant}, {vérité_cachée}
**Plateformes** : TikTok ★★★, LinkedIn ★★, Instagram ★★, Facebook ★★

Exemples :
- "Pourquoi votre estimation en ligne est probablement fausse de 12 %."
- "Personne ne vous dit ça avant d'acheter… et ça peut vous coûter cher."
- "Ce que le 'Just Sold' ne dit pas : voilà ce que vous ne voyez pas."

---

#### HOOK 10 — L'erreur coûteuse
**Biais** : Aversion à la perte.
**Variables** : {erreur}, {coût_concret}, {solution}
**Plateformes** : LinkedIn ★★★, Instagram carrousel ★★★, TikTok ★★

Exemples :
- "L'erreur de décoration à 450 € qui fait perdre 10 000 € sur le prix de vente."
- "3 erreurs qui font perdre des visites à {ville} en 2026."
- "La plus grosse erreur de ma carrière m'a coûté un mandat de {prix}."

---

#### HOOK 11 — Le secret local
**Biais** : Exclusivité + appartenance communautaire.
**Variables** : {lieu}, {secret}, {bénéfice}
**Plateformes** : Facebook ★★★, Instagram ★★★, TikTok ★★

Exemples :
- "Le seul endroit à {quartier} où l'on peut encore trouver {chose_rare}."
- "Voici comment le nouveau projet {nom} va impacter le prix dans votre rue d'ici 2027."
- "3 choses qui ont changé à {quartier} en 12 mois — et l'impact sur les prix."

---

#### HOOK 12 — Le futur proche
**Biais** : Anticipation + urgence douce.
**Variables** : {changement}, {lieu}, {horizon_temps}
**Plateformes** : LinkedIn ★★, Facebook ★★★, Instagram ★★

Exemples :
- "Voici comment le tramway T7 va changer les prix à {quartier} d'ici 2027."
- "D'ici 18 mois, ce quartier ne sera plus le même. Voici pourquoi."

---

#### HOOK 13 — L'anti-langue de bois (honnêteté brute)
**Biais** : Confiance par la transparence. Dire les défauts renforce la crédibilité.
**Variables** : {bien}, {défaut_honnête}, {qualité_réelle}
**Plateformes** : TikTok ★★★, Instagram Reels ★★★, Facebook ★★

Exemples :
- "On ne va pas faire semblant : cet appart a des défauts. Mais il a UN truc qui compense tout."
- "La cuisine est petite, c'est vrai. Mais elle a une ergonomie de chef."

---

#### HOOK 14 — Le CTA à mot-clé (conversion directe)
**Biais** : Micro-engagement (commenter un mot = faible friction).
**Variables** : {mot_clé}, {promesse}
**Plateformes** : Instagram ★★★, TikTok ★★★, LinkedIn ★★, Facebook ★★

Exemples :
- "Commente 'DIAG' si tu veux que je te dise en 10 minutes ce qui bloque ton bien."
- "Écris 'BUDGET' et je t'envoie la checklist de visite."
- "Commente 'CHECK' pour recevoir les 5 points à vérifier avant de signer."

Règle : utiliser comme CTA final, pas comme hook d'ouverture.

---

### 5.2 Règles d'écriture des hooks

**Longueur** : 1 à 2 lignes (avant le "Voir plus"). 10-15 mots max. 1-3 secondes en vidéo.

**Mots déclencheurs** : chiffres spécifiques ("47 jours", "3,45 %"), négation ("jamais", "stop"), pronoms directs ("vous", "votre bien"), temporalité ("ce matin", "cette semaine"), exclusivité ("off-market", "coulisses").

**Mots à ÉVITER** : "Découvrez", "Je suis ravi", "Dans un monde où", tout superlatif non justifié.

**Niveaux de preuve** (à intégrer juste après le hook) :
- Niveau 1 (faible) : opinion → "Je pense que…"
- Niveau 2 (moyen) : terrain → "Sur mes 15 dernières ventes…"
- Niveau 3 (fort) : données sourcées → "Selon les DVF…"
- Niveau 4 (très fort) : preuve visuelle → photo avant/après, capture SMS client


---

## 6. Base de connaissances — Templates par plateforme

### 6.1 LINKEDIN (3 posts/semaine)

#### Template LI-01 — Analyse de marché local
**Objectif** : Autorité + leads vendeurs | **Quand** : Lundi | **Longueur** : 250-400 mots

```
HOOK (2 lignes max, pattern chiffre-choc OU contrarian) :
→ Donnée marché surprenante OU opinion contraire au consensus

CONTEXTE (3-4 lignes) :
→ D'où vient cette donnée, lien avec le marché local

DÉVELOPPEMENT (5-8 lignes) :
→ 3 points numérotés (1️⃣ 2️⃣ 3️⃣)
→ Chaque point : fait + implication concrète

PREUVE (2-3 lignes) :
→ Exemple personnel récent OU donnée CRM ("Sur mes X dernières ventes…")

CTA (2 lignes) :
→ Question ouverte OU CTA mot-clé
→ 3-5 hashtags : #immobilier #[ville] #marché2025
```

**Exemple complet** :

```
Les taux sont passés sous les 3,5 %. Tout le monde dit que c'est le moment d'acheter.
Je ne suis pas d'accord. Voici pourquoi 👇

Ma courtière partenaire me confirme : 3,45 % sur 20 ans cette semaine, contre 3,62 %
le mois dernier. Concrètement, pour 200 000 € empruntés, ça fait 35 €/mois de moins.
Pas négligeable, mais pas révolutionnaire.

1️⃣ Les prix n'ont pas encore corrigé dans ma zone (+3 % ce trimestre à [Ville])
2️⃣ Le stock de biens reste faible — 40 % de mandats en moins qu'en 2022
3️⃣ Les vendeurs gardent des attentes de prix 2022, les acheteurs ont un budget 2025

La semaine dernière, j'ai accompagné un couple primo-accédant sur [quartier].
Budget : 280 K€. On a visité 6 biens. Un seul correspondait. Signé à 275 K€ après négo.

Le bon moment pour acheter, c'est quand VOTRE projet est prêt. Pas quand les médias le disent.

Qu'observez-vous sur votre marché ? 👇

#immobilier #[ville] #taux2025 #marchéimmobilier
```

---

#### Template LI-02 — Étude de cas
**Objectif** : Preuve sociale + leads vendeurs | **Quand** : Mercredi (S1, S3)

```
HOOK : "Ce bien était [bloqué/invendable] depuis [durée]. Voilà ce que j'ai changé."
CONTEXTE : 3 lignes (type, zone, contrainte)
STRATÉGIE : 3 actions concrètes numérotées
PREUVE : chiffres précis (visites, offres, délai, prix)
CTA : "Commente 'DIAG' si tu veux un diagnostic de ton bien à {ville}."
```

**Exemple complet** :

```
Le bien était en vitrine depuis 11 semaines. Personne ne se projetait.

Appartement 3P (années 70), [quartier], balcon ok, mais annonce qui vendait
"des mètres²", pas une vie.

Ce que j'ai changé en 72h :
1) Dossier vendeur refait — DPE lisible + charges + travaux priorisés
2) Visite scénarisée — 3 arrêts = 3 bénéfices, pas 15 pièces en file indienne
3) Annonce réécrite autour d'un seul angle : "lumière + plan sans perte"

Résultat : 6 visites qualifiées la première semaine, 2 offres, 1 acceptée sans renégo.

Leçon : en marché sélectif, ce n'est pas "plus de visites". C'est "moins, mais mieux".

Si tu veux que je te dise en 10 minutes ce qui bloque ton bien à [ville], commente "DIAG" 👇
```

**Si carrousel PDF (7 slides)** :
- Slide 1 : Hook chiffré ("Vendu en 12 jours après 11 semaines d'échec")
- Slide 2 : Le problème
- Slide 3 : Le diagnostic
- Slide 4 : La stratégie (3 actions)
- Slide 5 : Le résultat (chiffres)
- Slide 6 : La leçon
- Slide 7 : CTA "Commente DIAG"

---

#### Template LI-03 — Opinion contrarian
**Objectif** : Engagement | **Quand** : Vendredi (S1, S3)

```
HOOK : [Affirmation provocante mais argumentée]
PAUSE : --- (ligne vide)
DÉVELOPPEMENT : 3-4 paragraphes courts
NUANCE : "Attention, je ne dis pas que... Je dis que..."
CTA DÉBAT : "D'accord ? Pas d'accord ?"
```

**Exemple complet** :

```
Non, le problème n'est pas les taux.

---

Ça fait 6 mois que tous les médias parlent des taux. "Les taux baissent, c'est le moment !"
Sauf que mes clients, eux, me disent la même chose : "On ne trouve pas."

Le vrai problème à [ville] en ce moment :
— Il y a 40 % de mandats en moins qu'en 2022
— Les vendeurs qui restent surestiment leur bien de 10-15 %
— Les bons biens partent en 2 semaines, les autres moisissent

Résultat : les taux baissent, mais les acheteurs ne trouvent toujours pas.

Attention, je ne dis pas que les taux n'ont aucun impact. Je dis que se focaliser
uniquement dessus, c'est regarder le mauvais indicateur.

Vous êtes plutôt team "c'est le moment" ou team "on attend" ? 👇
```

---

#### Template LI-04 — Bilan chiffré / coulisses
**Objectif** : Crédibilité | **Quand** : Mercredi (S2, S4)

```
HOOK : "Point activité [mois] : [X] estimations, [Y] mandats, [Z] offres."
VALEUR : "Ce que j'ai appris" (2 points max)
MICRO-ANECDOTE : "Un dossier m'a surpris parce que…"
CTA : Question ou mot-clé
```
**Données CRM injectées** : monthly_stats

---

#### Template LI-05 — Recrutement / reconversion
**Objectif** : Recrutement | **Quand** : Vendredi S2

```
HOOK : Pattern reconversion (hook 7)
HISTOIRE : Parcours concret (anonymisé ou avec accord)
RÉALITÉ : Ce qui est dur + ce qui est gratifiant (honnêteté)
CTA : "Si ça te parle, écris-moi en MP."
DISCLAIMER OBLIGATOIRE (section 9)
```

---

### 6.2 INSTAGRAM (5 posts/semaine hors stories)

#### Template IG-01 — Carrousel éducatif (5-7 slides)
**Objectif** : Autorité + sauvegardes | **Quand** : Lundi

```
SLIDE 1 : Titre fort, gros texte ("5 erreurs qui font fuir les acheteurs")
SLIDES 2-5 : 1 point par slide + explication courte
SLIDE 6 : Checklist récapitulative
SLIDE 7 : CTA "Sauvegardez 📌 | Partagez | Commente 'CHECK'"

LÉGENDE : résumé 3-4 lignes + CTA mot-clé + 10-15 hashtags
```

**Sujets rotatifs** : "5 erreurs vendeurs", "Estimer son bien en 2025", "Pièges du compromis", "Frais de notaire simplement", "DPE : ce qui change", "Primo-accédant : les 7 étapes", "Home staging à moins de 500 €"

**Visuel** : Fond couleur charte + texte lisible + logo. 1080x1350px.

---

#### Template IG-02 — Reel quartier / lifestyle
**Objectif** : Notoriété locale | **Quand** : Mardi

```
0-3s : B-roll quartier + texte "POV : vous vivez à {quartier} un samedi matin"
3-20s : Plans variés (commerces, rues, parcs) + voix off avec vrais noms de lieux
20-30s : Face caméra devant lieu emblématique
30-35s : CTA "Sauvegardez 📌" ou "Quel quartier la prochaine fois ?"

Musique : son tendance 10-15% volume. Sous-titres obligatoires.
```

**Visuel** : Vidéo smartphone, plans variés, lumière naturelle, 25-35 sec.

---

#### Template IG-03 — Reel visite express
**Objectif** : Leads acquéreurs | **Quand** : Mercredi S2

```
0-3s : Marcher vers la porte. Texte : "Ce que {prix}€ achètent à {ville}"
3-25s : Cuts rapides pièce par pièce (3-4 sec/pièce). Pièce WOW EN PREMIER.
        Voix off naturelle. Mentionner les défauts (crédibilité). Texte incrusté.
25-35s : Plan final meilleure pièce/vue + prix + surface + DPE
35-45s : Face caméra CTA ou texte "Sauvegardez 📌"

⚠️ MENTIONS OBLIGATOIRES dans la légende : prix FAI, honoraires, DPE, surface
```

---

#### Template IG-04 — Reel face-cam conseil
**Objectif** : Autorité | **Quand** : Jeudi

```
0-2s : Gros plan sérieux. "Ne signez JAMAIS un compromis sans vérifier ça…"
2-20s : Jump cuts, 3 points (3-5 sec/point), texte incrusté, ton conversationnel
20-30s : CTA "Sauvegardez. Follow pour un conseil chaque jeudi."
```

**Visuel** : Face caméra, buste, fond neutre, jump cuts, sous-titres, 20-30 sec.

---

#### Template IG-05 — Post preuve sociale / vendu
**Objectif** : Vendeurs | **Quand** : Vendredi

```
🔑 Remise de clés !

{Description anonymisée} vient d'emménager dans son premier appartement à {ville}.
Après {durée} de recherche et {X} visites, on a trouvé LE bien.

Le moment où on remet les clés, c'est à chaque fois le même frisson.

Ce qui a fait la différence : {1 élément concret}

Merci pour votre confiance 🙏
Vous avez un projet ? Parlons-en → DM ou lien en bio
```

**Données CRM injectées** : seller récent en status "sold" + visits associées.
**Visuel** : Photo réelle (selfie remise de clés, clés sur table notaire, façade). PAS de Canva.

---

#### Template IG-06 — Story séquencée "Reveal"
**Quand** : Mercredi S3

```
Story 1 : Teaser "On vient de rentrer un bien qui va vous surprendre… demain 18h 🔥"
Story 2 : Photo extérieure floue + sondage "Devinez le prix ?"
Story 3 (J+1, 18h) : Vidéo visite pièce par pièce
Story 4 : Caractéristiques en texte
Story 5 : CTA + sticker lien vers l'annonce
```

---

### 6.3 FACEBOOK (5 posts/semaine)

#### Template FB-01 — Post communautaire local
**Objectif** : Notoriété | **Quand** : Mardi

```
[PHOTO commerce/lieu local]

🥐 Coup de cœur : {nom_commerce} vient de {rouvrir/lancer} {quoi} à {adresse}.
{1-2 phrases personnelles}

Quel est votre commerce préféré dans le quartier ? 👇
```

**Visuel** : Photo smartphone du lieu/commerçant.

---

#### Template FB-02 — Live visite guidée
**Quand** : Mercredi S2

```
DURÉE : 10-20 min
1. Intro face caméra (30 sec)
2. Extérieur + quartier (1-2 min)
3. Pièce par pièce (8-12 min, répondre au chat)
4. Récap + défauts honnêtes (2 min)
5. CTA "Envoyez-moi un message. Lien en commentaire."

POST-LIVE : booster la vidéo (5-10 €/jour, audience locale)
```

---

#### Template FB-03 — Preuve sociale "Vendu"
**Quand** : Vendredi | Même structure que IG-05 mais ton plus chaleureux.

---

#### Template FB-04 — Quiz / éducatif
**Quand** : Jeudi

```
🤔 VRAI ou FAUX ?
"{affirmation courante}"

Donnez votre réponse en commentaire avant de lire la suite ! 👇
---
La réponse : {VRAI/FAUX}. {Explication 3-4 lignes + micro-anecdote terrain}
```

---

#### Template FB-05 — Mini-audit en groupe local
**Quand** : 1 fois/semaine max dans un groupe

```
🔍 Je fais 5 mini-audits de photos d'annonces cette semaine (gratuit).
Si vous vendez à {ville} : commente "OK" et je vous envoie un retour en MP.
(Pas de pub, juste un œil pro sur votre annonce pendant 5 minutes.)
```

⚠️ Dans les groupes : 90% valeur, 10% immobilier. Jamais de pub directe.

---

### 6.4 TIKTOK (5 posts/semaine)

#### Template TT-01 — Face-cam conseil express (20-30 sec)
**Quand** : Mardi

```
0-2s : Gros plan sérieux. "Personne ne vous dit ça avant d'acheter…"
2-20s : 3 points en jump cuts (3-5 sec/point) + texte incrusté
20-28s : CTA "Sauvegardez. Commente 'CHECK'. Follow pour un conseil chaque mardi."

Sous-titres toujours. Musique tendance 5-10%. Cuts rapides.
```

---

#### Template TT-02 — Visite / Tour personnalisé (30-45 sec)
**Quand** : Lundi (série numérotée "Visite minute Pt. {N}")

```
0-3s : Marcher vers le bien. Texte : "Ce que {prix}€ achètent à {ville} 🏡"
3-10s : Pièce WOW EN PREMIER (pas l'entrée)
10-30s : Cuts rapides + commentaire vocal + montrer les défauts aussi
30-40s : Moment personnalité (humour, réaction spontanée)
40-45s : "Vous achetez ? Oui ou non en commentaire. Follow !"

⚠️ MENTIONS dans la description : prix, honoraires, DPE
```

---

#### Template TT-03 — Storytelling anecdote (30-40 sec)
**Quand** : Mercredi

```
0-3s : "L'histoire de ma pire vente de 2025…" [gorgée de café]
3-10s : Contexte rapide (vendeur, prix, situation)
10-25s : Le problème inattendu (vice caché, offre retirée, négo qui dérape)
25-35s : Comment vous avez géré + 1 phrase de sagesse
35-40s : "Racontez-moi votre pire anecdote en commentaire."
```

---

#### Template TT-04 — Quartier spotlight
**Quand** : Jeudi

```
0-3s : Plan quartier + "Le quartier le plus sous-coté de {ville}"
3-15s : 3 plans rapides + voix off 3 faits
15-25s : Prix moyen en texte + comparaison quartier voisin
25-30s : CTA "DM moi — je connais ce quartier par cœur."
```

---

#### Template TT-05 — Humour / coulisses
**Quand** : Vendredi

Types :
- POV : "Quand le client dit 'on va réfléchir'…"
- "Les messages les plus absurdes que je reçois"
- Compilation moments drôles de la semaine
- Trend-jack adapté à l'immobilier

Ce qu'il ne faut JAMAIS faire sur TikTok :
- Commencer par "Bonjour, je suis [prénom], aujourd'hui…" → scroll immédiat
- Poster des photos de listing sans personnalité
- Utiliser de la musique non libre de droits sur compte pro (risque juridique FR)
- Être corporate/formel — TikTok récompense l'authenticité brute
- Supprimer les vidéos "ratées" — elles peuvent revivre dans l'algorithme


---

## 7. Calendrier éditorial

### 7.0 Adaptation à la fréquence choisie

Le calendrier complet ci-dessous correspond à la fréquence "À fond" (5/sem). Les autres fréquences sélectionnent un sous-ensemble :

**🌱 "Doucement" (2/semaine)** : 
- LinkedIn : lundi (LI-01) + mercredi (LI-02 ou LI-04)
- Instagram : mardi (IG-02 Reel quartier) + vendredi (IG-05 preuve sociale)
- Facebook : mardi (FB-01 communautaire) + vendredi (FB-03 vendu)
- TikTok : mardi (TT-01 conseil) + vendredi (TT-05 humour)

**🌿 "Régulièrement" (3-4/semaine)** :
- LinkedIn : lundi + mercredi + vendredi (calendrier complet LinkedIn = 3/sem)
- Instagram : lundi (IG-01) + mardi (IG-02) + jeudi (IG-04) — skip mercredi/vendredi
- Facebook : mardi (FB-01) + jeudi (FB-04) + vendredi (FB-03)
- TikTok : lundi (TT-02) + mardi (TT-01) + vendredi (TT-05)

**🌳 "À fond" (5/semaine)** : calendrier complet ci-dessous.

Le moteur utilise le champ `publishing_frequency` du profil pour filtrer les jours proposés dans le calendrier de la semaine.

### 7.1 LinkedIn — 3 posts/semaine

| Semaine | Lundi | Mercredi | Vendredi |
|---|---|---|---|
| S1 | LI-01 Analyse marché | LI-02 Étude de cas | LI-03 Opinion contrarian |
| S2 | LI-01 Chiffre semaine | LI-04 Coulisses négo | LI-05 Recrutement |
| S3 | LI-01 Décryptage réglementaire | LI-02 Retour expérience client | LI-03 Mythes immobiliers |
| S4 | LI-01 Bilan mensuel | LI-04 Interview partenaire | LI-03 Leçons personnelles |

### 7.2 Instagram — 5 posts/semaine + stories quotidiennes

| Sem | Lundi | Mardi | Mercredi | Jeudi | Vendredi |
|---|---|---|---|---|---|
| S1 | IG-01 Carrousel éducatif | IG-02 Reel quartier | Carrousel listing | IG-04 Reel face-cam | IG-05 Post vendu |
| S2 | IG-01 Carrousel éducatif | IG-02 Reel commerçant | IG-03 Reel visite express | IG-04 Reel conseil | Post coulisses |
| S3 | IG-01 Carrousel éducatif | IG-02 Reel événement | IG-06 Story "Reveal" | Reel avant/après staging | IG-05 Post vendu |
| S4 | IG-01 Carrousel éducatif | IG-02 Reel "Ce que X€ achètent" | Carrousel listing | Reel journée type | Carrousel bilan mois |

Stories quotidiennes (3-5/jour, NON générées — rappel au conseiller) :
- Matin : routine, café, question du jour (sticker)
- Midi : visite en cours, sondage "A ou B ?"
- Soir : teaser lendemain, partage avis client

### 7.3 Facebook — 5 posts/semaine

| Sem | Lundi | Mardi | Mercredi | Jeudi | Vendredi |
|---|---|---|---|---|---|
| S1 | Stat marché | FB-01 Coup de cœur local | Nouveau mandat (vidéo) | FB-04 Quiz | FB-03 Remise de clés |
| S2 | Conseil vendeur | FB-01 Événement local | FB-02 Live visite | FB-04 Vrai ou faux | Coulisses semaine |
| S3 | Point taux + impact | FB-01 Portrait commerçant | Teaser + reveal | "5 questions avant d'acheter" | Avant/après staging |
| S4 | Bilan marché | FB-01 Recommandation resto | Listing + lifestyle | FAQ "vos questions" | Bilan + remerciements |

Actions complémentaires : 1 live/mois min, engagement quotidien 3-5 groupes locaux, 1 concours/trimestre.

### 7.4 TikTok — 5 posts/semaine

| Sem | Lundi | Mardi | Mercredi | Jeudi | Vendredi |
|---|---|---|---|---|---|
| S1 | TT-02 Visite Pt.1 | TT-01 Conseil acheteur | TT-03 Anecdote négo | TT-04 Quartier | TT-05 Humour |
| S2 | TT-02 Visite Pt.2 | TT-01 Erreur vendeur | TT-03 Sauvetage vente | TT-04 Restos secrets | TT-05 POV client |
| S3 | TT-02 Visite Pt.3 | TT-01 Décryptage taux | TT-03 Journée type | TT-04 Quartier sous-coté | TT-05 Sketch |
| S4 | TT-02 Visite Pt.4 | TT-01 Questions visite | TT-03 Pire expérience | TT-04 Guide saisonnier | TT-05 Compilation |

S�ries numérotées : 🏡 "Visite minute Pt.N" (lun) | 💡 "Conseil du mardi" | 📖 "Stories terrain" (mer) | 📍 "Explore {Ville}" (jeu) | 😂 "Vie d'agent" (ven)

---

## 8. Guide anti-IA

### 8.1 Expressions INTERDITES (blacklist du prompt)

| ❌ Interdit | ✅ Remplacement |
|---|---|
| "Dans un monde où…" | Couper. OU : "En ce moment" |
| "Il est essentiel de noter que" | "Le truc important, c'est…" |
| "Il est crucial / fondamental" | Un FAIT, pas un adjectif |
| "N'hésitez pas à me contacter" | "Écrivez-moi" / "Un message et on en parle" |
| "Offrir un accompagnement personnalisé" | "Vous aider à trouver ce qui vous correspond" |
| "Répondre à vos besoins spécifiques" | "Trouver ce qui colle à votre situation" |
| "Un cadre de vie exceptionnel" | Le DÉTAIL : "à 200 m du tram, vue sur le parc" |
| "Des prestations de qualité" | Les NOMMER : "parquet chêne, double vitrage" |
| "Par ailleurs" / "Néanmoins" / "Ainsi" | "Et puis" / "Mais bon" / "Du coup" |
| "Optimiser votre projet immobilier" | "Que votre projet avance" |
| "Force est de constater" | Dire le constat directement |
| "En conclusion" + résumé | Ne JAMAIS résumer. Finir par le CTA. |
| "Je suis ravi de vous annoncer" | Dire la chose directement |
| "Une équipe dynamique" | Décrire CONCRÈTEMENT |
| Double adjectif : "cohérent et personnalisé" | UN adjectif ou mieux : un fait |

### 8.2 Structures grammaticales interdites

- Paragraphes de longueur uniforme
- Phrases systématiquement longues et complexes
- Tirets longs (—) en excès
- Listes à puces dans un post LinkedIn texte
- Début par question rhétorique générique ("Vous êtes-vous déjà demandé…?")

### 8.3 Règles de style OBLIGATOIRES

1. **Ancrage terrain** : AU MOINS 1 détail local par post (rue, quartier, commerce, tram)
2. **Micro-émotion** : 1 élément sensoriel ou émotionnel ("l'odeur du café", "le sourire du couple")
3. **Défauts assumés** : dans les posts listing, mentionner AU MOINS 1 défaut honnête
4. **Rythme variable** : court (2-5 mots). Puis long (15-25 mots). Stop. Humains = "bursty"
5. **Vocabulaire terrain** : "pige", "mandat", "compromis", "négo", "estimation", "le notaire qui traîne"
6. **Chiffres vérifiables** : jamais inventer de stats. Utiliser données CRM ou "sur mes X ventes"
7. **CTA non agressif** : "Si tu veux, je t'explique" — JAMAIS "CONTACTEZ-MOI VITE"
8. **Preuve > Promesse** : "3 visites, 1 offre, vendu en 12 jours" > "Résultats exceptionnels"
9. **Temporalité réelle** : "ce matin", "cette semaine" (données CRM = timestamps réels)
10. **Test de l'ami** : si ça sonne comme une brochure, c'est raté

### 8.4 Avant/après exemples

**Marché local :**

❌ IA : "Le marché immobilier traverse actuellement une phase de transformation importante. Il est crucial pour les acheteurs et les vendeurs de comprendre les tendances actuelles afin de prendre des décisions éclairées."

✅ WAIMMO : "Les taux ont encore bougé cette semaine : 3,45 % sur 20 ans chez ma courtière partenaire, contre 3,62 % il y a un mois. Concrètement ? Pour un emprunt de 200 000 €, ça fait 35 €/mois de moins. Pas révolutionnaire, mais ça redonne un peu d'air aux primo-accédants sur Bordeaux Sud."

**Recrutement :**

❌ IA : "Rejoignez notre équipe dynamique ! Nous offrons des commissions attractives, un accompagnement personnalisé et des outils performants."

✅ WAIMMO : "Sophie a rejoint il y a 8 mois. Avant, assistante RH. Sa première vente ? Un studio à Talence. Elle a failli raccrocher la 2e semaine — le syndrome du téléphone qui sonne pas, on connaît tous. Aujourd'hui, 4 mandats. Ce qui l'a fait rester ? Pas la commission. Le coup de fil d'un client qui l'a remerciée."

---

## 9. Conformité et mentions légales

### 9.1 Mentions obligatoires France (Loi Hoguet + Arrêté 2017)

Sur tout post mentionnant un bien à vendre (y compris Reels, Stories, TikTok) :
- Prix de vente (honoraires inclus si charge acquéreur)
- Qui paie les honoraires
- Montant honoraires TTC en %
- Classe DPE et GES
- Surface habitable (Carrez si copro)
- "Logement à consommation énergétique excessive" si F/G

Le moteur DOIT :
- Détecter si le post mentionne un bien spécifique
- Si oui → ajouter les mentions dans la légende
- Si données CRM incomplètes → flag "⚠️ Mentions incomplètes — vérifiez avant de publier"

**Template mentions** (fin de légende) :
```
---
{Prix} € FAI | Honoraires : {taux}% TTC charge {acquéreur/vendeur}
DPE : {classe} | GES : {classe} | Surface : {surface} m²
```

### 9.2 Bio / profil

```
{Prénom Nom} — Agent commercial en immobilier
Réseau {nom} | RSAC {ville} n°{X} | CCI {ville}
Barème honoraires : {lien}
```

### 9.3 RGPD et droit à l'image

- Noms clients → TOUJOURS anonymiser ("un couple primo-accédant", pas "Thomas et Julie")
- Les données CRM (first_name, last_name) ne sont JAMAIS injectées sans anonymisation
- Si prénom mentionné → flag "⚠️ Consentement écrit nécessaire"

**Disclaimer témoignage** :
```
Témoignage partagé avec le consentement écrit du client. Les résultats varient selon le marché.
```

### 9.4 Disclaimer recrutement

```
Les résultats mentionnés sont ceux de conseillers expérimentés et ne constituent pas une garantie.
Rémunération variable selon activité personnelle et conditions de marché. Statut agent commercial, non salarié.
```

### 9.5 Conseils juridiques / financiers

Quand le post parle de taux, fiscalité, crédit :
- "Informations d'ordre général. Pour votre situation, consultez votre notaire / courtier."
- JAMAIS "garanti", "sans risque", "coup sûr"

### 9.6 Check conformité (output JSON)

```json
{
  "hoguet": "pass | warn",
  "hoguet_missing": ["prix", "DPE"],
  "rgpd": "pass | warn",
  "rgpd_detail": "Prénom client détecté",
  "disclaimer_needed": "none | temoignage | recrutement | conseil_financier",
  "approved": true
}
```

---

## 10. Recommandations visuelles

### Matrice visuelle par template

| Template | Type visuel | Instruction |
|---|---|---|
| LI-01 Analyse marché | Rien OU photo terrain | "Post texte pur recommandé." |
| LI-02 Étude de cas | Carrousel PDF OU texte | "Si carrousel : slides fond couleur + texte." |
| LI-03 Contrarian | Rien | "Post texte pur. Très bien sur LinkedIn." |
| LI-04 Bilan | Photo terrain | "Photo de vous en visite. Smartphone OK." |
| LI-05 Recrutement | Photo équipe | "Photo réelle avec la personne (avec accord)." |
| IG-01 Carrousel éducatif | Carrousel 5-7 slides | "Fond couleur + texte lisible + logo. 1080x1350px." |
| IG-02 Reel quartier | Vidéo smartphone | "Filmez en marchant. 25-35 sec." |
| IG-03 Reel visite | Vidéo du bien | "Pièce WOW en premier. Cuts rapides. 30-45 sec." |
| IG-04 Reel face-cam | Vidéo face caméra | "Buste, fond neutre. Jump cuts. 20-30 sec." |
| IG-05 Vendu | Photo réelle | "Selfie remise de clés. PAS de Canva." |
| FB-01 Communautaire | Photo smartphone | "Photo du commerce/commerçant." |
| FB-02 Live | Live smartphone | "Smartphone + stabilisateur. Commencez dehors." |
| FB-04 Quiz | Rien OU infographie | "Post texte OK." |
| TT-01 Face-cam | Vidéo face caméra | "Cadrage serré. Jump cuts. Sous-titres." |
| TT-02 Visite | Vidéo du bien | "Marcher vers le bien. Pièce WOW en premier." |
| TT-03 Storytelling | Vidéo face caméra | "Caméra posée. Gorgée de café." |
| TT-04 Quartier | Vidéo smartphone | "B-roll quartier. Voix off. 25-30 sec." |
| TT-05 Humour | Vidéo libre | "Créatif. Trend-jack." |


---

## 11. Prompts complets

### 11.1 System prompt — generate-social-post.js

Ce prompt est le cœur du moteur. Il est long (~3500 tokens) parce qu'il intègre toute l'intelligence métier. Les variables entre {accolades} sont injectées dynamiquement par l'Edge Function.

```
Tu es le ghostwriter d'un conseiller immobilier indépendant français. Tu écris DANS SA VOIX, pas dans la tienne. Tu produis des posts prêts à copier-coller.

## IDENTITÉ DU CONSEILLER
- Prénom : {prenom}
- Ville : {ville}
- Quartiers : {neighborhoods}
- Réseau : {network}
- Ton : {tone} (professionnel | décontracté | mixte)
- Tutoiement : {tutoiement} (true = tu/ton, false = vous/votre)
- Expressions favorites : {signature_phrases}

## CONTEXTE DU JOUR
- Date : {date}
- Jour : {jour_semaine}
- Semaine : {semaine_numero} (S1/S2/S3/S4)
- Plateforme : {platform}
- Template : {template_id}
- Objectif : {objective}
- Format : {format_type}

## DONNÉES CRM RÉELLES
{crm_context}

## INPUT DU CONSEILLER (si mode libre)
{user_input}

## HOOKS RÉCENTS (ne PAS réutiliser)
{recent_hooks}

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
- Si le post mentionne un bien à vendre : vérifier que prix/honoraires/DPE/surface sont dans les données CRM. Si absents, flag "warn" dans compliance_flags.
- Si recrutement + résultats → ajouter disclaimer dans compliance_flags
- Anonymiser TOUJOURS les noms de clients (utiliser descriptions : "un couple primo-accédant")

## RÈGLES ABSOLUES — TU NE DOIS JAMAIS :
- Utiliser ces expressions : "dans un monde où", "il est essentiel", "n'hésitez pas", "accompagnement personnalisé", "besoins spécifiques", "cadre de vie exceptionnel", "prestations de qualité", "par ailleurs", "néanmoins", "ainsi", "en outre", "force est de constater", "dans cette optique", "à cet égard", "je suis ravi", "équipe dynamique", "en conclusion" + résumé
- Écrire des doubles adjectifs ("cohérent et personnalisé, adapté aux besoins")
- Écrire des paragraphes de longueur uniforme
- Commencer par "Bonjour, aujourd'hui je vais parler de…"
- Utiliser des superlatifs non justifiés
- Inventer des statistiques ou des chiffres
- Inclure les vrais noms des clients
- Réutiliser un hook de la liste {recent_hooks}

## STRUCTURE
Suivre la structure du template {template_id} :
{template_structure}

Le post enchaîne naturellement : HOOK → CONTEXTE → VALEUR → PREUVE → CTA.
Pas de titres visibles entre les sections.

## FORMAT DE SORTIE (JSON strict)
{
  "hook": "le hook seul (pour tracking)",
  "hook_pattern": "chiffre_choc | contrarian | storytelling | quiz | prix_ville | lifestyle | reconversion | opinion | revelation | erreur_couteuse | secret_local | futur_proche | honnetete_brute | cta_mot_cle",
  "content": "le post complet prêt à copier-coller",
  "visual_recommendation": "instruction visuelle pour le conseiller",
  "completeness": {
    "hook_quality": true,
    "local_anchor": true,
    "terrain_proof": true,
    "cta_present": true,
    "details": "Hook chiffré (15k€), ancrage Lyon 3e + rue Garibaldi, preuve terrain (visite ce matin), CTA question ouverte"
  },
  "compliance_flags": {
    "hoguet": "pass | warn",
    "hoguet_missing": [],
    "rgpd": "pass | warn",
    "rgpd_detail": "",
    "disclaimer_needed": "none | temoignage | recrutement | conseil_financier"
  },
  "word_count": 0
}
```

### 11.2 System prompt — Analyse de voix (onboarding)

Appelé une fois quand le conseiller colle ses posts existants.

```
Tu es un analyste de style rédactionnel. À partir de posts réseaux sociaux écrits par un conseiller immobilier, extrais son profil de voix.

Analyse les posts fournis et produis ce JSON :

{
  "tone": "professionnel | decontracte | mixte",
  "tutoiement": true | false,
  "avg_sentence_length": "courte | moyenne | longue",
  "sentence_variation": "faible | moyenne | forte",
  "emoji_usage": "jamais | rare | modéré | fréquent",
  "formality_score": 1-10,
  "proof_style": "anecdotes | chiffres | les_deux | aucun",
  "cta_style": "direct | doux | question | absent",
  "signature_phrases": ["expressions récurrentes"],
  "vocabulary_level": "terrain | standard | soutenu",
  "strengths": ["ce qui fonctionne bien"],
  "improvements": ["ce qui pourrait être amélioré"]
}

Analyse UNIQUEMENT les posts fournis. Ne fais pas d'hypothèses.
```

### 11.3 System prompt — Check conformité (optionnel, Haiku)

```
Vérifie ce post immobilier :

1) HOGUET : si le post mentionne un bien à vendre, vérifie :
   prix, honoraires %, charge acquéreur/vendeur, DPE+GES, surface.
   Si absent → "warn" + liste manquants.

2) RGPD : si prénoms/noms de clients → "warn".
   Descriptions anonymes ("un couple") = OK.

3) DISCLAIMER : recrutement + résultats → "recrutement".
   Taux/fiscalité → "conseil_financier". Témoignage client → "temoignage".

Sortie JSON :
{
  "hoguet": "pass | warn",
  "hoguet_missing": [],
  "rgpd": "pass | warn",
  "rgpd_detail": "",
  "disclaimer_needed": "none | temoignage | recrutement | conseil_financier",
  "approved": true | false
}
```

---

## 12. Onboarding profil social

### 12.1 Parcours en 3 étapes

**Étape 1 — Infos de base** (formulaire, 1 minute) :
- Ville et quartiers (multi-tags, comme search_city des acquéreurs)
- Réseau (dropdown : Efficity, IAD, Safti, Capifrance, eXp, KW, indépendant, autre)
- Plateformes actives (checkboxes : LinkedIn, Instagram, Facebook, TikTok)
- RSAC et CCI (pour mentions légales auto)

**Étape 2 — Ton style et ta cadence** (3 questions + 1 champ optionnel) :
- Curseur : Professionnel ←→ Décontracté
- "Tu tutoies ton audience ?" Oui / Non / Ça dépend
- Fréquence de publication : "Je veux partager…"
  - 🌱 "Doucement" (2 posts/semaine) — idéal pour démarrer
  - 🌿 "Régulièrement" (3-4 posts/semaine) — bon équilibre visibilité/effort
  - 🌳 "À fond" (5 posts/semaine) — pour ceux qui veulent maximiser leur présence
  Le calendrier éditorial s'adapte automatiquement à la fréquence choisie (seuls les jours les plus impactants sont conservés en mode "Doucement").
- Champ optionnel : "Colle 3 à 5 de tes meilleurs posts"

**Étape 3 — Analyse de voix** (si posts collés) :
- L'IA analyse et affiche le profil : "Ton mixte, phrases courtes, peu d'emojis, chiffres + anecdotes."
- Le conseiller peut corriger

Si pas de posts collés : profil créé avec le formulaire. S'affine au fil des modifications.

### 12.2 Enrichissement progressif

Après 20+ posts modifiés par le conseiller, le système extrait les patterns :
- "on" au lieu de "nous" → prompt s'adapte
- Supprime toujours les emojis → prompt arrête d'en mettre
- Stocké dans `voice_profile` (JSONB)

---

## 13. Implémentation technique

### 13.1 Fichiers à créer / modifier

```
WAIMMO/
├── social.html                    ← CRÉER
├── js/
│   └── social.js                  ← CRÉER
└── api/
    └── generate-social-post.js    ← CRÉER
```

### 13.2 Edge Function — generate-social-post.js

```javascript
import { verifyAuth, withCORS } from './_auth.js';

export default async function handler(req) {
  const { user, supabase } = await verifyAuth(req);
  const { mode, platform, user_input, template_override } = await req.json();
  // mode: 'suggestion' | 'free_input'

  // 1. Charger profil social
  const { data: profile } = await supabase
    .from('social_profiles').select('*')
    .eq('user_id', user.id).single();

  // 2. Charger hooks récents (30 jours)
  const { data: recentHooks } = await supabase
    .from('social_posts').select('hook, hook_pattern')
    .eq('user_id', user.id).eq('platform', platform)
    .gte('generated_at', new Date(Date.now() - 30*24*60*60*1000).toISOString());

  // 3. Charger contexte CRM
  const crmContext = await buildCRMContext(supabase, user.id);

  // 4. Déterminer template du jour
  const today = getDayInfo(); // {jour: 'mardi', semaine: 'S2'}
  const template = template_override || getTemplateForDay(platform, today.jour, today.semaine);

  // 5. Construire et appeler Claude
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: buildSystemPrompt(profile, today, template, crmContext, recentHooks),
      messages: [{
        role: 'user',
        content: mode === 'free_input'
          ? `Génère un post ${platform} à partir de ce vécu : "${user_input}"`
          : `Génère le post ${platform} du jour (${template.id}) avec les données CRM fournies.`
      }]
    })
  });

  const data = await response.json();
  const postData = JSON.parse(data.content[0].text);

  // 6. Sauvegarder en DB
  await supabase.from('social_posts').insert({
    user_id: user.id,
    platform,
    content: postData.content,
    hook: postData.hook,
    hook_pattern: postData.hook_pattern,
    template_id: template.id,
    objective: template.objective,
    format_type: template.format_type,
    visual_recommendation: postData.visual_recommendation,
    compliance_flags: postData.compliance_flags,
    source_type: mode === 'free_input' ? 'user_input' : 'calendar_suggestion',
    source_data: mode === 'free_input' ? { user_input } : { crm_events: crmContext },
    calendar_day: today.jour,
    status: 'draft'
  });

  return new Response(JSON.stringify(postData), {
    headers: { 'Content-Type': 'application/json', ...withCORS() }
  });
}

// Helper : construire le contexte CRM
async function buildCRMContext(supabase, userId) {
  const fourteenDaysAgo = new Date(Date.now() - 14*24*60*60*1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();

  const [sales, mandates, visits, notes, sellerCount, buyerCount] = await Promise.all([
    supabase.from('sellers').select('property_type, address, budget, status')
      .eq('user_id', userId).eq('status', 'sold')
      .gte('last_activity_at', fourteenDaysAgo),
    supabase.from('sellers').select('property_type, address, budget, mandate_start_date, status')
      .eq('user_id', userId).eq('status', 'mandate'),
    supabase.from('visits').select('*, sellers(property_type, address), buyers(first_name)')
      .eq('user_id', userId).gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString()),
    supabase.from('lead_notes').select('content, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(3),
    supabase.from('sellers').select('id', { count: 'exact' })
      .eq('user_id', userId).gte('created_at', thirtyDaysAgo),
    supabase.from('buyers').select('id', { count: 'exact' })
      .eq('user_id', userId).gte('created_at', thirtyDaysAgo),
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
      estimations_count: sellerCount.count || 0
    }
  };
}

// Helper : template du jour (basé sur le calendrier section 7)
function getTemplateForDay(platform, jour, semaine) {
  const CALENDAR = {
    linkedin: {
      lundi:    { S1: 'LI-01', S2: 'LI-01', S3: 'LI-01', S4: 'LI-01' },
      mercredi: { S1: 'LI-02', S2: 'LI-04', S3: 'LI-02', S4: 'LI-04' },
      vendredi: { S1: 'LI-03', S2: 'LI-05', S3: 'LI-03', S4: 'LI-03' },
    },
    instagram: {
      lundi:    { S1: 'IG-01', S2: 'IG-01', S3: 'IG-01', S4: 'IG-01' },
      mardi:    { S1: 'IG-02', S2: 'IG-02', S3: 'IG-02', S4: 'IG-02' },
      mercredi: { S1: 'IG-listing', S2: 'IG-03', S3: 'IG-06', S4: 'IG-listing' },
      jeudi:    { S1: 'IG-04', S2: 'IG-04', S3: 'IG-staging', S4: 'IG-04' },
      vendredi: { S1: 'IG-05', S2: 'IG-coulisses', S3: 'IG-05', S4: 'IG-bilan' },
    },
    facebook: {
      lundi:    { S1: 'FB-stat', S2: 'FB-conseil', S3: 'FB-taux', S4: 'FB-bilan' },
      mardi:    { S1: 'FB-01', S2: 'FB-01', S3: 'FB-01', S4: 'FB-01' },
      mercredi: { S1: 'FB-mandat', S2: 'FB-02', S3: 'FB-reveal', S4: 'FB-listing' },
      jeudi:    { S1: 'FB-04', S2: 'FB-04', S3: 'FB-questions', S4: 'FB-faq' },
      vendredi: { S1: 'FB-03', S2: 'FB-coulisses', S3: 'FB-staging', S4: 'FB-merci' },
    },
    tiktok: {
      lundi:    { S1: 'TT-02', S2: 'TT-02', S3: 'TT-02', S4: 'TT-02' },
      mardi:    { S1: 'TT-01', S2: 'TT-01', S3: 'TT-01', S4: 'TT-01' },
      mercredi: { S1: 'TT-03', S2: 'TT-03', S3: 'TT-03', S4: 'TT-03' },
      jeudi:    { S1: 'TT-04', S2: 'TT-04', S3: 'TT-04', S4: 'TT-04' },
      vendredi: { S1: 'TT-05', S2: 'TT-05', S3: 'TT-05', S4: 'TT-05' },
    }
  };
  return CALENDAR[platform]?.[jour]?.[semaine] || 'LI-01';
}

function getDayInfo() {
  const now = new Date();
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const jour = jours[now.getDay()];
  const dayOfMonth = now.getDate();
  const semaine = dayOfMonth <= 7 ? 'S1' : dayOfMonth <= 14 ? 'S2' : dayOfMonth <= 21 ? 'S3' : 'S4';
  return { jour, semaine, date: now.toISOString().split('T')[0] };
}
```

### 13.3 Frontend — social.js (structure)

```javascript
// Principales fonctions à implémenter :

// 1. Charger/créer le profil social (onboarding si premier usage)
async function loadOrCreateProfile() { ... }

// 2. Afficher le calendrier de la semaine
function renderWeekCalendar(profile, existingPosts) { ... }

// 3. Détecter les événements CRM pour suggestions
async function detectCRMEvents() { ... }

// 4. Générer un post (appel Edge Function)
async function generatePost(mode, platform, userInput) { ... }

// 5. Afficher les résultats avec bloc visuel
function renderPostResult(postData) { ... }

// 6. Actions : copier, régénérer, marquer publié
async function copyPost(postId) { ... }
async function regeneratePost(postId) { ... }
async function markPublished(postId) { ... }

// 7. Historique des posts de la semaine
async function loadWeekPosts() { ... }

// 8. Onboarding modal (profil social)
function showOnboardingModal() { ... }

// 9. Analyse vocale (réutilise audio-recorder.js)
function initVoiceInput() { ... }
```

### 13.4 Coûts estimés

| Scénario | Générations/jour | Coût/jour | Coût/mois |
|---|---|---|---|
| 50 conseillers actifs, 1 gen/jour | 50 | ~2 $ | ~60 $ |
| 100 conseillers actifs, 1 gen/jour | 100 | ~4 $ | ~120 $ |
| 150 conseillers actifs, 1.5 gen/jour | 225 | ~9 $ | ~270 $ |

Coût par génération (1 appel Haiku, all-in) : ~0,04 €

### 13.5 Roadmap d'implémentation

**Sprint 1 (1-2 semaines)** : Profil social (onboarding) + Mode libre (input → 1 post par plateforme active) + Bouton copier. Pas de calendrier.

**Sprint 2 (1-2 semaines)** : Calendrier éditorial + Mode suggestion (événements CRM) + Historique posts + Bloc visuel recommandé.

**Sprint 3 (1-2 semaines)** : Check conformité auto + Anti-répétition hooks + Enrichissement progressif profil voix.

**Sprint 4** : Intégration dans le briefing du matin + Gamification (streak de publication).

---

## Annexe : Sources des études

Ce document est basé sur 3 études indépendantes analysant les mêmes sujets :

1. **Étude Claude** (notre étude) : Analyse terrain de 20+ comptes FR/US (Claire Duny, Lena Amestoy, Julien Raffin, Ryan Serhant, Glennda Baker, Cesar Gutierrez, Vicky Noufal, etc.) avec données Socialinsider 2025, Coffee & Contracts, Cocoon-Immo.

2. **Étude Gemini** : Focus psychologie cognitive et biais (curiosity gap, aversion à la perte, preuve sociale). Sources additionnelles : Digital Consulting Pros, Hootsuite 2025, Sprinklr, NAR 2025.

3. **Étude GPT** : Corpus documenté avec IDs (LI-FR1 à LI-US4, IG-FR1 à IG-US4, etc.), sources algorithmiques officielles (LinkedIn Engineering, TikTok Support), templates à variables IA, CTA à mots-clés. Sources : CNIL, Service-Public, HUD, FTC.

Les hooks, templates, calendriers et règles de ce document sont une synthèse des 3 études, prenant le meilleur de chacune.
