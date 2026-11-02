-- Migration 010: Vermittler-Flag und Standard-Vermittler für Kunden
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_vermittler boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vermittler_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
