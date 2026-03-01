/**
 * 011_sellers_rooms.sql
 * Ajoute le champ rooms sur la table sellers.
 * Stocke le nombre de pièces (T1, T2, T3, T4, T5+).
 * Utilisé pour le matching acquéreur/vendeur et l'affichage sur les cartes pipeline.
 */

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS rooms TEXT;
