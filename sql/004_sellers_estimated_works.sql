/**
 * 004_sellers_estimated_works.sql
 * Ajoute le champ estimated_works sur la table sellers.
 * Permet de prendre en compte le coût des travaux dans le matching budget.
 * Ex: maison à 500k + 100k de travaux = budget réel 600k pour l'acquéreur.
 */

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS estimated_works NUMERIC;
