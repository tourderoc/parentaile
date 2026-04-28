# Plan post-merge : SSE pour la salle vocale

> **À faire APRÈS le merge** (voir [MERGE_PLAN.md](MERGE_PLAN.md)) et après 1-2 semaines de surveillance en prod réelle.
> Décision : ne PAS implémenter avant le merge — empiler du WebSocket/SSE pendant le dual-write = complexité gratuite + risque de retarder la coupure Firebase.

---

## Problème ciblé

La latence ressentie côté Parent'aile vient principalement du **polling 5s sur `session_state`** pendant une session vocale active ([PLAN_MIGRATION_VPS.md:498](PLAN_MIGRATION_VPS.md#L498)).

Conséquence UX :
- Changement de phase visible avec ~5s de retard côté participants
- Suspension/reprise par l'animateur perçue comme "lente"
- Transitions cassées pendant les moments critiques

Le reste du polling (groupes 30s, messages 10s, notifs 15s, comptes 60s) **n'est pas un problème** et ne doit PAS être remplacé.

---

## Pourquoi SSE et pas WebSocket

| Critère | SSE | WebSocket |
|---|---|---|
| Direction | Serveur → client uniquement | Bidirectionnel |
| Reconnexion auto | ✅ Native navigateur | ❌ À gérer |
| Complexité serveur | ~50 lignes FastAPI | Lib + gestion état |
| Heartbeat | Géré par HTTP/2 | À implémenter |
| Scaling multi-instance | Compatible HTTP standard | Sticky sessions |
| Cas d'usage actuel | ✅ Parfait | Surdimensionné |

Le client envoie déjà ses commandes via REST (`PUT /groupes/{id}/session`). Pas de besoin bidirectionnel → SSE suffit.

WebSocket ne se justifierait que pour ajouter présence live ("qui parle / qui écrit") — pas dans le scope.

---

## Implémentation prévue (esquisse)

### Côté VPS (account-service)

Nouvel endpoint dans `groupes_router.py` :

```python
@router.get("/groupes/{groupe_id}/session/stream")
async def stream_session_state(groupe_id: str, request: Request):
    async def event_generator():
        last_state = None
        while True:
            if await request.is_disconnected():
                break
            current = await fetch_session_state(groupe_id)
            if current != last_state:
                yield f"data: {json.dumps(current)}\n\n"
                last_state = current
            await asyncio.sleep(1)  # poll DB côté serveur, push si changement
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

Alternative plus propre : utiliser PostgreSQL `LISTEN/NOTIFY` pour réagir instantanément aux UPDATE sur `groupes.session_state` au lieu de poller la DB côté serveur. À évaluer le moment venu.

### Côté React (SalleVocalePage.tsx)

Remplacer le polling 5s par :

```typescript
useEffect(() => {
  const eventSource = new EventSource(
    `${VPS_URL}/groupes/${groupeId}/session/stream`
  );
  eventSource.onmessage = (e) => {
    setSessionState(JSON.parse(e.data));
  };
  return () => eventSource.close();
}, [groupeId]);
```

L'optimistic UI animateur reste en place (zéro latence perçue côté animateur).

### Auth

`EventSource` ne supporte pas les headers custom. Options :
- Token en query param : `?token=xxx` (acceptable derrière HTTPS pour un token court-vie)
- Lib `eventsource` polyfill avec headers custom
- Cookie de session

À trancher au moment de l'implémentation.

---

## Checklist pré-implémentation

- [ ] Merge effectué et stable depuis ≥ 1 semaine
- [ ] Mesurer concrètement la latence ressentie (témoignages users beta sur la salle vocale)
- [ ] Vérifier que nginx en front est configuré pour SSE (`proxy_buffering off;` sur la route `/stream`)
- [ ] Tester reconnexion sur perte réseau mobile (mode avion ON/OFF)
- [ ] Garder le polling 5s en fallback derrière un feature flag pendant 7 jours

---

## Effort estimé

- **VPS endpoint SSE** : 1/2 journée
- **Refacto React SalleVocalePage** : 1/2 journée
- **Tests + nginx config** : 1/2 journée
- **Total** : ~1.5 jour

---

## Ce qu'on ne fait PAS

- ❌ WebSocket complet pour tout le polling — ROI nul, complexité élevée
- ❌ SSE pour notifications médecin — déjà couvert par FCM push (notif arrive même app fermée)
- ❌ SSE pour liste groupes / comptes / évaluations — aucun besoin temps réel
- ❌ SSE pour messages forum — polling 10s acceptable, gain UX marginal

Si la salle vocale en SSE marche bien et qu'un autre cas devient critique (ex : messages forum pendant un vocal), réévaluer **un cas à la fois**.
