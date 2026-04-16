-- Notifications internes Parent'aile (remplace collection Firestore parentNotifications)
CREATE TABLE IF NOT EXISTS parent_notifications (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  recipient_uid     TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  read              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  groupe_id         TEXT,
  groupe_titre      TEXT
);

CREATE INDEX IF NOT EXISTS idx_parent_notifs_recipient
  ON parent_notifications(recipient_uid, created_at DESC);

-- Vérifier que groupe_reminders_sent existe déjà (créée lors de la migration groupes)
-- Si pas encore créée :
CREATE TABLE IF NOT EXISTS groupe_reminders_sent (
  groupe_id     TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (groupe_id, reminder_type)
);
