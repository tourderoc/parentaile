# Plan : Migration progressive Firebase → VPS

## Contexte

Firebase fonctionne mais présente deux problèmes structurels :
- **Coûts imprévisibles** : pas de plafond natif, une boucle ou un pic d'usage peut faire exploser la facture. À 0.30€ pour un utilisateur en test, l'extrapolation à 100 utilisateurs donne 30€/mois sur Firebase contre ~15€ fixes sur VPS.
- **Opacité** : difficile de savoir exactement quel service consomme quoi, et impossible d'arrêter un service isolément en cas de problème.

**Objectif :** Remplacer progressivement Firebase par des services VPS spécialisés, service par service, sans rupture pour les utilisateurs. Chaque service est autonome, stoppable, et à coût prévisible.

---

## Ce qu'on garde dans Firebase à vie

| Service | Raison |
|---------|--------|
| **Firebase Auth** | Gratuit jusqu'à 10K MAU, gère OAuth/Google, sécurité battle-tested — trop risqué à remplacer |
| **FCM (push notifications)** | Gratuit + obligatoire pour les notifications mobiles iOS/Android |

**Règle :** le UID Firebase reste l'identifiant universel de l'utilisateur dans tous les services VPS.

---

## Cartographie des collections Firebase

Avant de migrer, il est essentiel de savoir qui lit/écrit quoi. Deux apps utilisent Firebase : **Parent'aile** (React web) et **MedCompanion** (C# desktop).

### Collections internes à Parent'aile uniquement

| Collection | Usage |
|------------|-------|
| `accounts` | Profil utilisateur, avatar, points, badge |
| `groupes` | Groupes de parole |
| `parentNotifications` | Notifications internes Parent'aile |
| `orders` | Paiements Stripe |
| `banReports` | Signalements |
| `users` | Données auth complémentaires |
| `livres_enfants` / `livres_parents` / `posts` | Contenu éditorial |

### Collections partagées MedCompanion ↔ Parent'aile (le pont)

| Collection | MedCompanion (C#) | Parent'aile (React) |
|------------|-------------------|---------------------|
| `tokens` | Crée, révoque, supprime, listener temps réel, sync statuts | Lit, valide, marque "used" |
| `messages` | Lit, listener temps réel, répond, supprime | Parent écrit, lit les réponses (MessageHistory) |
| `notifications` | Écrit les notifications médecin → parent (WriteNotificationAsync, SendBroadcast) | Lit et affiche (DoctorNotifications) |
| `accounts` | Lit les pseudos parents (FetchParentNicknamesAsync) | Écrit le profil (source de vérité) |

Ces 3 collections (`tokens`, `messages`, `notifications`) forment un **pont bidirectionnel** entre les deux applications. Firebase est aujourd'hui le seul intermédiaire.

---

## Etat actuel de la migration

**Déjà migré :**
- Service Avatar VPS (`https://avatar.parentaile.fr`) ✅
  - Transformation IA (paprika ONNX)
  - Stockage config DiceBear (JSON)
  - Backups automatiques par utilisateur
  - Clé API, logs, structure modulaire

**Encore dans Firebase :**
- Firestore : toutes les collections listées ci-dessus
- Cloud Functions : rappels vocaux, getLiveKitToken, logique badges
- Storage : non utilisé activement (avatars déjà sur VPS)

---

## Phase 2 — Cloud Functions → Services VPS

> **Priorité : haute**
> Réduit immédiatement les coûts d'invocation Firebase Functions.
> Ces services n'impliquent qu'une seule app (Parent'aile).

### 2A. Service LiveKit Token VPS

**Responsabilité unique :** générer les tokens LiveKit pour rejoindre une salle vocale.

**Remplace :** Cloud Function `getLiveKitToken`

**Avantage :** le VPS héberge déjà LiveKit, la clé secrète est déjà en place.

```
POST /livekit/token   → génère un token signé pour {uid, groupeId, isAnimateur}
```

---

### 2B. Service Notifications VPS (Parent'aile interne)

**Responsabilité unique :** déclencher les rappels de sessions vocales et gérer les notifications internes Parent'aile.

**Remplace :** Cloud Function `sendVocalReminders` + Cloud Scheduler Firebase

```
POST /notifications/vocal-reminder       → rappel 15min/5min avant session
POST /notifications/parent               → crée une notification parent
GET  /notifications/{uid}                → liste notifications d'un utilisateur
PUT  /notifications/{uid}/{id}/read      → marque comme lue
DELETE /notifications/{uid}/{id}         → supprime
```

**Déclenchement :** cron systemd sur VPS (remplace Cloud Scheduler)

---

### 2C. Service Badges VPS

**Responsabilité unique :** calculer et attribuer les badges selon les points de participation.

**Remplace :** logique de badges dans les Cloud Functions

```
POST /badges/{uid}/evaluate   → recalcule le badge selon les points actuels
GET  /badges/{uid}            → retourne le badge actuel
```

---

## Phase 3 — Données Parent'aile → PostgreSQL VPS

> **Priorité : haute (après Phase 2)**
> Plus gros levier de réduction des coûts Firestore.
> Concerne uniquement les collections internes à Parent'aile.

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

-- Notifications internes Parent'aile
parent_notifications (id, recipient_uid, type, title, body, read, groupe_id, created_at)

-- Historique participation
participation_history (uid, groupe_id, role, duration_minutes, points_earned, participated_at)
```

### Migration des données

- Chaque collection Firestore exportée et importée via script one-shot
- Dual-read pendant la transition (VPS + Firebase en parallèle)
- Retrait Firebase collection par collection une fois validé

### Remplacement des listeners temps réel

`onSnapshot` Firestore remplacé par :
- **Polling léger** (10-30s) pour données non-critiques (notifications, profil)
- **WebSocket** VPS pour données critiques temps réel (état session vocale, présence)

---

## Phase 4 — Bridge Service MedCompanion ↔ Parent'aile

> **Priorité : moyenne (après Phase 3)**
> Chantier coordonné : nécessite de modifier **deux codebases** simultanément.
> MedCompanion (C#) + Parent'aile (React) doivent changer d'URL en même temps.

### Pourquoi un service dédié

Les collections `tokens`, `messages` et `notifications` forment un pont entre deux applications différentes. Les regrouper dans un seul **Bridge Service** permet :
- Un point d'entrée unique pour la communication médecin ↔ parent
- Un seul endroit à maintenir, monitorer, sécuriser
- Une clé API commune aux deux apps pour ce flux

### Endpoints Bridge Service

**Tokens médecin → parent :**
```
POST   /bridge/tokens                      → MedCompanion crée un token patient
GET    /bridge/tokens/{tokenId}            → Parent'aile valide un token
PUT    /bridge/tokens/{tokenId}/use        → Parent'aile active le token
PUT    /bridge/tokens/{tokenId}/revoke     → MedCompanion révoque
DELETE /bridge/tokens/{tokenId}            → MedCompanion supprime
GET    /bridge/tokens/sync/{doctorId}      → MedCompanion sync statuts + pseudos (remplace SyncFromFirebaseAsync)
```

**Messages parent → médecin :**
```
POST   /bridge/messages                    → Parent écrit un message au médecin
GET    /bridge/messages?since={ts}         → MedCompanion récupère les nouveaux messages
PUT    /bridge/messages/{id}/reply         → MedCompanion répond
DELETE /bridge/messages/{id}              → MedCompanion supprime
```

**Notifications médecin → parent :**
```
POST   /bridge/notifications               → MedCompanion envoie une notification
POST   /bridge/notifications/broadcast     → MedCompanion envoie à tous ses parents
GET    /bridge/notifications/{uid}         → Parent'aile lit ses notifications médecin
```

### Stockage Bridge Service

```sql
-- Tokens médecin-parent
bridge_tokens (token_id, doctor_id, patient_id, patient_name, status, pseudo, created_at, used_at, revoked_at)

-- Messages parent → médecin
bridge_messages (id, token_id, doctor_id, parent_uid, content, urgency, ai_summary, status, reply_content, replied_at, created_at)

-- Notifications médecin → parent
bridge_notifications (id, doctor_id, recipient_uid, token_id, type, title, body, reply_to_message_id, created_at)
```

### Listener temps réel MedCompanion

MedCompanion utilise aujourd'hui `FirestoreChangeListener` (SDK Firestore) pour recevoir les messages en temps réel. Sur VPS, ce listener sera remplacé par :
- **Polling** toutes les 30s (simple, suffisant pour un cabinet médical)
- Ou **WebSocket** si la réactivité temps réel est nécessaire

---

## Architecture VPS cible

```
VPS Hostinger (145.223.117.145)
│
├── nginx (reverse proxy HTTPS)
│   ├── avatar.parentaile.fr    → :8000  (avatar-service) ✅
│   ├── api.parentaile.fr       → :8001  (livekit-token + notif + badges)
│   ├── bridge.parentaile.fr    → :8004  (bridge-service médecin↔parent)
│   └── livekit.parentaile.fr   → :7880  (livekit) ✅
│
├── Services Python/FastAPI
│   ├── avatar-service    :8000  ✅ (Phase 1)
│   ├── livekit-service   :8001  (Phase 2A)
│   ├── notif-service     :8002  (Phase 2B)
│   ├── badges-service    :8003  (Phase 2C)
│   └── bridge-service    :8004  (Phase 4)
│
├── PostgreSQL            :5432  (Phase 3)
│
└── Cron (systemd timers)
    └── vocal-reminders          (remplace Cloud Scheduler Firebase)
```

---

## Sécurité

- Chaque service a sa propre clé API (`X-Api-Key` header)
- Le UID Firebase reste l'identifiant universel (jamais remplacé)
- PostgreSQL accessible uniquement en local (jamais exposé publiquement)
- Backups PostgreSQL quotidiens + rotation 30 jours
- Bridge Service : clé API partagée entre MedCompanion et Parent'aile pour le flux commun

---

## Ordre d'implémentation recommandé

| Etape | Service | Apps impactées | Impact coût | Complexité |
|-------|---------|----------------|-------------|------------|
| ✅ | Avatar service | Parent'aile | Faible | Faible |
| 2 | LiveKit token service | Parent'aile | Moyen | Faible |
| 3 | Notifications + cron | Parent'aile | Elevé | Moyen |
| 4 | Badges service | Parent'aile | Faible | Faible |
| 5 | PostgreSQL + migration données | Parent'aile | Très élevé | Elevé |
| 6 | Bridge Service | MedCompanion + Parent'aile | Elevé | Elevé |

---

## Règles de développement pour chaque service

1. **Un service = une responsabilité** — ne jamais mélanger les domaines métier
2. **Toujours des logs** — chaque service écrit dans `logs/service.log`
3. **Toujours des backups** — toute écriture crée une copie datée
4. **Clé API obligatoire** — aucun endpoint public sans authentification
5. **Dual-write pendant la transition** — écrire VPS + Firebase en parallèle, retirer Firebase une fois validé
6. **Tuple return pattern** — `(success, result, error)` pour cohérence avec MedCompanion (C#)
7. **Ne jamais bloquer les deux apps** — chaque étape doit être déployable sans coordination simultanée, sauf la Phase 4 (Bridge)
