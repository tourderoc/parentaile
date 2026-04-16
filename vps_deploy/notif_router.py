"""
Router notifications internes Parent'aile.
CRUD parent_notifications + cron rappels vocaux + push FCM.
"""

import os
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from db import pool

logger = logging.getLogger("notif")

APP_URL = os.environ.get("APP_URL", "https://parentaile.web.app")

# ── Firebase Admin (FCM push) ──────────────────────────────────
_firebase_app = None

def _init_firebase():
    global _firebase_app
    if _firebase_app is not None:
        return
    try:
        import firebase_admin
        from firebase_admin import credentials
        key_path = os.environ.get(
            "FIREBASE_SERVICE_ACCOUNT_KEY",
            "/root/account-service/firebase-service-account.json",
        )
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            _firebase_app = firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialisé (FCM prêt)")
        else:
            logger.warning(f"Clé service account introuvable : {key_path} — FCM désactivé")
    except Exception as e:
        logger.error(f"Erreur init Firebase Admin : {e}")


def _send_fcm(token: str, title: str, body: str, data: dict | None = None):
    """Envoie un push FCM. Silencieux en cas d'erreur."""
    try:
        _init_firebase()
        if _firebase_app is None:
            return
        from firebase_admin import messaging
        msg = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
            webpush=messaging.WebpushConfig(
                fcm_options=messaging.WebpushFCMOptions(
                    link=f'{APP_URL}{data.get("link", "/espace/dashboard")}' if data else f"{APP_URL}/espace/dashboard"
                )
            ),
        )
        messaging.send(msg)
    except Exception as e:
        logger.warning(f"FCM send failed: {e}")


# ── Models ──────────────────────────────────────────────────────

class NotifCreate(BaseModel):
    type: str
    recipient_uid: str
    title: str
    body: str
    groupe_id: Optional[str] = None
    groupe_titre: Optional[str] = None
    notif_id: Optional[str] = None
    send_push: bool = False


class NotifOut(BaseModel):
    id: str
    type: str
    recipient_uid: str
    title: str
    body: str
    read: bool
    created_at: str
    groupe_id: Optional[str] = None
    groupe_titre: Optional[str] = None


# ── Router ──────────────────────────────────────────────────────

router = APIRouter(prefix="/notifications", tags=["notifications"])

MAX_NOTIFS_PER_USER = 30


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "recipient_uid": row["recipient_uid"],
        "title": row["title"],
        "body": row["body"],
        "read": row["read"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "groupe_id": row["groupe_id"],
        "groupe_titre": row["groupe_titre"],
    }


@router.post("")
async def create_notification(payload: NotifCreate):
    """Crée une notification in-app. Optionnel : envoie aussi un push FCM."""
    notif_id = payload.notif_id or str(uuid.uuid4())
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO parent_notifications
               (id, type, recipient_uid, title, body, groupe_id, groupe_titre)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO UPDATE SET
                 title = EXCLUDED.title, body = EXCLUDED.body,
                 read = FALSE, created_at = NOW()""",
            notif_id, payload.type, payload.recipient_uid,
            payload.title, payload.body,
            payload.groupe_id, payload.groupe_titre,
        )

        # Purge : garder max N notifications par utilisateur
        await conn.execute(
            """DELETE FROM parent_notifications
               WHERE id IN (
                 SELECT id FROM parent_notifications
                 WHERE recipient_uid = $1
                 ORDER BY created_at DESC
                 OFFSET $2
               )""",
            payload.recipient_uid, MAX_NOTIFS_PER_USER,
        )

        # Push FCM si demandé
        if payload.send_push:
            row = await conn.fetchrow(
                "SELECT fcm_token FROM accounts WHERE uid = $1",
                payload.recipient_uid,
            )
            token = row["fcm_token"] if row else None
            if token:
                _send_fcm(token, payload.title, payload.body, {
                    "type": payload.type,
                    "notificationId": notif_id,
                    **({"groupeId": payload.groupe_id} if payload.groupe_id else {}),
                    **({"link": f"{APP_URL}/espace/groupes/{payload.groupe_id}/vocal"} if payload.groupe_id else {}),
                })

    return {"id": notif_id}


@router.get("/{uid}")
async def list_notifications(uid: str):
    """Liste les notifications d'un utilisateur (max 30, triées par date desc)."""
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM parent_notifications
               WHERE recipient_uid = $1
               ORDER BY created_at DESC
               LIMIT $2""",
            uid, MAX_NOTIFS_PER_USER,
        )
    return [_row_to_dict(r) for r in rows]


@router.get("/{uid}/unread-count")
async def unread_count(uid: str):
    """Compte les notifications non lues."""
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) as cnt FROM parent_notifications WHERE recipient_uid = $1 AND read = FALSE",
            uid,
        )
    return {"count": row["cnt"] if row else 0}


@router.put("/{notif_id}/read")
async def mark_read(notif_id: str):
    """Marque une notification comme lue."""
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE parent_notifications SET read = TRUE WHERE id = $1",
            notif_id,
        )
    return {"ok": True}


@router.put("/{uid}/read-all")
async def mark_all_read(uid: str):
    """Marque toutes les notifications d'un utilisateur comme lues."""
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE parent_notifications SET read = TRUE WHERE recipient_uid = $1 AND read = FALSE",
            uid,
        )
    return {"ok": True}


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str):
    """Supprime une notification."""
    async with pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM parent_notifications WHERE id = $1",
            notif_id,
        )
    return {"ok": True}


@router.delete("/{uid}/all")
async def delete_all_notifications(uid: str):
    """Supprime toutes les notifications d'un utilisateur."""
    async with pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM parent_notifications WHERE recipient_uid = $1",
            uid,
        )
    return {"ok": True}


# ── Cron : rappels vocaux ──────────────────────────────────────

@router.post("/cron/vocal-reminders")
async def cron_vocal_reminders():
    """
    Appelé toutes les 2 min par le cron systemd.
    Vérifie les groupes scheduled dans les 35 prochaines minutes,
    envoie les rappels 30/15/5 min et annule si < 3 inscrits à T-30.
    """
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(minutes=35)

    async with pool().acquire() as conn:
        groups = await conn.fetch(
            """SELECT id, titre, date_vocal, status, participants
               FROM groupes
               WHERE status = 'scheduled'
                 AND date_vocal BETWEEN $1 AND $2""",
            now, window_end,
        )

        results = []
        for g in groups:
            groupe_id = g["id"]
            titre = g["titre"]
            date_vocal = g["date_vocal"]
            if date_vocal.tzinfo is None:
                date_vocal = date_vocal.replace(tzinfo=timezone.utc)

            participants_raw = g["participants"]
            if isinstance(participants_raw, str):
                try:
                    participants_raw = json.loads(participants_raw)
                except Exception:
                    participants_raw = []
            participants = participants_raw or []

            minutes_before = (date_vocal - now).total_seconds() / 60

            # Déterminer quels rappels envoyer
            reminders_to_send = []
            if minutes_before <= 30:
                reminders_to_send.append("30min")
            if minutes_before <= 15:
                reminders_to_send.append("15min")
            if minutes_before <= 5:
                reminders_to_send.append("5min")

            for rtype in reminders_to_send:
                # Déduplication
                already = await conn.fetchrow(
                    "SELECT 1 FROM groupe_reminders_sent WHERE groupe_id = $1 AND reminder_type = $2",
                    groupe_id, rtype,
                )
                if already:
                    continue

                # ── T-30 : annulation si < 3 participants ──
                if rtype == "30min" and len(participants) < 3:
                    await conn.execute(
                        "UPDATE groupes SET status = 'cancelled' WHERE id = $1",
                        groupe_id,
                    )
                    # Notifier les inscrits de l'annulation
                    for p in participants:
                        p_uid = p.get("user_uid") or p.get("uid")
                        if not p_uid:
                            continue
                        cancel_id = f"cancel_{groupe_id}_{p_uid}"
                        await _create_and_push(
                            conn, cancel_id, "group_cancelled", p_uid,
                            "Groupe annulé",
                            f'Le groupe "{titre}" n\'aura malheureusement pas lieu (pas assez de participants).',
                            groupe_id, titre,
                        )
                    await conn.execute(
                        "INSERT INTO groupe_reminders_sent (groupe_id, reminder_type) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        groupe_id, rtype,
                    )
                    results.append({"groupe": groupe_id, "action": "cancelled"})
                    break  # Groupe annulé, pas de rappels suivants

                # ── Rappel normal ──
                title_map = {
                    "30min": "Votre groupe dans 30 min",
                    "15min": "Votre groupe dans 15 min",
                    "5min":  "Votre groupe commence !",
                }
                body_map = {
                    "30min": f'"{titre}" aura bien lieu, préparez-vous !',
                    "15min": f'"{titre}" — La salle d\'attente est ouverte',
                    "5min":  f'"{titre}" — {len(participants)} parent{"s" if len(participants) > 1 else ""} vous attendent',
                }

                for p in participants:
                    p_uid = p.get("user_uid") or p.get("uid")
                    if not p_uid:
                        continue
                    notif_id = f"reminder_{rtype}_{groupe_id}_{p_uid}"
                    await _create_and_push(
                        conn, notif_id, "vocal_reminder", p_uid,
                        title_map[rtype], body_map[rtype],
                        groupe_id, titre,
                    )

                await conn.execute(
                    "INSERT INTO groupe_reminders_sent (groupe_id, reminder_type) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    groupe_id, rtype,
                )
                results.append({"groupe": groupe_id, "reminder": rtype, "participants": len(participants)})

    return {"processed": len(results), "details": results}


async def _create_and_push(
    conn, notif_id: str, notif_type: str, uid: str,
    title: str, body: str,
    groupe_id: str | None = None, groupe_titre: str | None = None,
):
    """Crée la notif in-app + envoie le push FCM."""
    await conn.execute(
        """INSERT INTO parent_notifications
           (id, type, recipient_uid, title, body, groupe_id, groupe_titre)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING""",
        notif_id, notif_type, uid, title, body, groupe_id, groupe_titre,
    )
    # Récupérer le token FCM
    row = await conn.fetchrow("SELECT fcm_token FROM accounts WHERE uid = $1", uid)
    token = row["fcm_token"] if row else None
    if token:
        data = {"type": notif_type, "notificationId": notif_id}
        if groupe_id:
            data["groupeId"] = groupe_id
            data["link"] = f"{APP_URL}/espace/groupes/{groupe_id}/vocal"
        _send_fcm(token, title, body, data)
