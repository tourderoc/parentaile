import json
from fastapi import APIRouter, Depends, HTTPException
from auth import verify_api_key
from db import pool
from models import AccountCreate, AccountUpdate, AccountBatchRequest

router = APIRouter(prefix='/accounts', tags=['accounts'])


@router.get('', dependencies=[Depends(verify_api_key)])
async def list_accounts(limit: int = 100, offset: int = 0):
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM accounts ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            limit, offset
        )
    return [_row_to_dict(r) for r in rows]


def _row_to_dict(row) -> dict:
    """Convertit une Row asyncpg en dict serialisable (decode JSONB)."""
    d = dict(row)
    for field in ('avatar', 'participation_history'):
        if isinstance(d.get(field), str):
            d[field] = json.loads(d[field])
    return d


@router.post('', status_code=201, dependencies=[Depends(verify_api_key)])
async def create_account(payload: AccountCreate):
    async with pool().acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO accounts (
                    uid, email, pseudo, avatar,
                    avatar_gen_count, last_avatar_gen_date,
                    points, badge, participation_history,
                    fcm_token, fcm_token_updated_at, role
                )
                VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
                RETURNING *
                """,
                payload.uid,
                payload.email,
                payload.pseudo,
                json.dumps(payload.avatar) if payload.avatar is not None else None,
                payload.avatar_gen_count,
                payload.last_avatar_gen_date,
                payload.points,
                payload.badge,
                json.dumps(payload.participation_history),
                payload.fcm_token,
                payload.fcm_token_updated_at,
                payload.role,
            )
        except Exception as e:
            msg = str(e)
            if 'duplicate key' in msg and 'accounts_pkey' in msg:
                raise HTTPException(409, f'Account {payload.uid} already exists')
            if 'duplicate key' in msg and 'pseudo' in msg:
                raise HTTPException(409, f'Pseudo {payload.pseudo!r} already taken')
            raise HTTPException(400, msg)
    return _row_to_dict(row)


@router.get('/by-pseudo/{pseudo}', dependencies=[Depends(verify_api_key)])
async def get_by_pseudo(pseudo: str):
    async with pool().acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM accounts WHERE pseudo = $1', pseudo)
    if not row:
        raise HTTPException(404, f'Pseudo {pseudo!r} not found')
    return _row_to_dict(row)


@router.post('/batch', dependencies=[Depends(verify_api_key)])
async def batch_read(payload: AccountBatchRequest):
    if not payload.uids:
        return []
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM accounts WHERE uid = ANY($1::text[])',
            payload.uids,
        )
    return [_row_to_dict(r) for r in rows]


@router.get('/{uid}', dependencies=[Depends(verify_api_key)])
async def get_account(uid: str):
    async with pool().acquire() as conn:
        row = await conn.fetchrow('SELECT * FROM accounts WHERE uid = $1', uid)
    if not row:
        raise HTTPException(404, f'Account {uid} not found')
    return _row_to_dict(row)


@router.put('/{uid}', dependencies=[Depends(verify_api_key)])
async def update_account(uid: str, payload: AccountUpdate):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, 'No fields to update')

    for key in ('avatar', 'participation_history'):
        if key in data and data[key] is not None:
            data[key] = json.dumps(data[key])

    sets = []
    values = []
    for i, (k, v) in enumerate(data.items(), start=1):
        cast = '::jsonb' if k in ('avatar', 'participation_history') else ''
        sets.append(f'{k} = ${i}{cast}')
        values.append(v)
    values.append(uid)

    q = f'UPDATE accounts SET {", ".join(sets)} WHERE uid = ${len(values)} RETURNING *'

    async with pool().acquire() as conn:
        try:
            row = await conn.fetchrow(q, *values)
        except Exception as e:
            msg = str(e)
            if 'duplicate key' in msg and 'pseudo' in msg:
                raise HTTPException(409, 'Pseudo already taken')
            raise HTTPException(400, msg)
    if not row:
        raise HTTPException(404, f'Account {uid} not found')
    return _row_to_dict(row)


@router.delete('/{uid}', dependencies=[Depends(verify_api_key)])
async def delete_account(uid: str):
    async with pool().acquire() as conn:
        res = await conn.execute('DELETE FROM accounts WHERE uid = $1', uid)
    if res.endswith(' 0'):
        raise HTTPException(404, f'Account {uid} not found')
    return {'deleted': uid}
