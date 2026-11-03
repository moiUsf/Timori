-- Migration 008: Admin-Genehmigung für neue Registrierungen
ALTER TABLE users_profile
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approval_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Bestehende Nutzer sofort freischalten (kein Lock-out)
UPDATE users_profile SET approved = true, approval_status = 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS users_profile_approval_token_idx
  ON users_profile (approval_token);
