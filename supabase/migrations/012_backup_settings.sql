-- Migration 012: Backup-Einstellungen im Profil speichern
-- (bisher nur im localStorage des Browsers → gingen bei anderem Port/Browser/gelöschten Daten verloren)
ALTER TABLE users_profile
  ADD COLUMN IF NOT EXISTS backup_schedule text NOT NULL DEFAULT 'never'
    CHECK (backup_schedule IN ('never', 'daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS backup_time text NOT NULL DEFAULT '02:00',
  ADD COLUMN IF NOT EXISTS last_backup_at timestamptz;
