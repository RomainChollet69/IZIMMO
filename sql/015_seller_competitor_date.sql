-- Migration : Ajouter la date de publication de l'annonce concurrente
-- À exécuter dans Supabase SQL Editor

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS competitor_date DATE;

-- Commentaire : date de mise en ligne de l'annonce chez le concurrent,
-- extraite automatiquement par le scraper (Claude Haiku)
