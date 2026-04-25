-- ══════════════════════════════════════════════════════════════
--  Bridge MedCompanion ↔ Parent'aile — Phase 4
-- ══════════════════════════════════════════════════════════════

-- 4A — Tokens médecin-parent
CREATE TABLE IF NOT EXISTS bridge_tokens (
    token_id        TEXT PRIMARY KEY,
    doctor_id       TEXT NOT NULL,
    patient_id      TEXT,
    patient_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, used, revoked
    parent_uid      TEXT,
    pseudo          TEXT,
    fcm_token       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at         TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bridge_tokens_doctor ON bridge_tokens(doctor_id);
CREATE INDEX IF NOT EXISTS idx_bridge_tokens_status ON bridge_tokens(doctor_id, status);

-- 4B — Notifications médecin → parent
CREATE TABLE IF NOT EXISTS bridge_notifications (
    id                  TEXT PRIMARY KEY,
    type                TEXT NOT NULL,          -- EmailReply, Quick, Info, Broadcast
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    target_parent_id    TEXT,                   -- UID parent ou doctor_id (broadcast)
    token_id            TEXT REFERENCES bridge_tokens(token_id) ON DELETE CASCADE,
    reply_to_message_id TEXT,
    sender_name         TEXT NOT NULL,
    read                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_notifs_token ON bridge_notifications(token_id, created_at DESC);

-- 4C — Messages parent → médecin
CREATE TABLE IF NOT EXISTS bridge_messages (
    id              TEXT PRIMARY KEY,
    token_id        TEXT NOT NULL REFERENCES bridge_tokens(token_id) ON DELETE CASCADE,
    doctor_id       TEXT NOT NULL,
    parent_uid      TEXT NOT NULL,
    parent_email    TEXT,
    child_nickname  TEXT NOT NULL,
    content         TEXT NOT NULL,
    urgency         TEXT NOT NULL DEFAULT 'normal',    -- normal, urgent
    ai_summary      TEXT,
    status          TEXT NOT NULL DEFAULT 'unread',    -- unread, read, replied, archived
    reply_content   TEXT,
    replied_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bridge_messages_doctor ON bridge_messages(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bridge_messages_token ON bridge_messages(token_id, created_at DESC);

-- Permissions
GRANT ALL ON TABLE bridge_tokens TO account_service;
GRANT ALL ON TABLE bridge_notifications TO account_service;
GRANT ALL ON TABLE bridge_messages TO account_service;
