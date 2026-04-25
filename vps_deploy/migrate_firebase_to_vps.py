#!/usr/bin/env python3
"""
Script de migration one-shot : Firestore → PostgreSQL (bridge tables).
Copie les collections tokens, messages, notifications vers bridge_tokens,
bridge_messages, bridge_notifications.

Usage (sur le VPS) :
    cd /root/account-service
    python3 migrate_firebase_to_vps.py [--dry-run]

Pré-requis :
    - firebase-admin installé (déjà présent pour FCM)
    - Service account JSON dans /root/account-service/firebase_service_account.json
    - PostgreSQL account_db accessible localement
    - Tables bridge_* déjà créées (bridge_schema.sql)

Le script est idempotent : ON CONFLICT DO NOTHING sur les PK.
"""

import argparse
import sys
import os
from datetime import datetime, timezone

# ── Firebase Admin ─────────────────────────────────────────────

import firebase_admin
from firebase_admin import credentials, firestore

SA_PATH = os.environ.get(
    "FIREBASE_SA_PATH",
    "/root/account-service/firebase_service_account.json"
)

if not os.path.exists(SA_PATH):
    print(f"ERREUR: fichier service account introuvable: {SA_PATH}")
    sys.exit(1)

cred = credentials.Certificate(SA_PATH)
firebase_admin.initialize_app(cred)
db_fs = firestore.client()

# ── PostgreSQL ─────────────────────────────────────────────────

import psycopg2
from psycopg2.extras import execute_values

PG_DSN = os.environ.get(
    "DATABASE_URL",
    "dbname=account_db user=account_service host=localhost"
)

# ── Helpers ─────���──────────────────────────────────────────────

def ts_to_dt(val) -> datetime | None:
    """Convertit un Firestore Timestamp ou string en datetime UTC."""
    if val is None:
        return None
    if hasattr(val, "seconds"):
        return datetime.fromtimestamp(val.seconds + val.nanos / 1e9, tz=timezone.utc)
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def safe_str(val, default="") -> str:
    if val is None:
        return default
    return str(val)


# ══════════════════════════════════════════════════════════════
#  MIGRATION TOKENS
# ══���═══════════════════════════════════════════════════════════

def migrate_tokens(cur, dry_run: bool) -> int:
    print("\n── Tokens ──────────────────────────────────────────")
    docs = db_fs.collection("tokens").stream()
    rows = []

    for doc in docs:
        data = doc.to_dict()
        token_id = doc.id
        status = safe_str(data.get("status"), "pending")
        created_at = ts_to_dt(data.get("createdAt")) or datetime.now(timezone.utc)
        used_at = ts_to_dt(data.get("usedAt"))
        fcm_token = data.get("fcmToken")
        # Firebase tokens n'ont pas patient_id/patient_name/doctor_id
        # — ces champs viennent de MedCompanion (tokens.json local).
        # On insère avec des valeurs par défaut, MedCompanion les mettra à jour au prochain sync.
        rows.append((
            token_id,
            "medcompanion",           # doctor_id
            "",                       # patient_id (inconnu côté Firebase)
            "",                       # patient_name (idem)
            status,
            data.get("parentUid"),    # parent_uid (si activé)
            data.get("pseudo"),       # pseudo
            fcm_token,
            created_at,
            used_at,
            None,                     # revoked_at
        ))

    print(f"  Firestore: {len(rows)} tokens trouvés")

    if dry_run:
        for r in rows[:5]:
            print(f"    [DRY] {r[0]} status={r[4]} created={r[8]}")
        if len(rows) > 5:
            print(f"    ... et {len(rows) - 5} de plus")
        return len(rows)

    if rows:
        execute_values(cur, """
            INSERT INTO bridge_tokens
                (token_id, doctor_id, patient_id, patient_name, status,
                 parent_uid, pseudo, fcm_token, created_at, used_at, revoked_at)
            VALUES %s
            ON CONFLICT (token_id) DO NOTHING
        """, rows)

    print(f"  PostgreSQL: {cur.rowcount} tokens insérés (doublons ignorés)")
    return len(rows)


# ═════════════��════════════════════════════════════════════════
#  MIGRATION NOTIFICATIONS
# ═══════════════════════��════════════════════════════���═════════

def migrate_notifications(cur, dry_run: bool) -> int:
    print("\n── Notifications ───────────────────────────────────")
    docs = db_fs.collection("notifications").stream()
    rows = []

    for doc in docs:
        data = doc.to_dict()
        notif_id = doc.id
        token_id = safe_str(data.get("tokenId"))
        created_at = ts_to_dt(data.get("createdAt")) or datetime.now(timezone.utc)

        rows.append((
            notif_id,
            safe_str(data.get("type"), "Quick"),
            safe_str(data.get("title"), "Notification"),
            safe_str(data.get("body")),
            safe_str(data.get("targetParentId")),
            token_id if token_id else None,
            data.get("replyToMessageId") or None,
            safe_str(data.get("senderName"), "Médecin"),
            bool(data.get("read", False)),
            created_at,
        ))

    print(f"  Firestore: {len(rows)} notifications trouvées")

    if dry_run:
        for r in rows[:5]:
            print(f"    [DRY] {r[0]} type={r[1]} token={r[5]} read={r[8]}")
        if len(rows) > 5:
            print(f"    ... et {len(rows) - 5} de plus")
        return len(rows)

    # Les notifications ont une FK vers bridge_tokens — on ignore celles
    # dont le token_id n'existe pas dans la table (orphelines).
    inserted = 0
    for r in rows:
        try:
            cur.execute("""
                INSERT INTO bridge_notifications
                    (id, type, title, body, target_parent_id, token_id,
                     reply_to_message_id, sender_name, read, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, r)
            inserted += cur.rowcount
        except Exception as e:
            # FK violation = token orphelin → on skip
            cur.connection.rollback()
            print(f"    SKIP notif {r[0]}: {e}")
            cur = cur.connection.cursor()

    print(f"  PostgreSQL: {inserted} notifications insérées")
    return len(rows)


# ════════��═════════════════════════════════════════════════════
#  MIGRATION MESSAGES
# ══════���═══════════════════════════════════════════════════════

def migrate_messages(cur, dry_run: bool) -> int:
    print("\n── Messages ────────────────────────────────────────")
    docs = db_fs.collection("messages").stream()
    rows = []

    for doc in docs:
        data = doc.to_dict()
        msg_id = doc.id
        token_id = safe_str(data.get("tokenId"))
        created_at = ts_to_dt(data.get("createdAt")) or datetime.now(timezone.utc)
        replied_at = ts_to_dt(data.get("repliedAt"))

        rows.append((
            msg_id,
            token_id,
            safe_str(data.get("doctorId"), "medcompanion"),
            safe_str(data.get("parentUid")),
            data.get("parentEmail"),
            safe_str(data.get("childNickname")),
            safe_str(data.get("content")),
            safe_str(data.get("urgency"), "normal"),
            data.get("aiSummary"),
            safe_str(data.get("status"), "sent"),
            data.get("replyContent"),
            replied_at,
            created_at,
        ))

    print(f"  Firestore: {len(rows)} messages trouvés")

    if dry_run:
        for r in rows[:5]:
            print(f"    [DRY] {r[0]} token={r[1]} status={r[9]} created={r[12]}")
        if len(rows) > 5:
            print(f"    ... et {len(rows) - 5} de plus")
        return len(rows)

    inserted = 0
    for r in rows:
        try:
            cur.execute("""
                INSERT INTO bridge_messages
                    (id, token_id, doctor_id, parent_uid, parent_email,
                     child_nickname, content, urgency, ai_summary,
                     status, reply_content, replied_at, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, r)
            inserted += cur.rowcount
        except Exception as e:
            cur.connection.rollback()
            print(f"    SKIP msg {r[0]}: {e}")
            cur = cur.connection.cursor()

    print(f"  PostgreSQL: {inserted} messages insérés")
    return len(rows)


# ════════════════════════════��═════════════════════════════════
#  MIGRATION COMPTES (accounts Firebase users → VPS accounts)
# ══════════════���═══════════════════════════════��═══════════════

def migrate_accounts(cur, dry_run: bool) -> int:
    """Sync les documents Firestore 'users' vers la table accounts VPS.
    Seuls les comptes absents du VPS sont créés."""
    print("\n── Comptes (users → accounts) ──────────────────────")
    docs = db_fs.collection("users").stream()
    rows = []

    for doc in docs:
        data = doc.to_dict()
        uid = doc.id
        email = safe_str(data.get("email"))
        pseudo = safe_str(data.get("pseudo"), email.split("@")[0] if email else f"user_{uid[:6]}")
        created_at = ts_to_dt(data.get("date_inscription")) or datetime.now(timezone.utc)

        rows.append((uid, email, pseudo, created_at))

    print(f"  Firestore: {len(rows)} users trouvés")

    if dry_run:
        for r in rows[:5]:
            print(f"    [DRY] {r[0]} email={r[1]} pseudo={r[2]}")
        if len(rows) > 5:
            print(f"    ... et {len(rows) - 5} de plus")
        return len(rows)

    inserted = 0
    for uid, email, pseudo, created_at in rows:
        try:
            cur.execute("""
                INSERT INTO accounts (uid, email, pseudo, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (uid) DO NOTHING
            """, (uid, email, pseudo, created_at))
            inserted += cur.rowcount
        except Exception as e:
            cur.connection.rollback()
            # Pseudo dupliqué → ajouter un suffixe
            try:
                cur.execute("""
                    INSERT INTO accounts (uid, email, pseudo, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (uid) DO NOTHING
                """, (uid, email, f"{pseudo}_{uid[:4]}", created_at))
                inserted += cur.rowcount
            except Exception:
                cur.connection.rollback()
                print(f"    SKIP account {uid}: {e}")
                cur = cur.connection.cursor()

    print(f"  PostgreSQL: {inserted} comptes créés (existants ignorés)")
    return len(rows)


# ═══════════════���══════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Migration Firestore → PostgreSQL (bridge)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Afficher ce qui serait migré sans rien écrire")
    parser.add_argument("--skip-accounts", action="store_true",
                        help="Ne pas migrer les comptes users → accounts")
    args = parser.parse_args()

    print("=" * 60)
    print("  Migration Firestore → PostgreSQL")
    print(f"  Mode: {'DRY RUN (lecture seule)' if args.dry_run else 'ÉCRITURE'}")
    print("=" * 60)

    conn = psycopg2.connect(PG_DSN)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        total = 0

        # 1. Tokens en premier (FK parent des autres tables)
        total += migrate_tokens(cur, args.dry_run)

        # 2. Notifications (FK vers tokens)
        total += migrate_notifications(cur, args.dry_run)

        # 3. Messages (FK vers tokens)
        total += migrate_messages(cur, args.dry_run)

        # 4. Comptes users (optionnel)
        if not args.skip_accounts:
            total += migrate_accounts(cur, args.dry_run)

        if not args.dry_run:
            conn.commit()
            print(f"\n✅ Migration terminée — {total} documents traités")
        else:
            print(f"\n📋 DRY RUN terminé — {total} documents seraient migrés")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
