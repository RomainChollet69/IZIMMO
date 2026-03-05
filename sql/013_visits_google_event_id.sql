/**
 * 013_visits_google_event_id.sql
 * Ajoute google_event_id pour la synchronisation Calendar.
 * Permet de retrouver l'événement Google lors de modification/annulation de visite.
 */
ALTER TABLE visits ADD COLUMN IF NOT EXISTS google_event_id TEXT;
