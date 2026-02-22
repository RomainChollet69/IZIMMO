-- Migration : Créer la table workflow_steps pour le système de workflows Léon
-- À exécuter dans Supabase SQL Editor

CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE,

  -- Identification du workflow et de l'étape
  workflow_type TEXT NOT NULL,      -- 'warm_seller', 'mandate', 'post_sale', 'active_buyer', 'competitor_watch'
  step_key TEXT NOT NULL,           -- identifiant unique de l'étape dans le workflow
  step_label TEXT NOT NULL,         -- question affichée à l'agent
  sort_order INT NOT NULL,          -- ordre d'affichage (1, 2, 3...)

  -- État de l'étape
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'skipped'

  -- Timing
  due_date TIMESTAMPTZ,             -- date à laquelle l'étape devrait être faite
  completed_at TIMESTAMPTZ,         -- quand l'étape a été complétée

  -- IA
  ai_suggestion TEXT,               -- suggestion contextuelle de Léon
  ai_action TEXT,                   -- action IA proposée (ex: 'generate_message', 'generate_listing')

  -- Notes de l'agent
  agent_response TEXT,              -- réponse de l'agent (dictée vocale ou texte)

  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Contrainte : au moins un seller_id ou buyer_id
  CONSTRAINT check_lead_reference CHECK (seller_id IS NOT NULL OR buyer_id IS NOT NULL)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_workflow_steps_user_pending ON workflow_steps(user_id, status) WHERE status = 'pending';
CREATE INDEX idx_workflow_steps_seller ON workflow_steps(seller_id) WHERE seller_id IS NOT NULL;
CREATE INDEX idx_workflow_steps_buyer ON workflow_steps(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX idx_workflow_steps_due ON workflow_steps(user_id, due_date) WHERE status = 'pending';

-- RLS
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own workflow steps" ON workflow_steps
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at (réutilise la fonction existante update_updated_at)
CREATE TRIGGER update_workflow_steps_updated_at
  BEFORE UPDATE ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
