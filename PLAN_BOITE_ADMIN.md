# Plan : Boîte de réception admin unifiée

> **Timing : à livrer AVANT le merge final.** Le but est que la coupure Firebase
> emporte aussi `banReports` (collection actuelle écrite par `submitBanFeedback`),
> sans laisser de canal de retour utilisateur derrière sur Firebase.
>
> Voir [MERGE_PLAN.md](MERGE_PLAN.md) pour le calendrier merge.
> Voir [PLAN_PILOTAGE_USERS_V2.md](../MedCompagion%20V1%20b%C3%A9ta/PLAN_PILOTAGE_USERS_V2.md)
> pour la refonte Pilotage globale post-merge — la boîte admin est livrée AVANT,
> dans un onglet dédié, et sera intégrée plus tard dans "Communauté Parent'aile".

---

## Contexte

Aujourd'hui, **3 canaux de retour parent → admin existent ou vont exister**, mais aucun
n'a d'interface de lecture côté MedCompanion. Tout part dans Firebase ou PostgreSQL
et personne ne le lit.

L'objectif : créer une **boîte de réception unique** dans MedCompanion qui agrège
les 3 canaux, pour que la psychiatre/admin puisse traiter ces signaux en un seul endroit.

---

## Les 3 canaux à unifier

| Canal | Origine côté parent | État actuel | Schéma sémantique |
|---|---|---|---|
| **Feedback général** (bug / suggestion / question) | Carte "Donner mon avis" dans Mon Espace | ❌ à créer | `(sender_uid, type, message, contexte)` |
| **Recours après ban vocal** | `BanScreen` dans `SalleVocalePage.tsx` | ✅ existe, écrit Firebase `banReports` | `(banned_uid, groupe_id, message)` |
| **Signalement participant** | Évaluation post-session (champ `signalement`) | ✅ existe, écrit PostgreSQL `ban_reports` | `(reporter_uid, reported_uid, reason, groupe_id)` |

> **⚠️ Piège de nommage :** la collection Firebase `banReports` (recours du banni) et
> la table PostgreSQL `ban_reports` (signalement participant→participant) **portent presque
> le même nom mais sont deux features distinctes**. On en profite pour clarifier en renommant
> côté VPS : `ban_appeals` pour les recours, `ban_reports` reste pour les signalements.

---

## Décisions cadrées

- ✅ **Une seule boîte admin** dans MedCompanion (3ème onglet du Pilotage, à côté d'Utilisateurs et Serveur)
- ✅ **3 tables séparées** côté VPS (pas de fourre-tout polymorphe), endpoint agrégé pour la lecture
- ✅ **Avant le merge** : tout doit fonctionner pour pouvoir couper Firebase `banReports` lors du merge
- ✅ **Dual-write pendant la transition** sur `submitBanFeedback` (VPS + Firebase, cohérent avec le bridge actuel)
- ✅ **Migration one-shot** de Firebase `banReports` → PostgreSQL `ban_appeals` avant le merge
- ✅ **Pas de système de tickets / réponse** en V1 → juste lecture, marquer comme lu, supprimer
- ✅ **Polling 5 min** côté MedCompanion (pas de SSE/WebSocket nécessaire)

---

## Phase 0 — Schéma VPS

### 0.1 — Nouvelle table `ban_appeals` (recours du banni)

```sql
CREATE TABLE ban_appeals (
  id                  SERIAL PRIMARY KEY,
  groupe_id           TEXT,
  participant_uid     TEXT NOT NULL,
  participant_pseudo  TEXT,
  feedback            TEXT NOT NULL,
  reviewed            BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT,            -- email admin qui a marqué comme lu
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ban_appeals_unreviewed ON ban_appeals(reviewed, created_at DESC);
CREATE INDEX idx_ban_appeals_uid ON ban_appeals(participant_uid);
```

### 0.2 — Nouvelle table `user_feedback`

```sql
CREATE TABLE user_feedback (
  id              SERIAL PRIMARY KEY,
  sender_uid      TEXT NOT NULL,
  sender_pseudo   TEXT,
  type            TEXT NOT NULL,          -- 'bug' | 'suggestion' | 'question'
  message         TEXT NOT NULL,
  context         JSONB,                  -- {url, user_agent, app_version}
  reviewed        BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_feedback_unreviewed ON user_feedback(reviewed, created_at DESC);
CREATE INDEX idx_user_feedback_type ON user_feedback(type);
```

### 0.3 — `ban_reports` existe déjà

[Schéma existant dans account-service](https://github.com/tourderoc/parentaile-vps), aucun changement
nécessaire. On ajoute juste `reviewed`/`reviewed_at`/`reviewed_by` si pas déjà là pour cohérence
avec la boîte admin.

```sql
ALTER TABLE ban_reports ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ban_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE ban_reports ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
```

---

## Phase 1 — Endpoints VPS

> Tous protégés par `X-Api-Key`. La boîte admin réutilise la clé existante account-service.

```
# Feedback (écriture Parent'aile, lecture MedCompanion)
POST   /feedback                          → parent envoie un feedback
GET    /feedback                          → MedCompanion liste (filtres status/type)
PUT    /feedback/{id}/reviewed            → marquer comme lu
DELETE /feedback/{id}                     → supprimer

# Ban appeals (écriture Parent'aile, lecture MedCompanion)
POST   /ban-appeals                       → parent banni envoie son recours
GET    /ban-appeals                       → MedCompanion liste
PUT    /ban-appeals/{id}/reviewed         → marquer comme lu
DELETE /ban-appeals/{id}                  → supprimer

# Ban reports (déjà existant, ajouter actions admin)
GET    /ban-reports                       → déjà là (lecture)
PUT    /ban-reports/{id}/reviewed         → 🆕 marquer comme lu
DELETE /ban-reports/{id}                  → 🆕 supprimer

# Endpoint agrégé pour la boîte admin
GET    /admin/inbox?status=unread&type=&limit=50&offset=0
       → UNION des 3 tables avec champ "source" : 'feedback' | 'ban_appeal' | 'ban_report'
       → tri par date desc

GET    /admin/inbox/stats
       → { unread_total, unread_feedback, unread_appeals, unread_reports }
```

---

## Phase 2 — Parent'aile

### 2.1 — Carte "Donner mon avis" dans Mon Espace

- Nouvelle carte (4ème tuile) à côté de Badge Nid dans `SlideMonEspace.tsx`
- Click → modal avec :
  - Radio type : 🐛 Bug / 💡 Suggestion / ❓ Question
  - Textarea (min 10 chars, max 1000)
  - Bouton Envoyer
- Capture auto en background : `url` (location.href), `user_agent`, `app_version` (depuis Vite env)
- POST `/feedback` avec `{ sender_uid, sender_pseudo, type, message, context }`
- Confirmation "Merci, votre retour a bien été reçu"

### 2.2 — Migration `submitBanFeedback` Firebase → VPS

Dans [groupeParoleService.ts:653-668](src/lib/groupeParoleService.ts#L653-L668), remplacer
l'écriture Firebase par un POST `/ban-appeals`. **Dual-write** pendant la transition (cohérent
avec le bridge actuel) :

```typescript
export async function submitBanFeedback(
  groupeId: string,
  participantUid: string,
  participantPseudo: string,
  feedback: string
): Promise<void> {
  // VPS bridge — source de vérité
  await fetch(`${VPS_URL}/ban-appeals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': VPS_KEY },
    body: JSON.stringify({
      groupe_id: groupeId,
      participant_uid: participantUid,
      participant_pseudo: participantPseudo,
      feedback,
    }),
  });

  // @FIREBASE_LEGACY — dual-write tant que VITE_FIREBASE_BRIDGE !== 'false'
  if (USE_FIREBASE) {
    try {
      await addDoc(collection(db, 'banReports'), {
        groupeId, participantUid, participantPseudo, feedback,
        dateReport: serverTimestamp(), reviewed: false,
      });
    } catch { /* Firebase indisponible, VPS fait foi */ }
  }
}
```

### 2.3 — Signalement participant (existant)

Aucun changement de flow. La table PostgreSQL `ban_reports` se remplit déjà via
le champ `signalement` dans l'évaluation post-session. Juste s'assurer qu'elle
est bien lue par l'endpoint agrégé `/admin/inbox`.

---

## Phase 3 — MedCompanion : onglet "Boîte admin"

### 3.1 — Nouvel onglet dans Pilotage

- 3ème onglet "Boîte admin" (après Utilisateurs et Serveur)
- Badge avec compteur non-lus (alimenté par `GET /admin/inbox/stats`)
- Polling 5 min

### 3.2 — Liste unifiée

Colonnes :
- Date
- Type (icône + couleur) :
  - 🐛 Bug — bleu
  - 💡 Suggestion — vert
  - ❓ Question — jaune
  - ⚠️ Recours ban — orange
  - 🚨 Signalement — rouge
- Pseudo (sender ou banni ou reporter selon le type)
- Début du message (60 chars)
- Statut (lu / non lu)

Filtres :
- Tous / Non lus / Lus
- Tous types / Bug / Suggestion / Question / Recours / Signalement

### 3.3 — Panneau détail (à droite)

Vue adaptée au type :

| Type | Détail affiché | Actions |
|---|---|---|
| **Feedback** | message + URL + user-agent + version app | Marquer lu / Supprimer |
| **Recours ban** | message + ref groupe + lien profil banni | Marquer lu / Voir profil / Supprimer |
| **Signalement** | reporter + reported + raison + groupe | Marquer lu / Voir profil reported / Supprimer |

### 3.4 — Code

- Nouveau service C# `AdminInboxService.cs` (wrapper sur `/admin/inbox` + actions)
- Nouvel onglet XAML `BoiteAdminTab` dans PilotageControl
- Pas de refonte de PilotageControl (qui fait déjà 1209 lignes) — le nouvel onglet vit à côté

---

## Phase 4 — Migration Firebase `banReports` → PostgreSQL `ban_appeals`

> À faire **avant** le merge final, pour que la coupure Firebase emporte aussi
> cette collection.

Script one-shot Python (à ajouter dans `migrate_firebase_to_vps.py` existant ou nouveau script) :

```python
# Lecture Firebase banReports
docs = db.collection('banReports').stream()
for doc in docs:
    data = doc.to_dict()
    await pool.execute("""
        INSERT INTO ban_appeals (
            groupe_id, participant_uid, participant_pseudo,
            feedback, reviewed, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
    """,
        data.get('groupeId'),
        data.get('participantUid'),
        data.get('participantPseudo'),
        data.get('feedback'),
        data.get('reviewed', False),
        data.get('dateReport').to_pydatetime() if data.get('dateReport') else now,
    )
```

Idempotent (`ON CONFLICT DO NOTHING`), exécutable plusieurs fois sans risque.

À intégrer dans la **checklist du jour du merge** comme étape supplémentaire :

```
3. Migration des données — étape 1.bis :
   venv/bin/python3 migrate_ban_reports_to_appeals.py
```

---

## Hors scope V1

- ❌ Réponse aux feedbacks (style "ticket support") — V1 = lecture seule
- ❌ Catégorisation automatique (IA classifie bug vs suggestion) — pas le moment
- ❌ Notifications push admin temps réel — polling 5 min suffit
- ❌ Export CSV des feedbacks — si besoin réel plus tard
- ❌ Statistiques avancées (NPS, sentiment, etc.) — focus rétroactif simple
- ❌ Fusion avec la table `ban_reports` existante (signalements) — gardée séparée pour clarté sémantique

---

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Spam de feedbacks bidons | Rate-limit côté VPS : 5 feedbacks max / parent / 24h. Suppression facile depuis MedCompanion. |
| Recours ban abusif (parent banni qui spamme) | Rate-limit : 1 recours max / groupe / parent. Lecture seule côté MedCompanion suffit. |
| Faire ce chantier retarde le merge | Surface limitée (3 endpoints + 1 onglet + 1 modal) → ~3j cumulés. À démarrer dès la fin de la stabilisation Bridge. |
| Migration `banReports` rate au merge | Script idempotent + dry-run testé d'avance + même `ON CONFLICT DO NOTHING` que les autres migrations |
| Confusion `ban_reports` vs `ban_appeals` | Renommage explicite côté VPS, doc claire, l'endpoint `/admin/inbox` distingue avec champ `source` |

---

## Effort estimé

| Phase | Effort |
|---|---|
| 0 — Schéma VPS (`ban_appeals` + `user_feedback`) | 0.5j |
| 1 — Endpoints VPS (CRUD + `/admin/inbox` agrégé) | 0.5j |
| 2 — Parent'aile (carte Mon Espace + dual-write submitBanFeedback) | 0.5j |
| 3 — MedCompanion (onglet Boîte admin) | 1j |
| 4 — Migration one-shot `banReports` Firebase → VPS | 0.5j |
| **Total** | **~3 jours** |

À étaler sur plusieurs commits successifs, comme convenu.

---

## Articulation avec PLAN_PILOTAGE_USERS_V2

La boîte admin V1 est livrée **avant le merge** dans un onglet "Boîte admin" dédié.

Lors de la refonte post-merge planifiée dans
[PLAN_PILOTAGE_USERS_V2.md](../MedCompagion%20V1%20b%C3%A9ta/PLAN_PILOTAGE_USERS_V2.md),
cet onglet sera **intégré comme sous-section** de l'onglet "Communauté Parent'aile"
(à côté de la liste utilisateurs, des stats, de l'audit log).

Pas de refonte intermédiaire — l'onglet V1 reste tel quel jusqu'à la grande refonte.

---

## Ordre d'implémentation recommandé

1. **Phase 0 + 1 (VPS)** en premier — peut être fait sans toucher Parent'aile ni MedCompanion
2. **Phase 2 (Parent'aile)** — dual-write actif pour `submitBanFeedback`, nouvelle carte Mon Espace
3. **Phase 3 (MedCompanion)** — onglet de lecture
4. **Phase 4 (migration)** — au moment du merge, intégrée à la checklist

Chaque phase = un ou plusieurs petits commits, validés en bout-en-bout avant de passer à la suivante.
