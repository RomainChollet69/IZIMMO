-- Migration statuts acquéreurs : VERSION 2 (robuste)
-- IMPORTANT : Exécuter buyers-status-diagnosis.sql D'ABORD pour voir les statuts actuels

-- 1. Supprimer TOUTES les contraintes check sur le statut
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'buyers' AND con.contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE buyers DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    END LOOP;
END $$;

-- 2. Migrer TOUTES les données existantes (tous les cas possibles)
-- Statuts possibles vus dans le code : new, active, bought, trouve, lost
UPDATE buyers
SET status = CASE
    -- Anglais vers français
    WHEN status = 'new' THEN 'nouveau'
    WHEN status = 'active' THEN 'actif'
    WHEN status = 'bought' THEN 'achete_avec_moi'
    WHEN status = 'lost' THEN 'abandon'
    WHEN status = 'trouve' THEN 'achete_avec_moi'
    -- Déjà en français (si migration partielle précédente)
    WHEN status = 'nouveau' THEN 'nouveau'
    WHEN status = 'actif' THEN 'actif'
    WHEN status = 'achete_avec_moi' THEN 'achete_avec_moi'
    WHEN status = 'achete_ailleurs' THEN 'achete_ailleurs'
    WHEN status = 'abandon' THEN 'abandon'
    -- Fallback : mettre en "nouveau" si statut inconnu
    ELSE 'nouveau'
END;

-- 3. Vérifier qu'il ne reste que les 5 statuts valides
SELECT status, COUNT(*) as count
FROM buyers
GROUP BY status
ORDER BY status;

-- 4. Créer la nouvelle contrainte avec les 5 statuts
ALTER TABLE buyers ADD CONSTRAINT buyers_status_check
CHECK (status IN ('nouveau', 'actif', 'achete_avec_moi', 'achete_ailleurs', 'abandon'));

-- 5. Vérification finale
SELECT 'Migration terminée !' as message,
       COUNT(*) as total_buyers,
       COUNT(DISTINCT status) as nombre_statuts
FROM buyers;
