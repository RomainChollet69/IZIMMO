-- Diagnostic des statuts acquéreurs
-- Exécuter ce fichier AVANT la migration pour voir l'état actuel

-- 1. Voir tous les statuts actuels et leur nombre
SELECT status, COUNT(*) as count
FROM buyers
GROUP BY status
ORDER BY status;

-- 2. Voir les contraintes actuelles sur la table buyers
SELECT con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'buyers'
  AND con.contype = 'c';  -- 'c' = check constraint

-- 3. Voir un échantillon de lignes pour comprendre la structure
SELECT id, first_name, last_name, status, created_at
FROM buyers
LIMIT 10;
