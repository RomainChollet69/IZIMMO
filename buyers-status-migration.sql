-- Migration statuts acquéreurs : passage de 4 à 5 colonnes

-- 1. Ajouter les nouveaux statuts possibles
-- Note : Supabase utilise un check constraint, on doit le recréer

-- Supprimer l'ancienne contrainte de statut si elle existe
ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_status_check;

-- Ajouter nouvelle contrainte avec les 5 statuts
ALTER TABLE buyers ADD CONSTRAINT buyers_status_check
CHECK (status IN ('nouveau', 'actif', 'achete_avec_moi', 'achete_ailleurs', 'abandon'));

-- 2. Migrer les données existantes
-- Anciens statuts → Nouveaux statuts :
-- 'new' → 'nouveau'
-- 'active' → 'actif'
-- 'bought' → 'achete_avec_moi'
-- 'lost' → 'abandon'

UPDATE buyers
SET status = CASE
    WHEN status = 'new' THEN 'nouveau'
    WHEN status = 'active' THEN 'actif'
    WHEN status = 'bought' THEN 'achete_avec_moi'
    WHEN status = 'lost' THEN 'abandon'
    ELSE status
END
WHERE status IN ('new', 'active', 'bought', 'lost');

-- 3. Vérification
SELECT status, COUNT(*) as count
FROM buyers
GROUP BY status
ORDER BY status;
