-- Migration 005 : Ajouter appointment_date à la table sellers
-- Date du RDV physique vendeur — utilisé pour auto-relance à J+15
-- À exécuter dans Supabase SQL Editor

ALTER TABLE sellers
ADD COLUMN IF NOT EXISTS appointment_date DATE;

COMMENT ON COLUMN sellers.appointment_date IS 'Date du RDV physique vendeur — déclenche auto-relance J+15 si aucune relance manuelle';
