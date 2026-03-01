-- Migration : Ajout compteur mensuel à gamification_profiles
-- À exécuter dans Supabase SQL Editor APRÈS 009_gamification.sql

ALTER TABLE gamification_profiles
  ADD COLUMN monthly_points INT NOT NULL DEFAULT 0,
  ADD COLUMN month_year TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM');
