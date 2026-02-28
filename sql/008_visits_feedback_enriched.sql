/**
 * 008_visits_feedback_enriched.sql
 * Enrichit le feedback de visite avec points positifs, négatifs et quartier.
 * Stockés en text[] (arrays PostgreSQL) pour les chips multi-sélection.
 */

ALTER TABLE visits ADD COLUMN IF NOT EXISTS positive_points TEXT[];
ALTER TABLE visits ADD COLUMN IF NOT EXISTS negative_points TEXT[];
ALTER TABLE visits ADD COLUMN IF NOT EXISTS neighborhood_feel TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_neighborhood_feel'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT check_neighborhood_feel
      CHECK (neighborhood_feel IS NULL OR neighborhood_feel IN (
        'connait_bien', 'decouvre', 'pas_convaincu'
      ));
  END IF;
END $$;
