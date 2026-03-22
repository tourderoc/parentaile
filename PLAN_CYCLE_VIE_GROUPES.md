# Plan : Cycle de vie complet des Groupes de Parole

## Contexte

Les groupes de parole fonctionnent (LiveKit vocal, phases, micro, évaluations) mais il manque toute la logique de robustesse : que se passe-t-il quand l'animateur ne vient pas ? Quand il quitte en cours de session ? Quand il n'y a plus assez de participants ? Quand le réseau coupe ? Ce plan couvre l'ensemble du cycle de vie pour rendre le système fiable et humain.

## Etat actuel du code

**Ce qui existe :**
- Session state Firestore (currentPhaseIndex, extendedMinutes, sessionActive, phaseStartedAt, sessionStartedAt)
- Presence system (subcollection `groupes/{id}/presence/{uid}`)
- Cloud Function cron `sendVocalReminders` (notifications 15min et 5min avant)
- Cloud Function `getLiveKitToken` (isAnimateur basé sur createurUid)
- Data channel LiveKit (raise_hand, give_word, kick, warn, chat)
- Evaluations post-session, points, badges
- Notifications in-app (parentNotificationService)

**Ce qui manque :**
- Suspension de session (animateur part, < 3 participants)
- Remplacement d'animateur
- Annulation automatique (< 3 inscrits à J-30min)
- Grâce réseau (30s avant de considérer un départ)
- Limites de sécurité (max 2 suspensions, max 1 remplacement)
- Champ `status` sur le groupe (scheduled/cancelled/in_progress/completed)

---

## Phase 1 : Data Model & Service Functions

**Fichiers :** `src/types/groupeParole.ts`, `src/lib/groupeParoleService.ts`, `src/lib/parentNotificationService.ts`

### 1A. Etendre SessionState (`src/types/groupeParole.ts`)

Ajouter au `SessionState` existant (ligne 151) :
```ts
suspended: boolean;
suspendedAt?: Date;
suspensionReason?: 'animateur_left' | 'below_minimum';
suspensionCount: number;          // max 2
replacementUsed: boolean;
currentAnimateurUid: string;
currentAnimateurPseudo: string;
```

Ajouter le type `GroupeStatus` et le champ `status` à `GroupeParole` :
```ts
export type GroupeStatus = 'scheduled' | 'cancelled' | 'in_progress' | 'completed';

// dans GroupeParole :
status?: GroupeStatus;  // default 'scheduled'
```

### 1B. Nouvelles fonctions service (`src/lib/groupeParoleService.ts`)

| Fonction | Rôle |
|----------|------|
| `cancelGroup(groupeId, reason)` | Met `status: 'cancelled'`, notifie tous les participants |
| `suspendSession(groupeId, reason)` | Met `suspended: true`, incrémente `suspensionCount`. Si count >= 2 → appelle `endSession` |
| `resumeSession(groupeId)` | Met `suspended: false`, clear suspendedAt/reason |
| `proposeAsAnimateur(groupeId, uid, pseudo)` | Transaction Firestore : vérifie `replacementUsed`, met à jour `currentAnimateurUid`. Retourne `boolean` |
| `initSessionStateV2(groupeId, animateurUid, pseudo)` | Comme `initSessionState` + populate `currentAnimateurUid`, `suspended: false`, `suspensionCount: 0`, `replacementUsed: false` |

`proposeAsAnimateur` utilise `runTransaction` pour garantir l'atomicité (premier arrivé, premier servi).

### 1C. Nouveau type notification (`src/lib/parentNotificationService.ts`)

Ajouter `'group_cancelled'` au type `ParentNotifType` et au `NOTIF_CONFIG` :
```ts
group_cancelled: { icon: '❌', color: 'text-red-600', bg: 'bg-red-50' }
```

### 1D. Modifier les notifications d'inscription (`src/lib/groupeParoleService.ts`)

Dans `rejoindreGroupe`, changer la logique : au lieu de notifier à chaque inscription, notifier uniquement aux jalons :
- **3 inscrits** : "3 inscrits — votre groupe aura lieu !" (seuil minimum atteint)
- **Complet** : "Votre groupe est complet !" (participantsMax atteint)

### 1E. Filtrer les groupes annulés (`src/lib/upcomingGroupContext.tsx`)

Dans `findUpcomingGroup` (ligne 53), ajouter :
```ts
if (g.status === 'cancelled') continue;
```

---

## Phase 2 : Cloud Functions (J-30min check + animateur dynamique)

**Fichier :** `functions/src/index.ts`

### 2A. Vérification viabilité à J-30min

Etendre `sendVocalReminders` pour couvrir la fenêtre J-30min. Ajouter une nouvelle tranche :
```
minutesLeft >= 28 && minutesLeft <= 32 → reminderType = '30min'
```

Logique pour `30min` :
- Si `participants.length < 3` → mettre `status: 'cancelled'` sur le doc, envoyer FCM "Votre groupe a été annulé (pas assez de participants)" + créer `parentNotification` type `group_cancelled`
- Si `participants.length >= 3` → envoyer FCM "Votre groupe commence dans 30 min"

### 2B. Mise à jour `getLiveKitToken`

Modifier la détermination de `isAnimateur` (ligne 206) pour prendre en compte le remplacement :
```ts
// Lire sessionState.currentAnimateurUid s'il existe
const sessionState = groupe.sessionState;
const isAnimateur = sessionState?.currentAnimateurUid
  ? sessionState.currentAnimateurUid === uid
  : groupe.createurUid === uid;
```

---

## Phase 3 : Hooks client (logique de suspension et remplacement)

**Nouveaux fichiers :** `src/hooks/useSessionSuspension.ts`, `src/hooks/useEffectiveAnimateur.ts`, `src/hooks/useAnimateurWait.ts`

### 3A. `useEffectiveAnimateur`

```ts
function useEffectiveAnimateur({ firestoreSession, createurUid, localUid })
→ { effectiveAnimateurUid, isEffectiveAnimateur, isReplacementAnimateur }
```
- Si `sessionState.currentAnimateurUid` existe → c'est l'animateur effectif
- Sinon → `createurUid`
- `isEffectiveAnimateur = effectiveAnimateurUid === localUid`

### 3B. `useAnimateurWait`

Logique au démarrage de la session (J=0, salle ouverte, animateur absent) :
```ts
function useAnimateurWait({ groupeId, liveKitParticipants, firestoreSession, createurUid, sessionStarted })
→ { waitingForAnimateur, waitCountdownSec, canPropose, timedOut }
```
- Vérifie si l'animateur est dans la liste des participants LiveKit
- Timer 3 minutes si absent
- Si l'animateur arrive pendant le timer → annule tout
- Si timeout → `timedOut = true`
- Si l'animateur arrive après timeout → rejoint comme participant simple

### 3C. `useSessionSuspension`

Logique en cours de session :
```ts
function useSessionSuspension({ groupeId, localUid, liveKitParticipants, firestoreSession, isEffectiveAnimateur })
→ { suspended, suspensionReason, countdownSec, canPropose, maxReached }
```
- Détecte le départ de l'animateur effectif (LiveKit `ParticipantDisconnected`)
- Délai de grâce 30 secondes (reconnexion réseau)
- Détecte < 3 participants (après grâce 30s)
- Double événement (animateur part ET < 3) → un seul timer, un seul compteur
- Timer 3 minutes de suspension
- Si `suspensionCount >= 2` après cette suspension → fin automatique
- Si `replacementUsed` et l'animateur de remplacement part → fin automatique

---

## Phase 4 : Composants UI

**Nouveaux fichiers :** `src/components/vocal/SuspensionOverlay.tsx`, `src/components/vocal/AnimateurWaitOverlay.tsx`, `src/components/vocal/CancellationScreen.tsx`

### 4A. `SuspensionOverlay`

Overlay plein écran pendant la suspension :
- Raison affichée en texte humain ("L'animateur a quitté la salle" / "Pas assez de participants")
- Décompte 3 minutes (cercle animé)
- Bouton "Guider la discussion en attendant" (pas "devenir animateur")
- Texte rassurant : "Pas besoin d'expérience, lancez juste la conversation"
- Compteur "Suspension 1/2"
- Si mode structuré et remplacement → passage automatique en mode libre (moins de pression)
- Les micros restent ouverts entre les participants restants pendant la suspension

### 4B. `AnimateurWaitOverlay`

Overlay au démarrage quand l'animateur est absent :
- "En attente de l'animateur..."
- Décompte 3 minutes
- Bouton proposition
- Après timeout : "La session est annulée" + bouton retour

### 4C. `CancellationScreen`

Ecran affiché quand un groupe est annulé :
- Raison de l'annulation
- Suggestion d'alternatives : 1-2 groupes avec thème similaire (via `onGroupesParole`)
- Si l'utilisateur était animateur : bouton "Reprogrammer" (pré-remplit le même thème)
- Bouton retour vers Mon Espace

---

## Phase 5 : Intégration dans SalleVocalePage

**Fichier :** `src/screens/Espace/SalleVocalePage.tsx`

### 5A. Remplacer `isAnimateur` par `useEffectiveAnimateur`

Partout dans `RoomContent` :
- Les contrôles de modération (couronne, ModeratorSheet, phase controls) utilisent `isEffectiveAnimateur`
- L'`isAnimateur` du token LiveKit reste pour le "rôle original" uniquement

### 5B. Intégrer `useAnimateurWait` dans le flux waiting → room

Après le countdown à 0 :
- Si animateur présent → entrer en salle normalement
- Si animateur absent → afficher `AnimateurWaitOverlay`
- Si `timedOut` → appeler `cancelGroup` + afficher `CancellationScreen`

### 5C. Intégrer `useSessionSuspension` dans `RoomContent`

- Render `SuspensionOverlay` quand `suspended === true`
- L'overlay se superpose au contenu de la salle (ne pas déconnecter LiveKit)
- Quand la suspension se termine (reprise ou fin) → retirer l'overlay ou naviguer vers fin

### 5D. Vérifier `status` du groupe à l'entrée

Au chargement de `SalleVocalePage`, si `status === 'cancelled'` → afficher `CancellationScreen` directement (ne pas entrer dans le flux charte/waiting).

### 5E. Appeler `initSessionStateV2` au lieu de `initSessionState`

Quand l'animateur entre dans la salle, utiliser la nouvelle version qui initialise aussi `currentAnimateurUid`.

---

## Phase 6 : Améliorations salle d'attente

**Fichiers :** `src/screens/Espace/SalleVocalePage.tsx`, `src/lib/groupeParoleService.ts`

### 6A. Nouvelle fonction `onPresenceList`

```ts
export function onPresenceList(groupeId, callback: (presences: {uid, pseudo, mood}[]) => void)
```
Retourne la liste complète des présences (pas juste le count).

### 6B. Affichage avatars dans la salle d'attente

- Petits cercles avec avatars/initiales pour chaque parent présent
- Distinction visuelle "X/Y présents dans la salle" vs "Y inscrits au total"
- Texte rassurant : "Vous êtes au bon endroit. La session commencera bientôt."

---

## Ordre d'implémentation

```
Phase 1 (types + services)
  ↓
Phase 2 (Cloud Functions)      ← peut être fait en parallèle avec Phase 3
  ↓
Phase 3 (hooks client)
  ↓
Phase 4 (composants UI)
  ↓
Phase 5 (intégration SalleVocalePage)
  ↓
Phase 6 (améliorations salle d'attente)
```

## Fichiers touchés — Résumé

| Fichier | Action |
|---------|--------|
| `src/types/groupeParole.ts` | Modifier : étendre SessionState, ajouter GroupeStatus |
| `src/lib/groupeParoleService.ts` | Modifier : 6 nouvelles fonctions, modifier rejoindreGroupe (notifs jalons) |
| `src/lib/parentNotificationService.ts` | Modifier : ajouter type group_cancelled |
| `src/lib/upcomingGroupContext.tsx` | Modifier : filtrer status cancelled |
| `functions/src/index.ts` | Modifier : J-30min check + isAnimateur dynamique |
| `src/hooks/useEffectiveAnimateur.ts` | Créer |
| `src/hooks/useAnimateurWait.ts` | Créer |
| `src/hooks/useSessionSuspension.ts` | Créer |
| `src/components/vocal/SuspensionOverlay.tsx` | Créer |
| `src/components/vocal/AnimateurWaitOverlay.tsx` | Créer |
| `src/components/vocal/CancellationScreen.tsx` | Créer |
| `src/screens/Espace/SalleVocalePage.tsx` | Modifier : intégrer hooks + overlays + effectiveAnimateur |

## Règles de sécurité

| Règle | Valeur |
|-------|--------|
| Timer suspension | 3 minutes |
| Timer attente animateur au démarrage | 3 minutes |
| Grâce réseau (reconnexion) | 30 secondes |
| Max suspensions par session | 2 |
| Max remplacements animateur par session | 1 |
| Seuil minimum participants | 3 |
| Vérification viabilité | J-30min (Cloud Function) |

## Vérification

1. `npx tsc --noEmit` → 0 erreurs
2. `npx vite build` → build OK
3. `firebase deploy --only functions` → deploy OK
4. Tests fonctionnels :
   - Créer un groupe avec < 3 inscrits → annulation à J-30min
   - Groupe avec >= 3 → notification "commence bientôt"
   - Animateur absent au démarrage → overlay 3min → proposition remplacement
   - Accepter remplacement → nouveau animateur voit les contrôles
   - Animateur original arrive après remplacement → rejoint comme participant
   - Animateur quitte en cours → suspension 3min → proposition remplacement
   - 2 suspensions → fin automatique à la 3ème
   - Participant perd réseau 10s → pas de départ (grâce 30s)
   - < 3 participants en cours → suspension → retour d'un participant → reprise
   - Groupe annulé → écran avec suggestions d'alternatives
