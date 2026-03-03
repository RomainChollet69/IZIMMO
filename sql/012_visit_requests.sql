/**
 * 012_visit_requests.sql
 * Table des demandes de visite captées via transfert email depuis les portails immobiliers.
 * Les emails portails (SeLoger, LBC, BienIci, etc.) sont transférés par l'agent
 * vers son adresse Léon unique, parsés par Claude Haiku, et stockés ici.
 * Statuts : pending (en attente), accepted (visite créée), dismissed (ignoré).
 * Dépendances : sellers, visits, buyers, auth.users, user_integrations
 */

-- Table principale des demandes de visite
CREATE TABLE visit_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Source email
    email_message_id TEXT,              -- ID unique pour déduplication
    email_from TEXT,                    -- Expéditeur (noreply@seloger.com, etc.)
    email_subject TEXT,                 -- Objet du mail
    email_date TIMESTAMPTZ,            -- Date de réception
    email_snippet TEXT,                 -- Extrait brut (debug/audit)
    portal_name TEXT,                   -- seloger, leboncoin, bienici, pap, etc.

    -- Données extraites par Claude Haiku
    visitor_name TEXT,
    visitor_first_name TEXT,
    visitor_last_name TEXT,
    visitor_phone TEXT,
    visitor_email TEXT,
    visitor_message TEXT,               -- Message accompagnant la demande

    -- Bien concerné
    property_address TEXT,
    property_reference TEXT,            -- Référence annonce portail
    property_type TEXT,                 -- appartement, maison, etc.
    property_price NUMERIC,

    -- Matching avec un seller existant
    matched_seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
    match_confidence TEXT,

    -- Traitement
    status TEXT NOT NULL DEFAULT 'pending',
    created_visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    created_buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL,
    parsed_data JSONB,                  -- Données brutes Claude pour debug

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contraintes
ALTER TABLE visit_requests ADD CONSTRAINT check_vr_status
    CHECK (status IN ('pending', 'accepted', 'dismissed'));

ALTER TABLE visit_requests ADD CONSTRAINT check_vr_match_confidence
    CHECK (match_confidence IS NULL OR match_confidence IN ('high', 'medium', 'low', 'none'));

-- Déduplication : un email = une seule demande par agent
ALTER TABLE visit_requests ADD CONSTRAINT uq_visit_request_email
    UNIQUE (user_id, email_message_id);

-- RLS
ALTER TABLE visit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own visit requests" ON visit_requests
    FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_vr_user_status ON visit_requests(user_id, status);
CREATE INDEX idx_vr_user_seller ON visit_requests(user_id, matched_seller_id);
CREATE INDEX idx_vr_user_created ON visit_requests(user_id, created_at DESC);

-- Trigger updated_at (réutilise la fonction existante)
CREATE TRIGGER update_visit_requests_updated_at
    BEFORE UPDATE ON visit_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== Colonnes supplémentaires sur user_integrations =====

-- Adresse de transfert unique par agent
ALTER TABLE user_integrations
    ADD COLUMN IF NOT EXISTS inbound_email TEXT,
    ADD COLUMN IF NOT EXISTS inbound_email_token TEXT,
    ADD COLUMN IF NOT EXISTS email_forwarding_active BOOLEAN DEFAULT false;
