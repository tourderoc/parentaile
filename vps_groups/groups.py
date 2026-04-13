import json
from fastapi import APIRouter, Depends, HTTPException, Query
from auth import verify_api_key
from db import pool
from .models import GroupCreate, GroupUpdate, GroupResponse, MessageCreate, MessageResponse, EvaluationCreate, ParticipantSimple
from datetime import datetime
from typing import List, Optional

router = APIRouter(prefix='/groupes', tags=['groupes'])

def _row_to_dict(row) -> dict:
    """Helper pour convertir une ligne asyncpg en dict avec JSON correct."""
    d = dict(row)
    if 'structure' in d and isinstance(d['structure'], str):
        d['structure'] = json.loads(d['structure'])
    if 'session_state' in d and isinstance(d['session_state'], str):
        d['session_state'] = json.loads(d['session_state'])
    return d

@router.get('', response_model=List[dict], dependencies=[Depends(verify_api_key)])
async def list_groups(
    status: Optional[str] = None, 
    creator_uid: Optional[str] = None,
    limit: int = Query(100, le=100),
    offset: int = 0
):
    """
    Récupère la liste des groupes avec leurs participants (jointure).
    """
    query_str = """
        SELECT g.*, 
               (SELECT json_agg(p.*) 
                FROM (
                    SELECT gp.*, a.pseudo 
                    FROM group_participants gp
                    JOIN accounts a ON a.uid = gp.user_uid
                    WHERE gp.groupe_id = g.id
                ) p) as participants
        FROM groupes g
        WHERE 1=1
    """
    params = []
    if status:
        params.append(status)
        query_str += f" AND g.status = ${len(params)}"
    if creator_uid:
        params.append(creator_uid)
        query_str += f" AND g.createur_uid = ${len(params)}"
    
    query_str += f" ORDER BY g.date_vocal ASC LIMIT ${len(params)+1} OFFSET ${len(params)+2}"
    params.extend([limit, offset])

    async with pool().acquire() as conn:
        rows = await conn.fetch(query_str, *params)
    
    return [_row_to_dict(r) for r in rows]

@router.post('', status_code=201, dependencies=[Depends(verify_api_key)])
async def create_group(payload: GroupCreate):
    async with pool().acquire() as conn:
        async with conn.transaction():
            # 1. Création du groupe
            group_row = await conn.fetchrow(
                """
                INSERT INTO groupes (
                    id, titre, description, theme, createur_uid, createur_pseudo,
                    date_vocal, date_expiration, structure_type, structure, participants_max
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
                RETURNING *
                """,
                payload.id, payload.titre, payload.description, payload.theme, 
                payload.createur_uid, payload.createur_pseudo,
                payload.date_vocal, payload.date_expiration, 
                payload.structure_type, json.dumps(payload.structure), payload.participants_max
            )
            
            # 2. Ajout automatique du créateur comme 1er participant
            await conn.execute(
                """
                INSERT INTO group_participants (groupe_id, user_uid, date_inscription)
                VALUES ($1, $2, NOW())
                """,
                payload.id, payload.createur_uid
            )
            
    return _row_to_dict(group_row)

@router.get('/{id}', dependencies=[Depends(verify_api_key)])
async def get_group(id: str):
    query_str = """
        SELECT g.*, 
               (SELECT json_agg(p.*) 
                FROM (
                    SELECT gp.*, a.pseudo 
                    FROM group_participants gp
                    JOIN accounts a ON a.uid = gp.user_uid
                    WHERE gp.groupe_id = g.id
                ) p) as participants
        FROM groupes g
        WHERE g.id = $1
    """
    async with pool().acquire() as conn:
        row = await conn.fetchrow(query_str, id)
    
    if not row:
        raise HTTPException(404, "Groupe non trouvé")
    
    return _row_to_dict(row)

@router.post('/{id}/join', dependencies=[Depends(verify_api_key)])
async def join_group(id: str, user_uid: str):
    async with pool().acquire() as conn:
        async with conn.transaction():
            # Check capacity
            group = await conn.fetchrow("SELECT participants_max FROM groupes WHERE id = $1", id)
            if not group: raise HTTPException(404, "Groupe absent")
            
            count = await conn.fetchval("SELECT count(*) FROM group_participants WHERE groupe_id = $1", id)
            if count >= group['participants_max']:
                raise HTTPException(400, "Groupe complet")
            
            try:
                await conn.execute(
                    "INSERT INTO group_participants (groupe_id, user_uid) VALUES ($1, $2)",
                    id, user_uid
                )
            except Exception as e:
                if "unique_violation" in str(e) or "duplicate key" in str(e):
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

@router.get('/{id}/messages', response_model=List[MessageResponse], dependencies=[Depends(verify_api_key)])
async def list_messages(id: str, limit: int = 50):
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM group_messages WHERE groupe_id = $1 ORDER BY date_envoi DESC LIMIT $2",
            id, limit
        )
    return [dict(r) for r in rows]

@router.post('/{id}/messages', status_code=201, dependencies=[Depends(verify_api_key)])
async def post_message(id: str, payload: MessageCreate):
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO group_messages (id, groupe_id, auteur_uid, auteur_pseudo, contenu)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                payload.id, id, payload.auteur_uid, payload.auteur_pseudo, payload.contenu
            )
            # Update message count in group doc for listing optimization
            await conn.execute("UPDATE groupes SET message_count = message_count + 1 WHERE id = $1", id)
            
    return dict(row)
