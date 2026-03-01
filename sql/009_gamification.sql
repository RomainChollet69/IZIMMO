-- Migration : Système de gamification (log d'événements + profils agrégés)
-- À exécuter dans Supabase SQL Editor

-- ===== TABLE 1 : LOG DES ÉVÉNEMENTS =====
-- Chaque action gamifiée crée une entrée pour historique/audit
CREATE TABLE gamification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL,          -- 'create_lead', 'add_note', 'move_stage', etc.
  points INT NOT NULL,                -- points attribués (après multiplicateur)
  multiplier REAL NOT NULL DEFAULT 1.0,  -- 1.0 normal, 2.0 si bonus aléatoire
  context JSONB,                      -- metadata optionnelle {lead_id, lead_type, from_stage, to_stage...}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_gamification_log_user ON gamification_log(user_id);
CREATE INDEX idx_gamification_log_user_date ON gamification_log(user_id, created_at);

-- RLS : chaque utilisateur voit uniquement ses propres données
ALTER TABLE gamification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own gamification log" ON gamification_log
  FOR ALL USING (auth.uid() = user_id);

-- ===== TABLE 2 : PROFIL AGRÉGÉ =====
-- Score total, streak, niveau — mis à jour à chaque action
CREATE TABLE gamification_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  total_points INT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,      -- jours consécutifs avec >=3 actions
  longest_streak INT NOT NULL DEFAULT 0,
  last_active_date DATE,                       -- dernière date avec >=3 actions
  level INT NOT NULL DEFAULT 1,
  actions_today INT NOT NULL DEFAULT 0,
  today_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gamification_profiles_user ON gamification_profiles(user_id);

-- RLS
ALTER TABLE gamification_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own gamification profile" ON gamification_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Trigger auto-update updated_at (réutilise la fonction existante si disponible)
DO $$
BEGIN
  -- Vérifie si la fonction update_updated_at existe déjà
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    CREATE TRIGGER update_gamification_profiles_updated_at
      BEFORE UPDATE ON gamification_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  ELSE
    -- Crée la fonction si elle n'existe pas
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER update_gamification_profiles_updated_at
      BEFORE UPDATE ON gamification_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
