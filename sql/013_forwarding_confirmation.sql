-- 013_forwarding_confirmation.sql
-- Stocke le lien de confirmation de transfert Gmail/Outlook
-- pour que les utilisateurs puissent valider leur transfert automatique
-- directement depuis la page parametres.

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS forwarding_confirmation_link TEXT,
  ADD COLUMN IF NOT EXISTS forwarding_confirmation_date TIMESTAMPTZ;
