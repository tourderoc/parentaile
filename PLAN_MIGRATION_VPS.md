# Plan : Migration progressive Firebase → VPS

## Contexte

Firebase fonctionne mais présente deux problèmes structurels :
- **Coûts imprévisibles** : pas de plafond natif, une boucle ou un pic d'usage peut faire exploser la facture. À 0.30€ pour un utilisateur en test, l'extrapolation à 100 utilisateurs donne 30€/mois sur Firebase contre ~15€ fixes sur VPS.
- **Opacité** : difficile de savoir exactement quel service consomme quoi, et impossible d'arrêter un service isolément en cas de problème.

**Objectif :** Remplacer progressivement Firebase par des services VPS spécialisés, service par service, sans rupture pour les utilisateurs. Chaque service est autonome, stoppable, et à coût prévisible.

## Ce qu'on garde dans Firebase à vie

| Service | Raison |
|---------|--------|
| **Firebase Auth** | Gratuit jusqu'à 10K MAU, gère OAuth/Google, sécurité battle-tested — trop risqué à remplacer |
| **FCM (push notifications)** | Gratuit + obligatoire pour les notifications mobiles iOS/Android |

**Règle :** le UID Firebase reste l'identifiant universel de l'utilisateur dans tous les services VPS.

## Etat actuel

**Déjà migré :**
- Service Avatar VPS (`https://avatar.parentaile.fr`) ✅
  - Transformation IA (paprika ONNX)
  - Stockage config DiceBear (JSON)
  - Backups automatiques par utilisateur
  - Clé API, logs, structure modulaire

**Encore dans Firebase :**
- Firestore : comptes, groupes, sessions, tokens enfants, notifications, historique
- Cloud Functions : rappels vocaux, getLiveKitToken, logique badges
- Storage : (non utilisé activement, avatars déjà sur VPS)

---

## Phase 2 — Cloud Functions → Services VPS

> **Priorité : haute**
> Réduit immédiatement les coûts d'invocation Firebase Functions.
> Ces services existent déjà en partie (rappels dans `functions/src/index.ts`).

### 2A. Service Notifications VPS

**Responsabilité unique :** déclencher les rappels de sessions vocales et écrire les notifications dans la base de données.

**Remplace :** Cloud Function `sendVocalReminders`

**Endpoints :**
```
POST /notifications/vocal-reminder     → envoie rappel 15min/5min avant session
POST /notifications/parent             → écrit une notification parent (remplace sendParentNotification)
GET  /notifications/{uid}              → liste des notifications d'un utilisateur
PUT  /notifications/{uid}/{id}/read    → marque comme lue
DELETE /notifications/{uid}/{id}       → supprime
```

**Déclenchement :** cron sur VPS (remplace Cloud Scheduler Firebase)

**Stockage :** PostgreSQL (Phase 3) ou JSON par utilisateur dans un premier temps

---

### 2B. Service Token LiveKit VPS

**Responsabilité unique :** générer les tokens LiveKit pour rejoindre une salle.

**Remplace :** Cloud Function `getLiveKitToken`

**Endpoints :**
```
POST /livekit/token     → génère un token signé pour {uid, groupeId, isAnimateur}
```

**Avantage :** le VPS a déjà LiveKit, la clé secrète est déjà en place.

---

### 2C. Service Badges VPS

**Responsabilité unique :** calculer et attribuer les badges selon les points de participation.

**Remplace :** logique de badges dans les Cloud Functions

**Endpoints :**
```
POST /badges/{uid}/evaluate     → recalcule le badge selon les points actuels
GET  /badges/{uid}              → retourne le badge actuel
```

---

## Phase 3 — Données → PostgreSQL VPS

> **Priorité : haute (après Phase 2)**
> C'est le plus gros levier de réduction des coûts Firestore.
> Remplace les lectures/écritures Firestore par une base relationnelle sur VPS.

### Schéma cible PostgreSQL

```sql
-- Comptes utilisateurs (données non-auth)
accounts (uid, pseudo, email, points, badge, avatar_type, avatar_url, created_at, updated_at)

-- Groupes de parole
groupes (id, titre, description, createur_uid, date_session, statut, max_participants, created_at)

-- Inscriptions groupes
groupe_inscriptions (groupe_id, uid, inscrit_at)

-- Sessions vocales (état en cours)
sessions (groupe_id, phase_index, session_active, started_at, updated_at)

-- Notifications parents
parent_notifications (id, recipient_uid, type, title, body, read, groupe_id, created_at)

-- Tokens enfants
tokens_enfants (token_id, parent_uid, nickname, created_at)

-- Historique participation
participation_history (uid, groupe_id, role, duration_minutes, points_earned, participated_at)
```

### Migration des données

Chaque collection Firestore sera exportée et importée dans PostgreSQL.
Un script de migration one-shot sera écrit pour chaque collection.
Les deux bases tournent en parallèle pendant la période de transition (dual-read).

### Remplacement des listeners temps réel

`onSnapshot` Firestore sera remplacé par :
- **Polling léger** (toutes les 10-30s) pour les données non-critiques (notifications, profil)
- **WebSocket** sur le VPS pour les données critiques temps réel (état session vocale, présence)

---

## Phase 4 — Tokens enfants → Service VPS

> **Priorité : moyenne**

**Responsabilité unique :** gérer les tokens de liaison parent-enfant (médecin → parent).

**Endpoints :**
```
POST /tokens              → créer un token enfant
GET  /tokens/{parent_uid} → lister les tokens d'un parent
DELETE /tokens/{token_id} → révoquer un token
GET  /tokens/{token_id}/validate → valider un token (côté médecin)
```

---

## Architecture VPS cible

```
VPS Hostinger (145.223.117.145)
│
├── nginx (reverse proxy HTTPS)
│   ├── avatar.parentaile.fr        → :8000 (avatar-service) ✅
│   ├── api.parentaile.fr           → :8001 (api-gateway)
│   └── livekit.parentaile.fr       → :7880 (livekit) ✅
│
├── Services Python/FastAPI
│   ├── avatar-service   :8000  ✅
│   ├── notif-service    :8001  (Phase 2A)
│   ├── livekit-service  :8002  (Phase 2B)
│   └── badges-service   :8003  (Phase 2C)
│
├── PostgreSQL           :5432  (Phase 3)
│
└── Cron (systemd timer)
    └── vocal-reminders (remplace Cloud Scheduler)
```

## Sécurité

- Chaque service a sa propre clé API (`X-Api-Key` header)
- Le UID Firebase est vérifié côté service (via Firebase Admin SDK ou jwt decode)
- PostgreSQL accessible uniquement en local (pas exposé publiquement)
- Backups PostgreSQL quotidiens vers dossier local + rotation 30 jours

## Ordre d'implémentation recommandé

| Etape | Service | Impact coût | Complexité |
|-------|---------|-------------|------------|
| ✅ | Avatar service | Faible | Faible |
| 2 | LiveKit token service | Moyen | Faible |
| 3 | Notifications service + cron | Elevé | Moyen |
| 4 | PostgreSQL + migration données | Très élevé | Elevé |
| 5 | Badges service | Faible | Faible |
| 6 | Tokens enfants service | Moyen | Moyen |

## Règles de développement pour chaque service

1. **Un service = une responsabilité** — ne jamais ajouter de logique métier d'un autre domaine
2. **Toujours des logs** — chaque service écrit dans `logs/service.log`
3. **Toujours des backups** — toute écriture crée une copie datée
4. **Clé API obligatoire** — aucun endpoint public sans authentification
5. **Tuple return pattern** — `(success, result, error)` pour la cohérence avec MedCompanion
6. **Dual-write pendant la transition** — écrire VPS + Firebase en parallèle, puis retirer Firebase
