-- 016_sellers_rdv_planned.sql
-- Ajoute le suivi du RDV vendeur PLANIFIÉ (futur) sur la fiche prospect.
-- Distinct de appointment_date / rdv_done qui tracent un RDV physique DÉJÀ EFFECTUÉ.
-- Permet de planifier le RDV dans Google Calendar depuis la fiche, d'afficher
-- "RDV planifié le X" et d'éviter les doublons (annulation/replanification).

ALTER TABLE sellers
    -- Date + heure du RDV vendeur planifié (timestamptz, fuseau Europe/Paris géré côté API)
    ADD COLUMN IF NOT EXISTS rdv_scheduled_at TIMESTAMPTZ,
    -- ID de l'événement Google Calendar associé (pour update/delete et anti-doublon)
    ADD COLUMN IF NOT EXISTS rdv_google_event_id TEXT;
