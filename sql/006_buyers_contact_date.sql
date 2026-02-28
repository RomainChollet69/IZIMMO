/**
 * 006_buyers_contact_date.sql
 * Ajoute la colonne contact_date à la table buyers.
 * Corrige le bug "Could not find the 'contact_date' column".
 */

ALTER TABLE buyers ADD COLUMN IF NOT EXISTS contact_date DATE;
