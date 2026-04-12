# Plan : Migration progressive Firebase → VPS

## Contexte

Firebase fonctionne mais présente deux problèmes structurels :
- **Coûts imprévisibles** : pas de plafond natif, une boucle ou un pic d'usage peut faire exploser la facture. À 0.30€ pour un utilisateur en test, l'extrapolation à 100 utilisateurs donne 30€/mois sur Firebase contre ~15€ fixes sur VPS.
- **Opacité** : difficile de savoir exactement quel service consomme quoi, et impossible d'arrêter un service isolément en cas de problème.

**Objectif :** Remplacer progressivement Firebase par des services VPS spécialisés, service par service, sans rupture pour les utilisateurs. Chaque service est autonome, stoppable, et à coût prévisible.

---

## Principe de transition : cut-over net (V1 bêta)

**Changement stratégique (2026-04-12) :** on abandonne le dual-write au profit d'une **coupure nette** en fenêtre de maintenance. Raison : pour une V1 bêta de 150 utilisateurs, le dual-write coûte plus cher qu'il ne rapporte (double code, double bug surface, deux sources de vérité à réconcilier, complexité de diff). Le cut-over pendant une maintenance dimanche est plus simple, plus sûr et plus rapide.

### Processus de bascule pour chaque brique

```
Etape 1 — Implémenter le service VPS (code + infra + tests)
Etape 2 — Brancher le code React derrière un feature flag
           VITE_STORAGE_BACKEND=vps en dev, firebase en main
Etape 3 — Valider end-to-end sur la branche dev
           Tous les flows testés : inscription, profil, avatar, groupes...
Etape 4 — Fenêtre de maintenance programmée (dimanche)
           - Afficher page maintenance (~24h annoncées, ~2-4h réelles)
           - Export one-shot Firebase → Postgres
           - Diff de contrôle
           - Bascule VITE_STORAGE_BACKEND=vps sur main
           - Build + déploiement
           - Retrait page maintenance
Etape 5 — Surveillance 72h avec rollback armé
Etape 6 — Archivage de la collection Firebase (lecture seule pendant 30j puis suppression)
```

### Pré-requis avant la fenêtre de maintenance

1. **Tous les services VPS concernés sont livrés et validés sur dev** — aucun service ne doit être migré "à chaud" pendant la maintenance
2. **Script de migration testé à blanc** — au moins 3 exécutions sur un dump de prod anonymisé
3. **Rollback possible en 5 minutes** — un changement de `VITE_STORAGE_BACKEND` + redéploiement suffit à rebrancher Firebase

### Rollback d'urgence

Le feature flag `VITE_STORAGE_BACKEND=vps|firebase` (côté React) et `STORAGE_BACKEND` (côté services VPS internes) permet de rebasculer sans redéploiement d'infra. Pour le rollback React, un redéploiement rapide de l'app est nécessaire — prévoir le build de secours prêt à l'avance.

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

### Collections internes à Parent'aile uniquement (V1 bêta — périmètre réel)

| Collection | Statut | Usage | Destination VPS |
|------------|--------|-------|-----------------|
| `accounts` | ✅ actif (13 fichiers) | Source de vérité : profil, avatar, points, badge, inscriptions, settings | `account-service` |
| `users` | ⚠️ reliquat (2 fichiers) | Stub inscription + check admin (`role === 'hanene'`). Fusionné dans `accounts` à la migration. | `account-service` (fusion) |
| `groupes` | ✅ actif | Groupes de parole | `account-service` |
| `parentNotifications` | ✅ actif | Notifications internes Parent'aile | `notif-service` |
| `banReports` | ✅ actif | Signalements (utilisé par `groupeParoleService`) | `account-service` |

### Collections scaffolding (non migrées — features pas encore en prod)

| Collection | Raison |
|------------|--------|
| `orders` | Stripe pas encore en prod |
| `livres_enfants` / `livres_parents` / `posts` | Shop éditorial pas encore en prod |

Ces collections seront traitées le jour où les features correspondantes seront activées. Hors périmètre V1 bêta.

### Fusion `users` → `accounts`

La collection `users` est un reliquat du design initial : elle est écrite à l'inscription (`{uid, email, pseudo, date_inscription, role?}`) mais **jamais lue** sauf pour un check admin unique dans `LegalNotice`. Tous ses champs utiles existent déjà dans `accounts`.

**Plan de fusion :**
- Ajouter un champ `role TEXT NULL` dans la table `accounts` PostgreSQL
- Côté React : à l'inscription, écrire uniquement dans `accounts` (supprimer le `setDoc(doc(db, "users", ...))` dans `RegisterForm.tsx`)
- `LegalNotice.tsx` lit `role` depuis `accounts` au lieu de `users`
- Après migration : archiver puis supprimer la collection Firebase `users`

### Collections partagées MedCompanion ↔ Parent'aile (le pont)

| Collection | MedCompanion (C#) | Parent'aile (React) | Destination VPS |
|------------|-------------------|---------------------|-----------------|
| `tokens` | Crée, révoque, supprime, polling 60s, sync statuts | Lit, valide, marque "used" | `bridge-service` |
| `messages` | Lit, listener temps réel, répond, supprime | Parent écrit, lit les réponses (MessageHistory) | `bridge-service` |
| `notifications` | Écrit les notifications médecin → parent (WriteNotificationAsync, SendBroadcast) | Lit et affiche (DoctorNotifications) | `bridge-service` |
| `accounts` | Lit les pseudos parents (FetchParentNicknamesAsync) | Écrit le profil (source de vérité) | `account-service` (exposition d'un endpoint lecture au Bridge) |

Ces 3 collections (`tokens`, `messages`, `notifications`) forment un **pont bidirectionnel** entre les deux applications. Firebase est aujourd'hui le seul intermédiaire. `accounts` est interne à Parent'aile mais lu par MedCompanion via un seul endpoint (FetchParentNicknames) — pas besoin de le dupliquer dans le Bridge, il suffit d'exposer une lecture depuis `account-service`.

---

## Etat actuel de la migration

**Déjà livré :**
- **Phase 1 — Avatar service** (`https://avatar.parentaile.fr`) ✅
  - Transformation IA (paprika ONNX), stockage config DiceBear, backups, clé API
- **Phase 2 — Account service** (`https://account.parentaile.fr`) ✅ *(2026-04-12)*
  - PostgreSQL 16 installé sur le VPS, DB `account_db`, user `account_service`
  - Schéma : `accounts` (JSONB avatar + participation_history), `children`, `ban_reports`
  - FastAPI + asyncpg + systemd (`parentaile-account.service`)
  - nginx + HTTPS Let's Encrypt
  - CRUD complet testé bout-en-bout (POST, GET, PUT, DELETE, batch, by-pseudo, children FK cascade)
  - Backup Postgres quotidien 03h15, rotation 30j (`/root/backups/postgres/`)
  - Couche React `src/lib/accountStorage.ts` avec feature flag `VITE_STORAGE_BACKEND=firebase|vps`
  - Env vars ajoutées : `VITE_STORAGE_BACKEND`, `VITE_ACCOUNT_API_URL`, `VITE_ACCOUNT_API_KEY`

**Optimisations Firebase (réduction coûts en attendant la migration) :**
- Auto-purge des notifications (max 10/catégorie) sur `parentNotifications` et `notifications` côté React
- Listener temps réel tokens remplacé par polling 60s côté MedCompanion

**Encore dans Firebase :**
- Firestore : `accounts`, `users`, `groupes`, `parentNotifications`, `banReports`, `tokens`, `messages`, `notifications`
- Cloud Functions : rappels vocaux, getLiveKitToken
- Storage : non utilisé activement (avatars déjà sur VPS)

> Note : bien que le service VPS `account-service` soit en ligne, les 13 fichiers React qui lisent/écrivent `accounts` passent **toujours par Firebase**. La bascule se fera en une seule fois pendant la fenêtre de maintenance, une fois l'ensemble des services VPS livrés (Phase 3 + 4) et la branche dev validée end-to-end.

**Prochaine étape :**
- Migrer progressivement les 13 fichiers consommateurs de `accounts` vers la couche `accountStorage` (sur dev)
- Puis Phase 3A (LiveKit token), 3B (notif), 3C (groupes)

---

## Phase 2 — Account Service (socle central) ✅ LIVRÉ 2026-04-12

> **Statut : infra + service en ligne, non branché en prod.**
> Le service répond en HTTPS sur `https://account.parentaile.fr` avec CRUD complet validé.
> La bascule `VITE_STORAGE_BACKEND=vps` sur la branche `main` se fera pendant la fenêtre de maintenance, une fois tous les services complémentaires livrés.

### Pourquoi commencer par là

`accounts` est le **centre de gravité** du système utilisateur. Tout tourne autour :
- Avatar (déjà migré sur avatar-service, pointe vers un UID account)
- Points et badges (extensions du compte)
- Participation aux groupes (liée à l'UID)
- Pseudo, email, profil (source de vérité)
- Notifications (destinataire = compte)

Faire ce service en premier évite de créer des silos : badges et participation deviennent de simples **extensions** du account-service au lieu de services séparés.

### Responsabilité

**Un service, une table principale (`accounts`) + tables liées.** Gère tout ce qui concerne l'identité utilisateur **à l'exception du blob avatar** (qui reste dans avatar-service) et de l'auth (qui reste dans Firebase Auth).

### Schéma PostgreSQL (v2 — appliqué en prod VPS)

Choix important : pour coller au format Firebase existant (et simplifier le script de migration one-shot), `avatar` et `participation_history` sont stockés en **JSONB** plutôt qu'en tables normalisées. Postgres indexe le JSONB via GIN et les perfs sont excellentes à cette échelle.

```sql
-- Comptes utilisateurs (fusion accounts + users Firebase)
accounts (
  uid                   TEXT PRIMARY KEY,       -- UID Firebase Auth
  email                 TEXT,
  pseudo                TEXT UNIQUE NOT NULL,
  avatar                JSONB,                  -- blob avatar (DiceBear config ou AI URL)
  avatar_gen_count      INTEGER NOT NULL DEFAULT 0,
  last_avatar_gen_date  TEXT,
  points                INTEGER NOT NULL DEFAULT 0,
  badge                 TEXT,
  participation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  fcm_token             TEXT,
  fcm_token_updated_at  TIMESTAMPTZ,
  role                  TEXT,                   -- NULL, ou 'hanene' (fusion ex-collection users)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_accounts_avatar ON accounts USING GIN (avatar);

-- Enfants liés (relation explicite parent → enfant)
children (
  parent_uid  TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  token_id    TEXT NOT NULL,
  nickname    TEXT NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_uid, token_id)
);

-- Signalements (modération)
ban_reports (
  id            SERIAL PRIMARY KEY,
  reporter_uid  TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  reported_uid  TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  reason        TEXT,
  groupe_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Endpoints (implémentés et testés)

```
# Profil
POST   /accounts                          → crée un compte
GET    /accounts/{uid}                    → lit un compte
PUT    /accounts/{uid}                    → met à jour un compte (patch partiel)
DELETE /accounts/{uid}                    → supprime (cascade sur children + ban_reports)
GET    /accounts/by-pseudo/{pseudo}       → recherche par pseudo
POST   /accounts/batch                    → lecture en lot (body: {uids: [...]})

# Enfants liés (tokens MedCompanion)
GET    /accounts/{uid}/children
POST   /accounts/{uid}/children
PUT    /accounts/{uid}/children/{tokenId}
DELETE /accounts/{uid}/children/{tokenId}

# Signalements (modération)
POST   /ban-reports
GET    /ban-reports

# Santé
GET    /health                            → {status, db, timestamp}
```

> Authentification : header `X-Api-Key` obligatoire sur tous les endpoints sauf `/health`.
> Les endpoints *points/badge/participation* ne sont pas encore des routes dédiées — pour l'instant le client patch directement les colonnes `points`, `badge`, `participation_history` via `PUT /accounts/{uid}`. Des routes dédiées pourront être ajoutées quand la logique serveur devient utile (anti-triche, audit).

### Plan de bascule (cut-over)

**Étape 1 — Infra + service VPS** ✅ fait
- PostgreSQL 16 + backup quotidien
- Schéma v2 appliqué
- `account-service` FastAPI déployé (systemd + nginx + HTTPS)
- Clé API dédiée générée
- CRUD validé bout-en-bout depuis le poste local

**Étape 2 — Couche React `accountStorage`** ✅ fait
- `src/lib/accountStorage.ts` — interface unique `getAccount`, `updateAccount`, `listChildren`
- Aiguillage automatique via `VITE_STORAGE_BACKEND` (firebase|vps)
- `window.__accountStorage` exposé en debug pour tests console

**Étape 3 — Migration progressive des 13 fichiers consommateurs** (en cours, branche dev)
- Remplacer les appels directs `doc(db, 'accounts', ...)` par des appels à `accountStorage.*`
- Ordre recommandé : `userContext.tsx` (lecture centrale) → `EspaceRegister` → `EspaceSettings` → `groupeParoleService` → le reste
- Les listeners `onSnapshot` sont remplacés par du polling (60s suffisent pour pseudo/points/avatar)

**Étape 4 — Fusion `users` → `accounts`**
- `RegisterForm.tsx` : supprimer le `setDoc(doc(db, "users", ...))`
- `LegalNotice.tsx` : lire `role` depuis `accounts` au lieu de `users`
- Après bascule : archiver puis supprimer la collection Firebase `users`

**Étape 5 — Fenêtre de maintenance (cut-over final)**
- Couvrir en même temps la bascule de TOUS les services VPS livrés à ce moment-là
- Script one-shot d'export Firebase `accounts` → Postgres `accounts` (+ `children`, `ban_reports`)
- Bascule `VITE_STORAGE_BACKEND=vps` sur main → build → déploiement
- Surveillance 72h

---

## Phase 3 — Services complémentaires (extensions et Cloud Functions)

> **Priorité : haute (après Phase 2 validée)**
> Une fois le socle `account-service` en place, ces services viennent se greffer.

### 3A. Service LiveKit Token VPS

**Responsabilité unique :** générer les tokens LiveKit pour rejoindre une salle vocale.

**Remplace :** Cloud Function `getLiveKitToken`

**Avantage :** le VPS héberge déjà LiveKit, la clé secrète est déjà en place. Service pur sans état, sans DB.

```
POST /livekit/token   → génère un token signé pour {uid, groupeId, isAnimateur}
```

**Validation et coupure Firebase :**
- Pas de collection Firestore impliquée — coupure immédiate après 7 jours sans incident
- Supprimer la Cloud Function `getLiveKitToken` une fois validé

---

### 3B. Service Notifications VPS (Parent'aile interne)

**Responsabilité unique :** déclencher les rappels de sessions vocales et gérer les notifications internes Parent'aile (`parentNotifications`).

**Remplace :** Cloud Function `sendVocalReminders` + Cloud Scheduler Firebase + collection `parentNotifications`

```
POST /notifications/vocal-reminder       → rappel 15min/5min avant session
POST /notifications/parent               → crée une notification parent
GET  /notifications/{uid}                → liste notifications d'un utilisateur
PUT  /notifications/{uid}/{id}/read      → marque comme lue
DELETE /notifications/{uid}/{id}         → supprime
```

**Déclenchement :** cron systemd sur VPS (remplace Cloud Scheduler)

**Validation et coupure Firebase :**
- Dual-write 7 jours sur `parentNotifications`
- Vérifier que toutes les notifications apparaissent bien côté utilisateur
- Couper `parentNotifications` Firebase → supprimer Cloud Function `sendVocalReminders` et Cloud Scheduler

---

### 3C. Groupes et sessions vocales

**Responsabilité :** gérer les groupes de parole et l'état des sessions vocales.

**Remplace :** collection `groupes` Firebase

```sql
groupes (
  id               TEXT PRIMARY KEY,
  titre            TEXT,
  description      TEXT,
  createur_uid     TEXT REFERENCES accounts(uid),
  date_session     TIMESTAMPTZ,
  statut           TEXT,            -- 'planifie' | 'en_cours' | 'termine'
  max_participants INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

groupe_inscriptions (
  groupe_id  TEXT REFERENCES groupes(id),
  uid        TEXT REFERENCES accounts(uid),
  inscrit_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (groupe_id, uid)
);

sessions (
  groupe_id      TEXT PRIMARY KEY REFERENCES groupes(id),
  phase_index    INTEGER,
  session_active BOOLEAN,
  started_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
```

**Hébergement :** peut vivre dans `account-service` (même base Postgres) OU être un service séparé. **Recommandation : même service** tant que la taille reste modérée — pas de microservice prématuré.

**Remplacement des listeners temps réel :**
- `onSnapshot` sur `groupes` → polling 10-30s côté React
- `onSnapshot` sur `sessions` (état vocal critique) → **WebSocket** VPS pour réactivité

---

## Migration des données Firestore → PostgreSQL

Pour chaque collection à migrer (accounts, groupes, parentNotifications, banReports) :

1. **Script one-shot d'export** Firestore → PostgreSQL
2. **Dual-write 7 jours** minimum par collection
3. **Script de comparaison** VPS vs Firebase avant coupure
4. **Coupure collection par collection** — jamais tout d'un coup
5. **Ordre recommandé** : `accounts` → `banReports` → `parentNotifications` → `groupes`

### Remplacement des listeners temps réel

`onSnapshot` Firestore remplacé par :
- **Polling léger** (10-30s) pour données non-critiques (notifications, profil, liste groupes)
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
│   ├── account.parentaile.fr   → :8001  (account-service)         [Phase 2]
│   ├── api.parentaile.fr       → :8002  (livekit + notif)         [Phase 3]
│   ├── bridge.parentaile.fr    → :8004  (bridge-service)          [Phase 4]
│   └── livekit.parentaile.fr   → :7880  (livekit) ✅
│
├── Services Python/FastAPI
│   ├── avatar-service    :8000  ✅ (Phase 1)
│   ├── account-service   :8001  (Phase 2 — socle central, Postgres)
│   │   ├── accounts (+ users fusionné)
│   │   ├── ban_reports
│   │   ├── participation_history
│   │   ├── groupes (+ inscriptions, sessions)
│   │   └── points/badges (extensions internes)
│   ├── livekit-service   :8002  (Phase 3A)
│   ├── notif-service     :8003  (Phase 3B — parentNotifications + cron)
│   └── bridge-service    :8004  (Phase 4 — tokens/messages/notifications MedCompanion)
│
├── PostgreSQL            :5432  (Phase 2)
│
└── Cron (systemd timers)
    └── vocal-reminders          (Phase 3B, remplace Cloud Scheduler Firebase)
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

| Etape | Service | Apps impactées | Impact coût | Complexité | Statut |
|-------|---------|----------------|-------------|------------|--------|
| 1 | Avatar service | Parent'aile | Faible | Faible | ✅ livré |
| 2 | Account service + PostgreSQL (socle) | Parent'aile | Très élevé | Elevé | ✅ livré 2026-04-12 (non branché) |
| 3A | LiveKit token service | Parent'aile | Moyen | Faible | ⏳ à faire |
| 3B | Notifications + cron vocal | Parent'aile | Elevé | Moyen | ⏳ à faire |
| 3C | Groupes + sessions vocales (dans account-service) | Parent'aile | Elevé | Moyen | ⏳ à faire |
| 4 | Bridge Service | MedCompanion + Parent'aile | Elevé | Elevé | ⏳ à faire |
| 5 | **Cut-over maintenance** (bascule `VITE_STORAGE_BACKEND=vps` + migration données) | Parent'aile | — | Moyen | ⏳ une fois 3 + 4 livrés |

**Changement stratégique important :** contrairement à une approche « commencer par le plus simple » (LiveKit token), on commence par le **socle central** (account-service + Postgres). Raison : tous les services suivants s'y greffent naturellement — les faire en premier reviendrait à construire des silos isolés qu'il faudrait ensuite relier. Le surcoût initial (installer Postgres) est compensé par le fait qu'il est ensuite utilisable immédiatement par toutes les phases suivantes.

---

## Règles de développement pour chaque service

1. **Un service = une responsabilité** — ne jamais mélanger les domaines métier
2. **Toujours des logs** — chaque service écrit dans `logs/service.log`
3. **Toujours des backups** — toute écriture crée une copie datée
4. **Clé API obligatoire** — aucun endpoint public sans authentification
5. **Dual-write = temporaire** — filet de sécurité de 7 jours maximum, jamais permanent. Une brique validée = code dual-write supprimé, Firebase coupé pour cette collection.
6. **Variable de bascule** — chaque service expose `STORAGE_BACKEND=vps|firebase` pour rollback d'urgence en 5 minutes sans redéploiement
7. **Tuple return pattern** — `(success, result, error)` pour cohérence avec MedCompanion (C#)
8. **Ne jamais bloquer les deux apps** — chaque étape déployable sans coordination simultanée, sauf Phase 4 (Bridge)
