"""
Groupes de parole — FastAPI router
Gère : groupes, participants, messages, évaluations, bannissement, sorties.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from auth import verify_api_key
from db import pool
from models import GroupCreate
from datetime import datetime
from typing import List, Optional

router = APIRouter(prefix='/groupes', tags=['groupes'])

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    """Convertit asyncpg Row en dict, désérialise les colonnes JSONB."""
    d = dict(row)
    for col in ('structure', 'session_state', 'participants'):
        if col in d and isinstance(d[col], str):
            try:
                d[col] = json.loads(d[col])
            except Exception:
                pass
    return d

def _participants_query(groupe_alias: str = 'g') -> str:
    """Sous-requête qui reconstruit la liste participants depuis group_participants."""
    return f"""
        (SELECT json_agg(p.*)
         FROM (
             SELECT gp.user_uid, gp.inscrit_vocal, gp.date_inscription, gp.banni,
                    a.pseudo
             FROM group_participants gp
             JOIN accounts a ON a.uid = gp.user_uid
             WHERE gp.groupe_id = {groupe_alias}.id
         ) p)
    """

# ─────────────────────────────────────────────
# LIST
# ─────────────────────────────────────────────

@router.get('', response_model=List[dict], dependencies=[Depends(verify_api_key)])
async def list_groups(
    status: Optional[str] = None,
    creator_uid: Optional[str] = None,
    include_ended: bool = False,
    limit: int = Query(100, le=200),
    offset: int = 0
):
    """
    Retourne les groupes actifs (scheduled / in_progress par défaut).
    Filtres optionnels : status, creator_uid.
    include_ended=true pour inclure cancelled/completed (admin).
    """
    conditions = ["1=1"]
    params: list = []

    if not include_ended:
        conditions.append("g.status NOT IN ('cancelled', 'completed', 'reprogrammed')")

    if status:
        params.append(status)
        conditions.append(f"g.status = ${len(params)}")

    if creator_uid:
        params.append(creator_uid)
        conditions.append(f"g.createur_uid = ${len(params)}")

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    query_str = f"""
        SELECT g.*,
               {_participants_query('g')} AS participants
        FROM groupes g
        WHERE {where}
        ORDER BY g.date_vocal ASC
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
    """

    async with pool().acquire() as conn:
        rows = await conn.fetch(query_str, *params)

    return [_row_to_dict(r) for r in rows]

# ─────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────

@router.post('', status_code=201, dependencies=[Depends(verify_api_key)])
async def create_group(payload: GroupCreate):
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO groupes (
                    id, titre, description, theme, createur_uid, createur_pseudo,
                    date_vocal, date_expiration, structure_type, structure, participants_max
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
                RETURNING *
                """,
                payload.id, payload.titre, payload.description, payload.theme,
                payload.createur_uid, payload.createur_pseudo,
                payload.date_vocal, payload.date_expiration,
                payload.structure_type,
                json.dumps([s.model_dump() for s in payload.structure]),
                payload.participants_max
            )
            await conn.execute(
                "INSERT INTO group_participants (groupe_id, user_uid) VALUES ($1,$2)",
                payload.id, payload.createur_uid
            )

    return _row_to_dict(row)

# ─────────────────────────────────────────────
# GET ONE
# ─────────────────────────────────────────────

@router.get('/{id}', dependencies=[Depends(verify_api_key)])
async def get_group(id: str):
    query_str = f"""
        SELECT g.*,
               {_participants_query('g')} AS participants
        FROM groupes g
        WHERE g.id = $1
    """
    async with pool().acquire() as conn:
        row = await conn.fetchrow(query_str, id)

    if not row:
        raise HTTPException(404, "Groupe non trouvé")

    return _row_to_dict(row)

# ─────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────

ALLOWED_PATCH_FIELDS = {
    'status', 'cancel_reason', 'session_state', 'participants',
    'message_count', 'reprogrammed_to_id', 'reprogrammed_from_id',
}

@router.put('/{id}', dependencies=[Depends(verify_api_key)])
async def update_group(id: str, patch: dict):
    # Filtrer les champs autorisés
    safe = {k: v for k, v in patch.items() if k in ALLOWED_PATCH_FIELDS}
    if not safe:
        raise HTTPException(400, "Aucun champ valide à mettre à jour")

    async with pool().acquire() as conn:
        async with conn.transaction():
            # Construire la clause SET dynamiquement
            sets, vals = [], []
            for key, val in safe.items():
                vals.append(
                    json.dumps(val) if isinstance(val, (dict, list)) else val
                )
                if key == 'session_state':
                    sets.append(f"session_state = ${len(vals)}::jsonb")
                else:
                    sets.append(f"{key} = ${len(vals)}")

            vals.append(id)
            set_clause = ", ".join(sets) + ", updated_at = NOW()"

            await conn.execute(
                f"UPDATE groupes SET {set_clause} WHERE id = ${len(vals)}",
                *vals
            )

            # Auto-cleanup : groupe annulé sans messages → suppression immédiate
            if safe.get('status') == 'cancelled':
                msg_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM group_messages WHERE groupe_id = $1", id
                )
                if msg_count == 0:
                    await conn.execute("DELETE FROM groupes WHERE id = $1", id)
                    return {"status": "deleted", "reason": "cancelled_no_messages"}

    return {"status": "updated"}

# ─────────────────────────────────────────────
# DELETE
# ─────────────────────────────────────────────

@router.delete('/{id}', dependencies=[Depends(verify_api_key)])
async def delete_group(id: str):
    async with pool().acquire() as conn:
        res = await conn.execute("DELETE FROM groupes WHERE id = $1", id)
    if res.endswith(' 0'):
        raise HTTPException(404, "Groupe non trouvé")
    return {"status": "deleted"}

# ─────────────────────────────────────────────
# PARTICIPANTS — JOIN / LEAVE
# ─────────────────────────────────────────────

@router.post('/{id}/join', dependencies=[Depends(verify_api_key)])
async def join_group(id: str, user_uid: str):
    async with pool().acquire() as conn:
        async with conn.transaction():
            group = await conn.fetchrow(
                "SELECT participants_max, status FROM groupes WHERE id = $1", id
            )
            if not group:
                raise HTTPException(404, "Groupe absent")
            if group['status'] in ('cancelled', 'completed'):
                raise HTTPException(400, "Ce groupe n'est plus actif")

            count = await conn.fetchval(
                "SELECT COUNT(*) FROM group_participants WHERE groupe_id = $1", id
            )
            if count >= group['participants_max']:
                raise HTTPException(400, "Groupe complet")

            try:
                await conn.execute(
                    "INSERT INTO group_participants (groupe_id, user_uid) VALUES ($1,$2)",
                    id, user_uid
                )
            except Exception as e:
                if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    raise HTTPException(409, "Déjà inscrit")
                raise HTTPException(400, str(e))

    return {"status": "joined"}

@router.post('/{id}/leave', dependencies=[Depends(verify_api_key)])
async def leave_group(id: str, user_uid: str):
    async with pool().acquire() as conn:
        res = await conn.execute(
            "DELETE FROM group_participants WHERE groupe_id = $1 AND user_uid = $2",
            id, user_uid
        )
    if res.endswith(' 0'):
        raise HTTPException(404, "Non inscrit ou groupe absent")
    return {"status": "left"}

# ─────────────────────────────────────────────
# MESSAGES
# ─────────────────────────────────────────────

@router.get('/{id}/messages', dependencies=[Depends(verify_api_key)])
async def list_messages(id: str, limit: int = Query(100, le=200)):
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM group_messages WHERE groupe_id = $1 ORDER BY date_envoi ASC LIMIT $2",
            id, limit
        )
    return [dict(r) for r in rows]

@router.post('/{id}/messages', status_code=201, dependencies=[Depends(verify_api_key)])
async def post_message(id: str, payload: dict):
    msg_id = payload.get('id') or __import__('uuid').uuid4().hex[:12]
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO group_messages (id, groupe_id, auteur_uid, auteur_pseudo, contenu)
                VALUES ($1,$2,$3,$4,$5) RETURNING *
                """,
                msg_id, id,
                payload['auteur_uid'], payload['auteur_pseudo'], payload['contenu']
            )
            await conn.execute(
                "UPDATE groupes SET message_count = message_count + 1 WHERE id = $1", id
            )
    return dict(row)

@router.delete('/{id}/messages/{msg_id}', dependencies=[Depends(verify_api_key)])
async def delete_message(id: str, msg_id: str):
    async with pool().acquire() as conn:
        async with conn.transaction():
            res = await conn.execute(
                "DELETE FROM group_messages WHERE id = $1 AND groupe_id = $2",
                msg_id, id
            )
            if not res.endswith(' 0'):
                await conn.execute(
                    "UPDATE groupes SET message_count = GREATEST(0, message_count - 1) WHERE id = $1", id
                )
    return {"status": "deleted"}

# ─────────────────────────────────────────────
# ÉVALUATIONS
# ─────────────────────────────────────────────

@router.post('/{id}/evaluations', status_code=201, dependencies=[Depends(verify_api_key)])
async def submit_evaluation(id: str, payload: dict):
    uid = payload.get('participantUid') or payload.get('participant_uid')
    if not uid:
        raise HTTPException(400, "participantUid requis")

    status = payload.get('status', 'done')

    async with pool().acquire() as conn:
        await conn.execute(
            """
            INSERT INTO group_evaluations (
                groupe_id, participant_uid, participant_pseudo,
                note_ambiance, note_theme, note_technique,
                ressenti, signalement, status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (groupe_id, participant_uid) DO UPDATE SET
                participant_pseudo = EXCLUDED.participant_pseudo,
                note_ambiance      = EXCLUDED.note_ambiance,
                note_theme         = EXCLUDED.note_theme,
                note_technique     = EXCLUDED.note_technique,
                ressenti           = EXCLUDED.ressenti,
                signalement        = EXCLUDED.signalement,
                status             = EXCLUDED.status,
                date_evaluation    = NOW()
            """,
            id, uid,
            payload.get('participantPseudo') or payload.get('participant_pseudo'),
            payload.get('noteAmbiance') or payload.get('note_ambiance'),
            payload.get('noteTheme') or payload.get('note_theme'),
            payload.get('noteTechnique') or payload.get('note_technique'),
            payload.get('ressenti'),
            bool(payload.get('signalement', False)),
            status
        )
    return {"status": "saved"}

@router.get('/{id}/evaluations/average', dependencies=[Depends(verify_api_key)])
async def get_evaluations_average(id: str):
    """Retourne la note moyenne d'un groupe (évaluations complètes uniquement)."""
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT note_ambiance, note_theme, note_technique
            FROM group_evaluations
            WHERE groupe_id = $1
              AND status = 'done'
              AND note_ambiance IS NOT NULL
            """,
            id
        )
    if not rows:
        return {"average": None, "count": 0}

    count = len(rows)
    total = sum(
        (r['note_ambiance'] or 0) + (r['note_theme'] or 0) + (r['note_technique'] or 0)
        for r in rows
    )
    average = round(total / (count * 3) * 10) / 10
    return {"average": average, "count": count}

@router.get('/{id}/evaluations/{uid}', dependencies=[Depends(verify_api_key)])
async def get_evaluation_status(id: str, uid: str):
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status FROM group_evaluations WHERE groupe_id = $1 AND participant_uid = $2",
            id, uid
        )
    if not row:
        return {"status": "none"}
    return {"status": row['status'] or 'done'}

# ─────────────────────────────────────────────
# SORTIES PARTICIPANTS (bannissement automatique)
# ─────────────────────────────────────────────

@router.post('/{id}/exits/{uid}', dependencies=[Depends(verify_api_key)])
async def increment_participant_exit(id: str, uid: str):
    """
    Incrémente le compteur de sorties d'un participant.
    Si exit_count > 2 → banni automatiquement dans group_participants.
    """
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO group_participant_exits (groupe_id, user_uid, exit_count, last_exit_at)
                VALUES ($1, $2, 1, NOW())
                ON CONFLICT (groupe_id, user_uid) DO UPDATE
                    SET exit_count  = group_participant_exits.exit_count + 1,
                        last_exit_at = NOW()
                RETURNING exit_count
                """,
                id, uid
            )
            new_count = row['exit_count']
            banned = new_count > 2

            if banned:
                await conn.execute(
                    """
                    UPDATE group_participants
                    SET banni = TRUE
                    WHERE groupe_id = $1 AND user_uid = $2
                    """,
                    id, uid
                )

    return {"count": new_count, "banned": banned}

# ─────────────────────────────────────────────
# BANNISSEMENT EXPLICITE (action animateur)
# ─────────────────────────────────────────────

@router.post('/{id}/ban', dependencies=[Depends(verify_api_key)])
async def ban_participant(id: str, uid: str):
    async with pool().acquire() as conn:
        res = await conn.execute(
            "UPDATE group_participants SET banni = TRUE WHERE groupe_id = $1 AND user_uid = $2",
            id, uid
        )
    if res.endswith(' 0'):
        raise HTTPException(404, "Participant non trouvé dans ce groupe")
    return {"status": "banned"}

@router.get('/{id}/banned/{uid}', dependencies=[Depends(verify_api_key)])
async def is_banned(id: str, uid: str):
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT banni FROM group_participants WHERE groupe_id = $1 AND user_uid = $2",
            id, uid
        )
    if not row:
        return {"banned": False}
    return {"banned": bool(row['banni'])}
