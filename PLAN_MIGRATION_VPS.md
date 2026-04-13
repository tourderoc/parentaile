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

**Remplace :** collection `groupes` Firebase + 4 Cloud Functions Firebase

**Hébergement :** dans `account-service` (même base Postgres, même port 8001) — pas de microservice prématuré.

> **Contrainte importante découverte (2026-04-13) :** les 4 Cloud Functions Firebase dépendent toutes de `groupes`. Deux d'entre elles (`manageVocalTasks`, `cleanupCancelledGroup`) sont des **triggers Firestore** — elles cessent de fonctionner dès que `groupes` quitte Firestore. Elles doivent donc être remplacées côté VPS **en même temps** que la migration de la collection. Les deux autres (`getLiveKitToken`, `handleVocalReminder`) sont des fonctions HTTP qui peuvent temporairement rester sur Firebase en lisant depuis le VPS (Phase A), puis migrer proprement ensuite (Phase B).

---

#### Phase A — Migration atomique (le vrai chantier)

> Tout doit être livré et validé sur `dev` avant le cut-over. La bascule se fait en une seule fenêtre de maintenance.

##### 1. Schéma PostgreSQL (dans la DB `account_db` existante)

```sql
-- Groupe de parole
CREATE TABLE groupes (
  id                    TEXT PRIMARY KEY,
  titre                 TEXT NOT NULL,
  description           TEXT,
  theme                 TEXT,
  createur_uid          TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  createur_pseudo       TEXT,
  date_vocal            TIMESTAMPTZ,
  date_expiration       TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'scheduled',
    -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'reprogrammed'
  cancel_reason         TEXT,
  reprogrammed_from_id  TEXT REFERENCES groupes(id),
  reprogrammed_to_id    TEXT REFERENCES groupes(id),
  structure_type        TEXT DEFAULT 'libre',  -- 'libre' | 'structuree'
  structure             JSONB DEFAULT '[]',    -- étapes structurées
  participants          JSONB DEFAULT '[]',    -- [{uid, pseudo, inscritVocal, dateInscription, banni?}]
  participants_max      INTEGER DEFAULT 5,
  message_count         INTEGER DEFAULT 0,
  session_state         JSONB DEFAULT NULL,    -- état temps réel de la session vocale
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Messages du forum de groupe
CREATE TABLE groupe_messages (
  id            TEXT PRIMARY KEY,
  groupe_id     TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
  auteur_uid    TEXT NOT NULL,
  auteur_pseudo TEXT NOT NULL,
  contenu       TEXT NOT NULL,
  date_envoi    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_groupe_messages_groupe ON groupe_messages(groupe_id, date_envoi);

-- Évaluations post-session
CREATE TABLE groupe_evaluations (
  groupe_id        TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
  participant_uid  TEXT NOT NULL,
  note_ambiance    INTEGER,
  note_animateur   INTEGER,
  signalement      BOOLEAN DEFAULT FALSE,
  status           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (groupe_id, participant_uid)
);

-- Sorties de participants (compteur de ban)
CREATE TABLE participant_exits (
  groupe_id    TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
  uid          TEXT NOT NULL,
  exit_count   INTEGER DEFAULT 0,
  last_exit_at TIMESTAMPTZ,
  banned       BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (groupe_id, uid)
);

-- Déduplication des rappels envoyés
CREATE TABLE groupe_reminders_sent (
  groupe_id     TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,  -- '30min' | '15min' | '5min'
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (groupe_id, reminder_type)
);
```

##### 2. Endpoints VPS (dans account-service)

```
# Groupes
POST   /groupes                              → créer un groupe
GET    /groupes                              → lister (filtres: dateVocal, status, uid)
GET    /groupes/{id}                         → lire un groupe
PUT    /groupes/{id}                         → mettre à jour (patch partiel)
DELETE /groupes/{id}                         → supprimer + cascade sous-tables

# Participants
POST   /groupes/{id}/join                    → rejoindre un groupe
POST   /groupes/{id}/leave                   → quitter un groupe
PUT    /groupes/{id}/participants/{uid}/ban  → bannir un participant

# Session vocale (état temps réel)
PUT    /groupes/{id}/session                 → mettre à jour sessionState (phase, animateur, suspension...)
DELETE /groupes/{id}/session                 → terminer la session

# Messages forum
GET    /groupes/{id}/messages                → lister les messages
POST   /groupes/{id}/messages                → poster un message
DELETE /groupes/{id}/messages/{msgId}        → supprimer un message

# Évaluations
POST   /groupes/{id}/evaluations             → soumettre une évaluation
GET    /groupes/{id}/evaluations             → lire les évaluations (animateur)

# Sorties (gestion ban auto)
POST   /groupes/{id}/exits/{uid}             → enregistrer une sortie (incrémente compteur, ban auto à 3)
GET    /groupes/{id}/exits/{uid}             → vérifier si banni
```

##### 3. Remplacement des triggers Firebase → logique VPS

**`manageVocalTasks` (trigger onWrite) → cron systemd VPS**

Le trigger Firebase planifiait des Cloud Tasks (Google) 30/15/5 min avant le vocal. Sur VPS, un cron systemd tourne toutes les **5 minutes** et fait le même travail :

```
Cron toutes les 5 min :
  SELECT groupes WHERE status = 'scheduled'
    AND date_vocal BETWEEN NOW() + INTERVAL '5 min' AND NOW() + INTERVAL '35 min'
  Pour chaque groupe trouvé :
    Vérifier groupe_reminders_sent → quels types pas encore envoyés
    Si date_vocal - NOW() ≤ 30min ET '30min' pas envoyé → envoyer rappel 30min
    Si date_vocal - NOW() ≤ 15min ET '15min' pas envoyé → envoyer rappel 15min
    Si date_vocal - NOW() ≤  5min ET '5min'  pas envoyé → envoyer rappel 5min
    Insérer dans groupe_reminders_sent pour déduplication
```

**`cleanupCancelledGroup` (trigger onUpdate) → logique dans l'endpoint PUT /groupes/{id}**

Quand un groupe passe en status `cancelled`, l'endpoint VPS déclenche directement le nettoyage synchrone :
- Si moins de 3 participants ET aucun message → suppression complète (cascade)
- Sinon → marqué `cancelled`, conservé pour archivage

##### 4. Remplacement des listeners `onSnapshot` React

| Usage actuel | Remplacement VPS |
|---|---|
| `onSnapshot` liste groupes (accueil) | Polling 30s → `GET /groupes?status=scheduled` |
| `onSnapshot` détail groupe (inscription) | Polling 15s → `GET /groupes/{id}` |
| `onSnapshot` messages forum | Polling 10s → `GET /groupes/{id}/messages` |
| `onSnapshot` sessionState (pendant vocal) | **Polling 5s** → `GET /groupes/{id}` (champ session_state) |
| `onSnapshot` évaluations | Polling 30s → `GET /groupes/{id}/evaluations` |

> Note sur le temps réel vocal : le polling 5s est acceptable pour une V1 bêta à 150 utilisateurs. Un WebSocket peut être ajouté plus tard si la réactivité devient insuffisante.

##### 5. Modifications Cloud Functions Firebase (temporaires — Phase A)

Ces deux fonctions HTTP restent sur Firebase mais lisent depuis le VPS au lieu de Firestore :

**`getLiveKitToken`** — remplacer les lectures Firestore par des appels HTTP VPS :
- `GET /groupes/{id}` pour vérifier inscription, fenêtre horaire, statut animateur
- `GET /groupes/{id}/exits/{uid}` pour vérifier le ban
- La génération du token JWT reste inchangée

**`handleVocalReminder`** — remplacer les lectures Firestore par des appels HTTP VPS :
- `GET /groupes/{id}` pour lire participants et dateVocal
- `PUT /groupes/{id}` pour passer en `cancelled` si < 3 participants
- L'envoi FCM reste inchangé

##### 6. Fichiers React à migrer (10 fichiers)

| Fichier | Operations |
|---------|------------|
| `lib/groupeParoleService.ts` | CRUD complet + listeners → remplacer tout par appels VPS |
| `screens/Espace/SalleVocalePage.tsx` | onSnapshot sessionState → polling 5s |
| `screens/Espace/MesGroupesPage.tsx` | listener groupe + ratings → polling |
| `screens/Espace/GroupeDetailPage.tsx` | via groupeParoleService |
| `screens/Espace/MesMessagesPage.tsx` | via groupeParoleService |
| `screens/Espace/slides/CreateGroupeParole.tsx` | création groupe → POST /groupes |
| `lib/upcomingGroupContext.tsx` | listener liste groupes → polling |
| `vocal/hooks/useParticipantTracker.ts` | participantExits + participants array → VPS |
| `lib/pushNotifications.ts` | référence groupes → adapter |
| `lib/liveKitService.ts` | inchangé en Phase A (appelle toujours Firebase Cloud Function) |

##### 7. Script de migration des données

```
Migration one-shot Firestore → PostgreSQL :
  1. Export collection groupes (+ sous-collections) → JSON
  2. Transform : Timestamp Firebase → TIMESTAMPTZ, participants array → JSONB
  3. INSERT INTO groupes ...
  4. INSERT INTO groupe_messages ... (depuis sous-collection messages)
  5. INSERT INTO groupe_evaluations ... (depuis sous-collection evaluations)
  6. INSERT INTO participant_exits ... (depuis sous-collection participantExits)
  7. Diff de contrôle : comparer counts Firestore vs Postgres
```

##### 8. Cut-over (fenêtre de maintenance)

```
1. Page maintenance affichée
2. Script migration one-shot Firestore → Postgres
3. Diff de contrôle
4. Déployer cron systemd vocal-reminders sur VPS
5. Bascule React : VITE_GROUPES_BACKEND=vps sur main → build → déploiement
6. Mettre à jour getLiveKitToken et handleVocalReminder sur Firebase (lecture VPS)
7. Retirer page maintenance
8. Surveillance 48h
```

---

#### Phase B — Migration Cloud Functions Firebase → VPS (après validation Phase A)

> Prérequis : Phase A validée depuis au moins 7 jours sans incident.

**`getLiveKitToken` → endpoint VPS dans account-service**

```
POST /livekit/token
  Body : { groupeId, pseudo?, mood?, password? }
  Header : Authorization: Bearer {Firebase ID token}
  
  Vérifications :
    1. Valider le Firebase ID token → extraire uid
    2. GET /groupes/{groupeId} → vérifier inscription, fenêtre horaire, ban
    3. Générer JWT LiveKit (même logique qu'aujourd'hui)
    4. Retourner { token, roomName, wsUrl, isAnimateur, pseudo }
```

**`handleVocalReminder` → absorbé par le cron systemd vocal-reminders**

Le cron VPS gère déjà les rappels (30/15/5 min). Il intègre aussi la logique d'annulation automatique (< 3 participants) qui était dans `handleVocalReminder`. Cette fonction Firebase devient inutile.

**`manageVocalTasks` et `cleanupCancelledGroup` → déjà supprimés en Phase A**

**Résultat final Phase B :**
- 0 Cloud Functions Firebase actives
- 0 Firestore collections actives (sauf Auth et FCM conservés à vie)
- Coût Firebase réduit au minimum fixe (Auth gratuit + FCM gratuit)

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
| 3C-A | **Groupes — Phase A** : collection Firestore → Postgres + remplacement triggers Firebase + React migré + Cloud Functions getLiveKitToken/handleVocalReminder branchées sur VPS temporairement | Parent'aile | Très élevé | Elevé | ⏳ à faire |
| 3C-B | **Groupes — Phase B** : getLiveKitToken → VPS, handleVocalReminder absorbée par cron, suppression toutes Cloud Functions Firebase | Parent'aile | Elevé | Faible | ⏳ après 7j validation 3C-A |
| 3B | Notifications VPS (parentNotifications + cron vocal) | Parent'aile | Elevé | Moyen | ⏳ après 3C |
| 4 | Bridge Service (tokens + messages + notifications MedCompanion) | MedCompanion + Parent'aile | Elevé | Elevé | ⏳ à faire |
| 5 | **Cut-over maintenance global** (bascule `VITE_STORAGE_BACKEND=vps` accounts + groupes + migration données one-shot) | Parent'aile | — | Moyen | ⏳ une fois 3 + 4 livrés |

> **Pourquoi 3C avant 3B :** les Cloud Functions Firebase (rappels vocaux) dépendent de `groupes`. Migrer `groupes` en premier (3C) permet ensuite de migrer les Cloud Functions de rappel proprement dans la Phase B, sans avoir à les toucher deux fois.

> **3A (LiveKit token) absorbé dans 3C-B :** le service LiveKit token est la dernière Cloud Function Firebase à migrer. Il n'a plus de raison d'être un chantier séparé puisqu'il sera migré naturellement quand `groupes` est sur VPS.

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
