/**
 * 003_visits_upgrade.sql
 * Upgrade de la table visits pour le suivi acquéreur ↔ vendeur.
 * Ajoute : buyer_id (FK), status, feedback_rating, price_perception, visit_time.
 * Migre les anciens ratings 1-5 vers le nouveau système.
 */

-- 1. Nouvelles colonnes
ALTER TABLE visits ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'effectuee';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS feedback_rating TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS price_perception TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS visit_time TIME;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Index pour les requêtes côté acquéreur
CREATE INDEX IF NOT EXISTS idx_visits_buyer ON visits(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_seller ON visits(seller_id) WHERE seller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(user_id, status);

-- 3. Contraintes de validation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_visit_status'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT check_visit_status
      CHECK (status IN ('planifiee', 'effectuee', 'annulee'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_feedback_rating'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT check_feedback_rating
      CHECK (feedback_rating IS NULL OR feedback_rating IN ('coup_de_coeur', 'interessant', 'pas_convaincu', 'pas_du_tout'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_price_perception'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT check_price_perception
      CHECK (price_perception IS NULL OR price_perception IN ('adapte', 'un_peu_eleve', 'trop_eleve'));
  END IF;
END $$;

-- 4. Migration des anciens ratings (1-5) vers feedback_rating
UPDATE visits SET feedback_rating = CASE
  WHEN rating = 5 THEN 'coup_de_coeur'
  WHEN rating = 4 THEN 'interessant'
  WHEN rating IN (2, 3) THEN 'pas_convaincu'
  WHEN rating = 1 THEN 'pas_du_tout'
  ELSE NULL
END
WHERE rating IS NOT NULL AND feedback_rating IS NULL;

-- 5. Tous les anciens enregistrements sont des visites effectuées
UPDATE visits SET status = 'effectuee' WHERE status IS NULL;
