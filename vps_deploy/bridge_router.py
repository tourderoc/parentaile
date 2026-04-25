"""
Bridge MedCompanion ↔ Parent'aile.
Étape 4A : Tokens médecin-parent.
Étape 4B : Notifications médecin → parent (+ FCM push).
Étape 4C : Messages parent → médecin.
"""

import os
import json
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from db import pool

logger = logging.getLogger("bridge")

APP_URL = os.environ.get("APP_URL", "https://parentaile.web.app")

# ── Firebase Admin (FCM push) — réutilise l'init de notif_router ──
from notif_router import _send_fcm

# ══════════════════════════════════════════════════════════════════
#  ÉTAPE 4A — TOKENS
# ══════════════════════════════════════════════════════════════════

router = APIRouter(prefix="/bridge", tags=["bridge"])


# ── Models ─────────────────────────────────────────────────────

class TokenCreate(BaseModel):
    token_id: str
    doctor_id: str
    patient_id: str
    patient_name: str


class TokenUse(BaseModel):
    parent_uid: str
    pseudo: Optional[str] = None
    fcm_token: Optional[str] = None


class TokenFcmUpdate(BaseModel):
    fcm_token: str


# ── Helpers ────────────────────────────────────────────────────

def _token_row_to_dict(row) -> dict:
    d = dict(row)
    for field in ("created_at", "used_at", "revoked_at"):
        if d.get(field):
            d[field] = d[field].isoformat()
    return d


# ── Endpoints Tokens ───────────────────────────────────────────

@router.post("/tokens", status_code=201)
async def create_token(payload: TokenCreate):
    """MedCompanion crée un token patient."""
    async with pool().acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT token_id FROM bridge_tokens WHERE token_id = $1",
            payload.token_id,
        )
        if existing:
            raise HTTPException(409, "Token already exists")

        await conn.execute(
            """INSERT INTO bridge_tokens (token_id, doctor_id, patient_id, patient_name)
               VALUES ($1, $2, $3, $4)""",
            payload.token_id, payload.doctor_id,
            payload.patient_id, payload.patient_name,
        )
    return {"token_id": payload.token_id, "status": "pending"}


@router.get("/tokens/{token_id}")
async def get_token(token_id: str):
    """Parent'aile vérifie le statut d'un token."""
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM bridge_tokens WHERE token_id = $1",
            token_id,
        )
    if not row:
        raise HTTPException(404, "Token not found")
    return _token_row_to_dict(row)


@router.put("/tokens/{token_id}/use")
async def use_token(token_id: str, payload: TokenUse):
    """Parent'aile active un token (pending → used)."""
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status FROM bridge_tokens WHERE token_id = $1",
            token_id,
        )
        if not row:
            raise HTTPException(404, "Token not found")
        if row["status"] == "used":
            raise HTTPException(409, "Token already used")
        if row["status"] == "revoked":
            raise HTTPException(410, "Token revoked")

        await conn.execute(
            """UPDATE bridge_tokens
               SET status = 'used',
                   parent_uid = $2,
                   pseudo = $3,
                   fcm_token = $4,
                   used_at = NOW()
               WHERE token_id = $1""",
            token_id, payload.parent_uid,
            payload.pseudo, payload.fcm_token,
        )
    return {"token_id": token_id, "status": "used"}


@router.put("/tokens/{token_id}/revoke")
async def revoke_token(token_id: str):
    """MedCompanion révoque un token."""
    async with pool().acquire() as conn:
        result = await conn.execute(
            """UPDATE bridge_tokens
               SET status = 'revoked', revoked_at = NOW()
               WHERE token_id = $1 AND status != 'revoked'""",
            token_id,
        )
    return {"token_id": token_id, "status": "revoked"}


@router.delete("/tokens/{token_id}")
async def delete_token(token_id: str):
    """MedCompanion supprime un token."""
    async with pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM bridge_tokens WHERE token_id = $1",
            token_id,
        )
    return {"ok": True}


@router.get("/tokens/sync/{doctor_id}")
async def sync_tokens(doctor_id: str):
    """
    MedCompanion sync : récupère tous les tokens du médecin
    avec statuts + pseudos parents.
    Remplace SyncFromFirebaseAsync + FetchParentNicknamesAsync.
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """SELECT t.token_id, t.patient_id, t.patient_name,
                      t.status, t.pseudo, t.parent_uid,
                      t.created_at, t.used_at, t.revoked_at
               FROM bridge_tokens t
               WHERE t.doctor_id = $1
               ORDER BY t.created_at DESC""",
            doctor_id,
        )
    return [_token_row_to_dict(r) for r in rows]


@router.put("/tokens/{token_id}/fcm")
async def update_fcm_token(token_id: str, payload: TokenFcmUpdate):
    """Parent'aile met à jour le FCM token (pour push notifications)."""
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE bridge_tokens SET fcm_token = $1 WHERE token_id = $2",
            payload.fcm_token, token_id,
        )
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════
#  ÉTAPE 4B — NOTIFICATIONS MÉDECIN → PARENT
# ══════════════════════════════════════════════════════════════════

class BridgeNotifCreate(BaseModel):
    type: str                            # EmailReply, Quick, Info, Broadcast
    title: str
    body: str
    target_parent_id: Optional[str] = None
    token_id: Optional[str] = None
    reply_to_message_id: Optional[str] = None
    sender_name: str


class BridgeNotifOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    token_id: Optional[str] = None
    reply_to_message_id: Optional[str] = None
    sender_name: str
    read: bool
    created_at: str


def _notif_row_to_dict(row) -> dict:
    d = dict(row)
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    return d


@router.post("/notifications", status_code=201)
async def create_bridge_notification(payload: BridgeNotifCreate):
    """MedCompanion envoie une notification à un parent (+ FCM push)."""
    notif_id = str(uuid.uuid4())
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO bridge_notifications
               (id, type, title, body, target_parent_id, token_id,
                reply_to_message_id, sender_name)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            notif_id, payload.type, payload.title, payload.body,
            payload.target_parent_id, payload.token_id,
            payload.reply_to_message_id, payload.sender_name,
        )

        # FCM push si on a un token_id
        if payload.token_id:
            row = await conn.fetchrow(
                "SELECT fcm_token FROM bridge_tokens WHERE token_id = $1",
                payload.token_id,
            )
            fcm = row["fcm_token"] if row else None
            if fcm:
                _send_fcm(fcm, payload.title, payload.body, {
                    "type": "doctor_notification",
                    "notificationId": notif_id,
                    "link": f"{APP_URL}/espace/dashboard",
                })

    return {"id": notif_id}


@router.post("/notifications/broadcast")
async def broadcast_notification(payload: BridgeNotifCreate):
    """MedCompanion envoie à tous les parents actifs d'un médecin."""
    async with pool().acquire() as conn:
        # Récupérer tous les tokens actifs du médecin
        tokens = await conn.fetch(
            """SELECT token_id, fcm_token FROM bridge_tokens
               WHERE doctor_id = $1 AND status = 'used'""",
            payload.target_parent_id,  # doctor_id passé via target_parent_id
        )

        sent = 0
        for t in tokens:
            notif_id = str(uuid.uuid4())
            await conn.execute(
                """INSERT INTO bridge_notifications
                   (id, type, title, body, target_parent_id, token_id, sender_name)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                notif_id, "Broadcast", payload.title, payload.body,
                payload.target_parent_id, t["token_id"], payload.sender_name,
            )
            if t["fcm_token"]:
                _send_fcm(t["fcm_token"], payload.title, payload.body, {
                    "type": "doctor_broadcast",
                    "notificationId": notif_id,
                    "link": f"{APP_URL}/espace/dashboard",
                })
            sent += 1

    return {"sent": sent, "total": len(tokens)}


@router.get("/notifications/token/{token_id}")
async def list_bridge_notifications(token_id: str, limit: int = 20):
    """Parent'aile lit ses notifications médecin (par token enfant)."""
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM bridge_notifications
               WHERE token_id = $1
               ORDER BY created_at DESC
               LIMIT $2""",
            token_id, limit,
        )
    return [_notif_row_to_dict(r) for r in rows]


@router.get("/notifications/unread/{token_id}")
async def unread_bridge_notif_count(token_id: str):
    """Compte les notifications médecin non lues pour un token."""
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            """SELECT COUNT(*) as cnt FROM bridge_notifications
               WHERE token_id = $1 AND read = FALSE""",
            token_id,
        )
    return {"count": row["cnt"] if row else 0}


@router.put("/notifications/{notif_id}/read")
async def mark_bridge_notif_read(notif_id: str):
    """Parent'aile marque une notification médecin comme lue."""
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE bridge_notifications SET read = TRUE WHERE id = $1",
            notif_id,
        )
    return {"ok": True}


@router.delete("/notifications/{notif_id}")
async def delete_bridge_notification(notif_id: str):
    """Supprime une notification médecin."""
    async with pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM bridge_notifications WHERE id = $1",
            notif_id,
        )
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════
#  ÉTAPE 4C — MESSAGES PARENT → MÉDECIN
# ══════════════════════════════════════════════════════════════════

class MessageCreate(BaseModel):
    token_id: str
    doctor_id: str
    parent_uid: str
    parent_email: Optional[str] = None
    child_nickname: str
    content: str
    urgency: str = "normal"  # normal, urgent


class MessageReply(BaseModel):
    reply_content: str
    sender_name: Optional[str] = None


def _msg_row_to_dict(row) -> dict:
    d = dict(row)
    for field in ("created_at", "replied_at"):
        if d.get(field):
            d[field] = d[field].isoformat()
    return d


@router.post("/messages", status_code=201)
async def create_message(payload: MessageCreate):
    """Parent envoie un message au médecin."""
    msg_id = str(uuid.uuid4())
    async with pool().acquire() as conn:
        await conn.execute(
            """INSERT INTO bridge_messages
               (id, token_id, doctor_id, parent_uid, parent_email,
                child_nickname, content, urgency)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            msg_id, payload.token_id, payload.doctor_id,
            payload.parent_uid, payload.parent_email,
            payload.child_nickname, payload.content, payload.urgency,
        )
    return {"id": msg_id}


@router.get("/messages/doctor/{doctor_id}")
async def list_messages_for_doctor(
    doctor_id: str,
    since: Optional[str] = None,
    status: Optional[str] = None,
    token_id: Optional[str] = None,
    limit: int = 100,
):
    """MedCompanion récupère les messages (filtres optionnels)."""
    query = "SELECT * FROM bridge_messages WHERE doctor_id = $1"
    params: list = [doctor_id]
    idx = 2

    if since:
        query += f" AND created_at > ${idx}"
        params.append(datetime.fromisoformat(since))
        idx += 1
    if status:
        query += f" AND status = ${idx}"
        params.append(status)
        idx += 1
    if token_id:
        query += f" AND token_id = ${idx}"
        params.append(token_id)
        idx += 1

    query += f" ORDER BY created_at DESC LIMIT ${idx}"
    params.append(limit)

    async with pool().acquire() as conn:
        rows = await conn.fetch(query, *params)
    return [_msg_row_to_dict(r) for r in rows]


@router.get("/messages/token/{token_id}")
async def list_messages_for_token(token_id: str, limit: int = 50):
    """Parent'aile voit ses messages envoyés + réponses."""
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM bridge_messages
               WHERE token_id = $1
               ORDER BY created_at DESC
               LIMIT $2""",
            token_id, limit,
        )
    return [_msg_row_to_dict(r) for r in rows]


@router.put("/messages/{msg_id}/read")
async def mark_message_read(msg_id: str):
    """MedCompanion marque un message comme lu."""
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE bridge_messages SET status = 'read' WHERE id = $1",
            msg_id,
        )
    return {"ok": True}


@router.put("/messages/{msg_id}/reply")
async def reply_to_message(msg_id: str, payload: MessageReply):
    """MedCompanion répond à un message parent."""
    async with pool().acquire() as conn:
        # Mettre à jour le message
        await conn.execute(
            """UPDATE bridge_messages
               SET status = 'replied',
                   reply_content = $2,
                   replied_at = NOW()
               WHERE id = $1""",
            msg_id, payload.reply_content,
        )

        # Créer une notification automatique pour le parent
        msg = await conn.fetchrow(
            "SELECT token_id, parent_uid, child_nickname FROM bridge_messages WHERE id = $1",
            msg_id,
        )
        if msg:
            notif_id = str(uuid.uuid4())
            sender = payload.sender_name or "Votre médecin"
            await conn.execute(
                """INSERT INTO bridge_notifications
                   (id, type, title, body, target_parent_id, token_id,
                    reply_to_message_id, sender_name)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                notif_id, "EmailReply",
                f"Réponse de {sender}",
                payload.reply_content[:100] + ("..." if len(payload.reply_content) > 100 else ""),
                msg["parent_uid"], msg["token_id"],
                msg_id, sender,
            )
            # FCM push
            token_row = await conn.fetchrow(
                "SELECT fcm_token FROM bridge_tokens WHERE token_id = $1",
                msg["token_id"],
            )
            fcm = token_row["fcm_token"] if token_row else None
            if fcm:
                _send_fcm(fcm, f"Réponse de {sender}", payload.reply_content[:100], {
                    "type": "doctor_reply",
                    "notificationId": notif_id,
                    "messageId": msg_id,
                    "link": f"{APP_URL}/espace/dashboard",
                })

    return {"ok": True}


@router.put("/messages/{msg_id}/archive")
async def archive_message(msg_id: str):
    """MedCompanion archive un message."""
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE bridge_messages SET status = 'archived' WHERE id = $1",
            msg_id,
        )
    return {"ok": True}


@router.delete("/messages/{msg_id}")
async def delete_message(msg_id: str):
    """MedCompanion supprime un message."""
    async with pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM bridge_messages WHERE id = $1",
            msg_id,
        )
    return {"ok": True}
