with open('/root/account-service/routes/accounts.py', 'r') as f:
    c = f.read()

import re
if '@router.get(\"\",' not in c and \"@router.get('',\" not in c:
    insertion = \"\"\"
@router.get('', dependencies=[Depends(verify_api_key)])
async def list_accounts(limit: int = 100, offset: int = 0):
    async with pool().acquire() as conn:
        rows = await conn.fetch(
            'SELECT * FROM accounts ORDER BY created_at DESC LIMIT  OFFSET ',
            limit, offset
        )
    return [_row_to_dict(r) for r in rows]
\"\"\"
    c = c.replace(\"router = APIRouter(prefix='/accounts', tags=['accounts'])\", \"router = APIRouter(prefix='/accounts', tags=['accounts'])\" + insertion)

with open('/root/account-service/routes/accounts.py', 'w') as f:
    f.write(c)