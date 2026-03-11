-- Migration : Configuration personnalisable des colonnes de pipeline
-- Permet aux conseillers de renommer, masquer et réordonner les colonnes
-- À exécuter dans Supabase SQL Editor

-- =================================================================
-- Table pipeline_configs : config JSONB par utilisateur et pipeline
-- =================================================================

CREATE TABLE pipeline_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pipeline TEXT NOT NULL CHECK (pipeline IN ('sellers', 'buyers')),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, pipeline)
);

-- RLS
ALTER TABLE pipeline_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pipeline configs" ON pipeline_configs
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at (réutilise la fonction existante)
CREATE TRIGGER update_pipeline_configs_updated_at
  BEFORE UPDATE ON pipeline_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index pour lookup rapide par user
CREATE INDEX idx_pipeline_configs_user ON pipeline_configs(user_id);

-- ===================================================================
-- Structure du JSONB config :
-- {
--   "columns": [
--     { "key": "hot", "label": "MES LEADS CHAUDES", "visible": true },
--     { "key": "warm", "label": null, "visible": true },
--     ...
--   ]
-- }
--
-- Pour acquéreurs avec double vue :
-- {
--   "status_columns": [ ... ],
--   "property_columns": [ ... ]
-- }
--
-- - key : correspond à la valeur status en BDD (immuable)
-- - label : null = défaut, string = custom
-- - visible : true/false
-- - L'ordre du tableau = ordre d'affichage
-- ===================================================================
