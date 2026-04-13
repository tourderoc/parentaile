-- Plan de migration Phase 3C-A : Structure SQL Normalisée
-- Cible : PostgreSQL 16 on VPS (92.222.10.187 or 145.223.117.145)

-- 1. Table des groupes principale
CREATE TABLE IF NOT EXISTS groupes (
    id TEXT PRIMARY KEY,
    titre TEXT NOT NULL,
    description TEXT,
    theme TEXT,
    createur_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
    createur_pseudo TEXT,
    date_vocal TIMESTAMPTZ NOT NULL,
    date_expiration TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'reprogrammed'
    cancel_reason TEXT,
    reprogrammed_from_id TEXT REFERENCES groupes(id),
    reprogrammed_to_id TEXT REFERENCES groupes(id),
    structure_type TEXT DEFAULT 'libre', -- 'libre' | 'structuree'
    structure JSONB DEFAULT '[]', -- Liste d'étapes [{label, dureeMinutes, micMode}]
    participants_max INTEGER DEFAULT 5,
    message_count INTEGER DEFAULT 0,
    session_state JSONB DEFAULT NULL, -- État temps réel [{currentPhaseIndex, extendedMinutes, sessionActive, phaseStartedAt, sessionStartedAt}]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table des participants (NORMALISÉE)
-- Remplace le champ JSONB 'participants' pour de meilleures performances et requêtes SQL
CREATE TABLE IF NOT EXISTS group_participants (
    groupe_id TEXT REFERENCES groupes(id) ON DELETE CASCADE,
    user_uid TEXT REFERENCES accounts(uid) ON DELETE CASCADE,
    inscrit_vocal BOOLEAN DEFAULT TRUE,
    date_inscription TIMESTAMPTZ DEFAULT NOW(),
    banni BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (groupe_id, user_uid)
);

-- 3. Table des messages du forum de groupe
CREATE TABLE IF NOT EXISTS group_messages (
    id TEXT PRIMARY KEY,
    groupe_id TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    auteur_uid TEXT NOT NULL,
    auteur_pseudo TEXT NOT NULL,
    contenu TEXT NOT NULL,
    date_envoi TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table des évaluations post-session
CREATE TABLE IF NOT EXISTS group_evaluations (
    groupe_id TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    participant_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
    note_ambiance INTEGER,
    note_theme INTEGER,
    note_technique INTEGER,
    ressenti TEXT,
    date_evaluation TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (groupe_id, participant_uid)
);

-- 5. Sorties de participants (gestion bannissement auto)
CREATE TABLE IF NOT EXISTS group_participant_exits (
    groupe_id TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
    exit_count INTEGER DEFAULT 0,
    last_exit_at TIMESTAMPTZ,
    PRIMARY KEY (groupe_id, user_uid)
);

-- 6. Déduplication des rappels envoyés
CREATE TABLE IF NOT EXISTS group_reminders_sent (
    groupe_id TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL, -- '30min' | '15min' | '5min'
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (groupe_id, reminder_type)
);

-- Index pour la performance
CREATE INDEX IF NOT EXISTS idx_groupes_status_date ON groupes(status, date_vocal);
CREATE INDEX IF NOT EXISTS idx_group_messages_groupe ON group_messages(groupe_id, date_envoi);
CREATE INDEX IF NOT EXISTS idx_participants_user ON group_participants(user_uid);
