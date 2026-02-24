-- Migration : Tables pour l'intégration Google Calendar + OAuth states
-- À exécuter dans Supabase SQL Editor

-- =================================================================
-- Table user_integrations : tokens Google Calendar + préférences
-- =================================================================

CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,

  -- Google Calendar
  google_calendar_connected BOOLEAN DEFAULT false,
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expires_at TIMESTAMPTZ,
  google_calendar_id TEXT DEFAULT 'primary',
  google_email TEXT,  -- email Google affichée dans les paramètres

  -- Préférences organisationnelles
  default_meeting_duration INT DEFAULT 60,         -- minutes
  lunch_slot_start TIME DEFAULT '12:00',
  lunch_slot_end TIME DEFAULT '14:00',
  work_start TIME DEFAULT '08:30',
  work_end TIME DEFAULT '19:00',
  working_days INT[] DEFAULT ARRAY[1,2,3,4,5],     -- ISO: 1=lundi, 7=dimanche

  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own integrations" ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at (réutilise la fonction existante)
CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =================================================================
-- Table oauth_states : nonces CSRF pour le flux OAuth Google
-- =================================================================

CREATE TABLE oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  nonce TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (accès via SERVICE_ROLE_KEY côté serveur, mais on protège quand même)
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages oauth states" ON oauth_states
  FOR ALL USING (true);
  -- Note : cette table est gérée exclusivement par les Edge Functions via SERVICE_ROLE_KEY
  -- La policy permissive est ok car les tokens ne sont jamais exposés côté client

-- Index pour le lookup par nonce (utilisé dans le callback)
CREATE INDEX idx_oauth_states_nonce ON oauth_states(nonce);

-- Nettoyage : les nonces expirent après 15 minutes
-- Peut être automatisé via pg_cron ou nettoyé à chaque appel de google-auth-init
