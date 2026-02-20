-- WAIMMO — Social Content Engine — Migrations SQL
-- À exécuter dans l'éditeur SQL de Supabase
-- Sprint 1: Ajoute les nouveaux champs nécessaires aux tables social_profiles et social_posts

-- ===== 1. Mise à jour de la table social_profiles =====

-- Ajouter les nouveaux champs (si ils n'existent pas déjà)
ALTER TABLE social_profiles
ADD COLUMN IF NOT EXISTS network TEXT,
ADD COLUMN IF NOT EXISTS neighborhoods TEXT[],
ADD COLUMN IF NOT EXISTS tutoiement BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS platforms_active TEXT[],
ADD COLUMN IF NOT EXISTS signature_phrases TEXT[],
ADD COLUMN IF NOT EXISTS rsac_info TEXT,
ADD COLUMN IF NOT EXISTS legal_mentions TEXT,
ADD COLUMN IF NOT EXISTS voice_profile JSONB,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ajouter un index sur user_id pour les requêtes rapides
CREATE INDEX IF NOT EXISTS idx_social_profiles_user_id ON social_profiles(user_id);

-- Ajouter une contrainte unique sur user_id (un seul profil par user)
ALTER TABLE social_profiles
ADD CONSTRAINT IF NOT EXISTS social_profiles_user_id_unique UNIQUE (user_id);


-- ===== 2. Mise à jour de la table social_posts =====

-- Ajouter les nouveaux champs (si ils n'existent pas déjà)
ALTER TABLE social_posts
ADD COLUMN IF NOT EXISTS hook TEXT,
ADD COLUMN IF NOT EXISTS hook_pattern TEXT,
ADD COLUMN IF NOT EXISTS template_id TEXT,
ADD COLUMN IF NOT EXISTS objective TEXT,
ADD COLUMN IF NOT EXISTS format_type TEXT,
ADD COLUMN IF NOT EXISTS carousel_slides JSONB,
ADD COLUMN IF NOT EXISTS tiktok_script JSONB,
ADD COLUMN IF NOT EXISTS visual_recommendation TEXT,
ADD COLUMN IF NOT EXISTS compliance_flags JSONB,
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_data JSONB,
ADD COLUMN IF NOT EXISTS calendar_day TEXT,
ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Ajouter les index pour les requêtes anti-répétition et historique
CREATE INDEX IF NOT EXISTS idx_social_posts_hooks ON social_posts(user_id, hook_pattern, generated_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_week ON social_posts(user_id, platform, calendar_day, generated_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_user_date ON social_posts(user_id, generated_at DESC);


-- ===== 3. Row Level Security (RLS) =====

-- Activer RLS sur les deux tables
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;

-- Policy pour social_posts : chaque user ne voit que ses propres posts
DROP POLICY IF EXISTS "Users see own posts" ON social_posts;
CREATE POLICY "Users see own posts" ON social_posts
    FOR ALL
    USING (auth.uid() = user_id);

-- Policy pour social_profiles : chaque user ne voit que son propre profil
DROP POLICY IF EXISTS "Users see own profile" ON social_profiles;
CREATE POLICY "Users see own profile" ON social_profiles
    FOR ALL
    USING (auth.uid() = user_id);


-- ===== 4. Vérification des colonnes existantes =====

-- Si vous avez déjà des données dans ces tables, vérifiez que les colonnes ont bien été ajoutées :
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'social_profiles';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'social_posts';
