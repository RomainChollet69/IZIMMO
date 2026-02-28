/**
 * 007_visits_buyer_decision.sql
 * Ajoute buyer_decision à la table visits.
 * Permet de distinguer l'impression de l'agent (feedback_rating)
 * de la décision finale de l'acquéreur (buyer_decision).
 * Ex: agent note "intéressant" après la visite, acquéreur décide "refus" 2 jours plus tard.
 */

ALTER TABLE visits ADD COLUMN IF NOT EXISTS buyer_decision TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_buyer_decision'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT check_buyer_decision
      CHECK (buyer_decision IS NULL OR buyer_decision IN (
        'en_attente', 'interesse', 'contre_visite', 'offre', 'refus'
      ));
  END IF;
END $$;
