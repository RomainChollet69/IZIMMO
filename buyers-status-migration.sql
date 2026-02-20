-- Migration statuts acquéreurs : passage de 4 à 5 colonnes
-- IMPORTANT : Exécuter dans l'ordre !

-- 1. Supprimer l'ancienne contrainte de statut
ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_status_check;

-- 2. Migrer les données existantes AVANT de créer la nouvelle contrainte
-- Anciens statuts → Nouveaux statuts :
-- 'new' → 'nouveau'
-- 'active' → 'actif'
-- 'bought' → 'achete_avec_moi'
-- 'trouve' → 'achete_avec_moi' (ancien statut si existant)
-- 'lost' → 'abandon'

UPDATE buyers
SET status = CASE
    WHEN status = 'new' THEN 'nouveau'
    WHEN status = 'active' THEN 'actif'
    WHEN status = 'bought' THEN 'achete_avec_moi'
    WHEN status = 'trouve' THEN 'achete_avec_moi'
    WHEN status = 'lost' THEN 'abandon'
    ELSE status
END
WHERE status IN ('new', 'active', 'bought', 'trouve', 'lost');

-- 3. Créer la nouvelle contrainte avec les 5 statuts
ALTER TABLE buyers ADD CONSTRAINT buyers_status_check
CHECK (status IN ('nouveau', 'actif', 'achete_avec_moi', 'achete_ailleurs', 'abandon'));

-- 4. Vérification
SELECT status, COUNT(*) as count
FROM buyers
GROUP BY status
ORDER BY status;
