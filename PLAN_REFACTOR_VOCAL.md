# Plan de refactoring — Cycle de vie des Groupes Vocaux

## Contexte

La logique actuelle du cycle de vie des groupes vocaux (groupe de parole) est devenue chaotique :
- SalleVocalePage fait 3900 lignes
- 3 hooks dupliquent la même logique avec des constantes différentes
- 15+ endroits modifient le step/état sans cohérence
- Race conditions entre listeners Firestore
- Pas de machine à états, transitions implicites dans des useEffect
- Aucune protection contre les sorties répétées d'un participant

Ce plan restructure **tout** le cycle autour d'une machine à états simple et déterministe.

---

## Architecture cible

### Machine à états — 6 phases

```
WAITING_ROOM → (heure H) → check instantané
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
            ≥3 + anim      <3 only      ≥3, no anim
                 │              │              │
                 ▼              ▼              ▼
          SESSION_ACTIVE   COUNTDOWN      COUNTDOWN
                 │          _START         _START
                 │         (below)       (no_anim)
                 │              │              │
              problème     résolu/expire  résolu/expire
                 │              │              │
                 ▼              ▼              ▼
           GRACE_PERIOD    ACTIVE ou     ACTIVE ou
            (30s, caché)   CANCELLED     propose/CANCEL
                 │
             expire
                 ▼
            SUSPENDED
           (3min visible)
                 │
          résolu/expire
                 ▼
         ACTIVE ou CANCELLED
```

### Les 6 phases exposées + 1 interne

| Phase | Description | Visible UI | Écrit Firestore |
|-------|-------------|------------|-----------------|
| `WAITING_ROOM` | Salle d'attente, T-15min → T | Oui | Non |
| `COUNTDOWN_START` | Session jamais démarrée, attente 3min | Oui (overlay) | Non (status reste scheduled) |
| `SESSION_ACTIVE` | Session en cours, tout va bien | Oui | Oui (sessionActive=true) |
| `GRACE_PERIOD` | 30s grâce réseau | **Non** (masqué, UI = SESSION_ACTIVE) | **Non** |
| `SUSPENDED` | Session interrompue, countdown 3min | Oui (overlay plein écran) | Oui (suspended=true) |
| `SESSION_CANCELLED` | Terminal — annulé | Oui (écran annulation) | Oui (status=cancelled) |
| `SESSION_ENDED` | Terminal — terminé normalement | Oui (écran fin/évaluation) | Oui (status=completed) |

### Source de vérité

| Donnée | Source autoritaire | Les autres sources |
|--------|-------------------|-------------------|
| Qui est connecté NOW | **LiveKit** (participants[]) | Ignorées |
| Qui est inscrit | **Firestore** (participants[]) | Lecture seule |
| Phase actuelle | **Machine locale** (useVocalMachine) | Écrit vers Firestore |
| Compteurs persistants (suspensionCount, exitCount) | **Firestore** | Lus par la machine |
| Animateur effectif | **Firestore** (currentAnimateurUid) | Lu par la machine |

### Constantes centralisées

```typescript
export const VOCAL_CONFIG = {
  GRACE_PERIOD_SEC: 30,
  COUNTDOWN_SEC: 180,
  MIN_PARTICIPANTS: 3,
  MAX_SUSPENSIONS: 2,
  MAX_PARTICIPANT_EXITS: 2,
  PROPOSE_AFTER_SEC: 60,
} as const;
```

---

## Schéma Firestore cible

### Document : `groupes/{groupeId}`

```
{
  // Métadonnées (inchangé)
  titre, description, theme, dateVocal, participantsMax,
  createurUid, createurPseudo, isTestGroup, passwordVocal,
  structureType, structure, participants[], messageCount,

  // Statut
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
  cancelReason?: string,

  // État session
  sessionState: {
    sessionActive: boolean,
    sessionStartedAt?: Timestamp,
    currentPhaseIndex: number,
    phaseStartedAt?: Timestamp,
    extendedMinutes: number,
    currentAnimateurUid: string,
    currentAnimateurPseudo: string,
    replacementUsed: boolean,
    suspended: boolean,
    suspendedAt?: Timestamp,
    suspensionReason?: 'animateur_left' | 'below_minimum',
    suspensionCount: number,
    animateurDisconnectCount: number,
  }
}
```

### Sous-collection NOUVELLE : `groupes/{groupeId}/participantExits/{uid}`

```
{
  count: number,
  lastExitAt: Timestamp,
  banned: boolean,
}
```

### Sous-collections existantes (inchangées)

- `groupes/{groupeId}/presence/{uid}` — présence salle d'attente
- `groupes/{groupeId}/evaluations/{uid}` — évaluations post-session
- `groupes/{groupeId}/notifications_sent/{id}` — déduplication notifications

---

## Clarifications importantes

### Pas d'état "propose" séparé

Le bouton "Je prends le relais" apparaît **pendant** COUNTDOWN_START (si reason=no_animateur) ou **pendant** SUSPENDED (si reason=animateur_left), dès que `canPropose=true` (après PROPOSE_AFTER_SEC=60s).

Si personne ne clique avant l'expiration du countdown de 3 min → **SESSION_CANCELLED**. Pas d'état intermédiaire, pas de timer supplémentaire. Le countdown de 3 min EST le timeout de remplacement.

### Logger intégré dès le départ

Chaque transition de la machine logge automatiquement :
```
[VOCAL_MACHINE] SESSION_ACTIVE → GRACE_PERIOD | event: CONDITIONS_CHANGED | count: 2 | reason: below_minimum
[VOCAL_MACHINE] GRACE_PERIOD → SUSPENDED | event: GRACE_EXPIRED | suspensionCount: 1
[VOCAL_MACHINE] SUSPENDED → SESSION_CANCELLED | event: COUNTDOWN_EXPIRED | reason: below_minimum
```

Ce logger est implémenté dans `transitions.ts` (étape 1), pas ajouté après coup.

---

## Étapes d'implémentation

### Étape 1 — Machine à états pure (pas de React, pas de Firebase)

**Fichiers créés :**
- `src/vocal/machine/types.ts`
- `src/vocal/machine/transitions.ts`

**Contenu :**
- Définition des types : `VocalPhase`, `VocalEvent`, `VocalContext`, `VocalState`, `SideEffect`
- Fonction pure `transition(state, event) → { state, sideEffects[] }`
- Table de transitions exhaustive
- Triple garde terminale (SESSION_CANCELLED et SESSION_ENDED ignorent tout)
- Logs structurés à chaque transition

**Événements :**
```
HOUR_REACHED
CONDITIONS_CHANGED { count, animateurPresent }
GRACE_EXPIRED
COUNTDOWN_TICK { remaining }
COUNTDOWN_EXPIRED
REPLACEMENT_PROPOSED { uid, pseudo }   // Participant clique "Je prends le relais" → bouton grisé
REPLACEMENT_ACCEPTED { uid, pseudo }   // Transaction Firestore réussie → SESSION_ACTIVE
REPLACEMENT_FAILED { reason }          // Transaction échouée → reste SUSPENDED, toast erreur
ANIMATEUR_END_SESSION
PARTICIPANT_BANNED { uid }
FIRESTORE_SYNC { suspended, suspensionCount, currentAnimateurUid }
```

**Critère de validation :**
- Peut être testé unitairement sans React ni Firebase
- Chaque scénario des 14 cas de test passable en pur TypeScript

**Durée estimée : fichier ~200 lignes**

---

### Étape 2 — Timer manager

**Fichier créé :**
- `src/vocal/machine/timers.ts`

**Contenu :**
- Classe `TimerManager` avec 3 slots : `grace`, `countdown`, `startCheck`
- `start(slot, durationMs, onTick?, onExpire)` — démarre un timer (annule le précédent sur ce slot)
- `cancel(slot)` — annule un timer spécifique
- `cancelAll()` — nettoyage au unmount
- `isActive(slot)` — vérification

**Critère de validation :**
- Un seul timer actif par slot
- Pas de fuite mémoire (cancelAll au unmount)
- onTick appelé toutes les secondes pour le countdown

**Durée estimée : fichier ~60 lignes**

---

### Étape 3 — useParticipantTracker (bridge LiveKit → événements)

**Fichier créé :**
- `src/vocal/hooks/useParticipantTracker.ts`

**Contenu :**
- Reçoit `liveKitParticipants[]` et `effectiveAnimateurUid` en input
- Calcule : `participantCount`, `animateurPresent`, `belowMinimum`
- Gère la grâce individuelle par participant (30s avant de compter une sortie)
- Track les `exitCount` par participant
- Dispatch `CONDITIONS_CHANGED` et `PARTICIPANT_BANNED` vers la machine

**Définition d'une "sortie" :**
- Absence LiveKit > 30s consécutives = 1 sortie
- Retour < 30s = pas comptée (grâce réseau)
- Sortie confirmée → incrément Firestore `participantExits/{uid}.count`
- count > 2 → `banned: true`, événement PARTICIPANT_BANNED

**Critère de validation :**
- Un décrochage réseau de 10s ne compte pas comme sortie
- Un départ volontaire (> 30s) est bien compté
- Après 2 sorties confirmées, le participant est banni

**Durée estimée : fichier ~120 lignes**

---

### Étape 4 — useVocalMachine (hook central)

**Fichier créé :**
- `src/vocal/hooks/useVocalMachine.ts`

**Contenu :**
- Orchestrateur central — LE SEUL hook que SalleVocalePage utilise
- Instancie la machine à états (étape 1) + TimerManager (étape 2) + ParticipantTracker (étape 3)
- Lit le Firestore sessionState (listener onSnapshot)
- Gère le dispatch d'événements
- Exécute les side effects (appels Firebase : suspendSession, resumeSession, cancelGroup, etc.)
- Expose l'interface simplifiée pour l'UI :

```typescript
interface VocalMachineOutput {
  // Phase affichable (GRACE_PERIOD masqué en SESSION_ACTIVE)
  phase: DisplayPhase;

  // Contexte
  reason?: 'below_minimum' | 'animateur_left';
  countdownSec: number;
  canPropose: boolean;
  isProposing: boolean;
  suspensionCount: number;
  sessionEverStarted: boolean;

  // Animateur
  effectiveAnimateurUid: string;
  isEffectiveAnimateur: boolean;

  // Actions
  dispatch: (event: VocalEvent) => void;
  proposeAsReplacement: () => void;
  endSession: () => void;
}
```

**Critère de validation :**
- Remplace useAnimateurWait + useSessionSuspension + useEffectiveAnimateur
- Un seul point d'entrée pour toute la logique lifecycle
- Les états terminaux sont inécrasables (triple garde)
- Les timers sont nettoyés au unmount

**Durée estimée : fichier ~250 lignes**

---

### Étape 5 — Nettoyage groupeParoleService.ts

**Fichier modifié :**
- `src/lib/groupeParoleService.ts`

**Actions :**
- Supprimer `initSessionState()` (legacy, remplacé par V2)
- Ajouter `incrementParticipantExit(groupeId, uid)` — Firestore transaction sur participantExits
- Ajouter `isParticipantBanned(groupeId, uid)` — lecture rapide du flag banned
- Ajouter garde terminale dans : `suspendSession`, `resumeSession`, `cancelGroup`, `endSession`, `proposeAsAnimateur`
- Nettoyage des imports inutilisés

**Critère de validation :**
- Aucune fonction n'écrit sur un groupe status=cancelled ou completed
- incrementParticipantExit est atomique (transaction)
- Les fonctions existantes (CRUD, messages, évaluations, points) ne sont PAS touchées

**Durée estimée : modifications ~50 lignes**

---

### Étape 6 — Mise à jour Cloud Function getLiveKitToken

**Fichier modifié :**
- `functions/src/index.ts`

**Actions :**
- Ajouter vérification `participantExits/{uid}.banned` avant de générer un token
- Si banni → throw HttpsError('permission-denied')
- Défense en profondeur (le ban primaire est côté client, ceci est le filet)

**Critère de validation :**
- Un participant banni ne peut plus obtenir de token
- Les participants normaux ne sont pas affectés

**Durée estimée : +15 lignes**

---

### Étape 7 — Adaptation overlays UI

**Fichiers modifiés :**
- `src/components/vocal/SuspensionOverlay.tsx`
- `src/components/vocal/AnimateurWaitOverlay.tsx`

**Actions :**
- Simplifier les props (la machine décide de tout, les overlays n'ont plus de logique)
- AnimateurWaitOverlay → renommé `CountdownOverlay` (utilisé pour COUNTDOWN_START)
- SuspensionOverlay → simplifié (reçoit reason, countdown, canPropose, c'est tout)
- Supprimer les props `belowMinimum` et `forceReplacement` — la machine fournit directement le bon titre/message

**Nouveaux props unifiés :**
```typescript
// CountdownOverlay (ex-AnimateurWaitOverlay)
interface Props {
  title: string;
  subtitle: string;
  countdownSec: number;
  variant: 'info' | 'warning' | 'danger';
  action?: { label: string; onClick: () => void; loading?: boolean };
}

// SuspensionOverlay
interface Props {
  title: string;
  subtitle: string;
  countdownSec: number;
  suspensionCount: number;
  variant: 'warning' | 'danger';
  action?: { label: string; onClick: () => void; loading?: boolean };
}
```

**Critère de validation :**
- Aucune logique métier dans les composants
- Tout est passé en props par la machine

**Durée estimée : modifications ~40 lignes chaque**

---

### Étape 8 — Refactor SalleVocalePage

**Fichier modifié :**
- `src/screens/Espace/SalleVocalePage.tsx`

**Actions :**
- Supprimer les imports de useAnimateurWait, useSessionSuspension, useEffectiveAnimateur
- Remplacer par un seul `useVocalMachine(groupeId)`
- Supprimer les 15+ setStep() dispersés
- Supprimer les callbacks inline onTimedOut, onSuspend, onResume, onAutoEnd
- Supprimer les hacks `setStep(prev => prev === 'cancelled' ? prev : 'end')`
- Supprimer les duplications `belowMinimum` (5 endroits → 0)
- Le switch principal devient :

```tsx
const { phase, reason, countdownSec, canPropose, ... } = useVocalMachine(groupeId);

switch (phase) {
  case 'WAITING_ROOM':     return <WaitingRoom ... />;
  case 'COUNTDOWN_START':  return <Room><CountdownOverlay ... /></Room>;
  case 'SESSION_ACTIVE':   return <Room />;
  case 'SUSPENDED':        return <Room><SuspensionOverlay ... /></Room>;
  case 'SESSION_CANCELLED': return <CancellationScreen ... />;
  case 'SESSION_ENDED':    return <EndScreen ... />;
}
```

- La partie UI de la salle (cercle participants, chat, modération, phases) reste dans le même fichier pour l'instant — on ne refactore QUE la logique lifecycle

**Ce qui est supprimé de SalleVocalePage :**
- ~300 lignes de logique de suspension/attente/countdown
- ~100 lignes de callbacks et race condition hacks
- ~50 lignes de calculs belowMinimum dupliqués

**Ce qui reste :**
- UI du cercle de participants
- Chat
- Modération
- Gestion des phases
- Entrée en salle (charte, mood, connexion LiveKit)

**Estimation après refactor : ~3200 lignes (de 3900)**
(Le gros gain viendra d'une future extraction UI, hors scope de ce refactor)

**Critère de validation :**
- Aucun setStep() direct nulle part (tout passe par dispatch)
- Aucune logique de décision lifecycle dans le composant
- Les overlays s'affichent correctement selon la phase

**Durée estimée : modifications nettes -450 lignes**

---

### Étape 9 — Suppression ancien code

**Fichiers supprimés :**
- `src/hooks/useAnimateurWait.ts` (130 lignes)
- `src/hooks/useSessionSuspension.ts` (126 lignes)
- `src/hooks/useEffectiveAnimateur.ts` (28 lignes)

**Fichiers nettoyés :**
- Supprimer tous les imports vers ces hooks dans tout le projet
- Vérifier qu'aucun autre fichier ne les utilise

**Critère de validation :**
- `npx tsc --noEmit` → 0 erreurs
- Aucune référence aux anciens hooks

---

### Étape 10 — Règles Firestore

**Fichier modifié :**
- Firebase Console → Firestore Rules (ou fichier rules local)

**Ajout :**
```
match /groupes/{groupeId}/participantExits/{uid} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

**Critère de validation :**
- Un participant ne peut écrire que son propre document
- Tout utilisateur authentifié peut lire (pour vérifier si banni)

---

### Étape 11 — Vérification des 14 scénarios

| # | Scénario | Transition attendue |
|---|----------|-------------------|
| 1 | ≥3 participants + animateur à l'heure H | WAITING → SESSION_ACTIVE |
| 2 | <3 participants à l'heure H | WAITING → COUNTDOWN_START (below) |
| 3 | Participant rejoint pendant countdown → ≥3 + anim | COUNTDOWN → SESSION_ACTIVE |
| 4 | Countdown expire, toujours <3 | COUNTDOWN → SESSION_CANCELLED |
| 5 | ≥3 mais animateur absent à l'heure H | WAITING → COUNTDOWN_START (no_anim) |
| 6 | Animateur revient pendant countdown | COUNTDOWN → SESSION_ACTIVE |
| 7 | Countdown expire, animateur absent, personne ne propose | COUNTDOWN_START → SESSION_CANCELLED |
| 7b | Countdown expire pas, quelqu'un propose pendant countdown | COUNTDOWN_START → REPLACEMENT_PROPOSED → SESSION_ACTIVE |
| 8 | Participant quitte en session, ≥3 restants | SESSION_ACTIVE (pas de changement) |
| 9 | Participant quitte, <3 restants | ACTIVE → GRACE → SUSPENDED (below) |
| 10 | Participant revient dans les 3min suspension | SUSPENDED → SESSION_ACTIVE |
| 11 | Personne ne revient, countdown expire | SUSPENDED → SESSION_CANCELLED |
| 12 | Animateur quitte en session, revient <3min | ACTIVE → GRACE → (résolu) → ACTIVE |
| 13 | Animateur quitte, ne revient pas, personne ne propose | ACTIVE → GRACE → SUSPENDED → SESSION_CANCELLED |
| 13b | Animateur quitte, quelqu'un propose pendant suspension | ACTIVE → GRACE → SUSPENDED → REPLACEMENT → SESSION_ACTIVE |
| 14 | 3ème suspension → annulation auto | SUSPENDED → SESSION_CANCELLED |
| 15 | Participant quitte 3 fois → banni | PARTICIPANT_BANNED → refus reconnexion |

Chaque scénario doit être testé manuellement avec le groupe de test.

---

## Ordre d'exécution et dépendances

```
Étape 1 (types + transitions)     ← aucune dépendance
    ↓
Étape 2 (TimerManager)            ← aucune dépendance
    ↓
Étape 3 (useParticipantTracker)   ← dépend de étape 1 (types)
    ↓
Étape 4 (useVocalMachine)         ← dépend de étapes 1, 2, 3
    ↓
Étape 5 (nettoyage service)       ← peut être fait en parallèle avec 4
    ↓
Étape 6 (Cloud Function)          ← peut être fait en parallèle avec 4-5
    ↓
Étape 7 (overlays UI)             ← dépend de étape 4 (interface)
    ↓
Étape 8 (SalleVocalePage)         ← dépend de étapes 4, 5, 7
    ↓
Étape 9 (suppression ancien code) ← dépend de étape 8
    ↓
Étape 10 (rules Firestore)        ← peut être fait en parallèle
    ↓
Étape 11 (vérification scénarios) ← dépend de tout
```

## Fichiers créés

| Fichier | Lignes estimées | Rôle |
|---------|----------------|------|
| `src/vocal/machine/types.ts` | ~80 | Types VocalPhase, Event, Context, State, SideEffect |
| `src/vocal/machine/transitions.ts` | ~200 | Fonction pure de transition + table |
| `src/vocal/machine/timers.ts` | ~60 | TimerManager centralisé |
| `src/vocal/hooks/useParticipantTracker.ts` | ~120 | Bridge LiveKit → événements |
| `src/vocal/hooks/useVocalMachine.ts` | ~250 | Hook central unique |

## Fichiers supprimés

| Fichier | Lignes | Raison |
|---------|--------|--------|
| `src/hooks/useAnimateurWait.ts` | 130 | Fusionné dans useVocalMachine |
| `src/hooks/useSessionSuspension.ts` | 126 | Fusionné dans useVocalMachine |
| `src/hooks/useEffectiveAnimateur.ts` | 28 | Intégré dans useVocalMachine |

## Fichiers modifiés

| Fichier | Nature des changements |
|---------|----------------------|
| `src/screens/Espace/SalleVocalePage.tsx` | -450 lignes logique lifecycle, +switch machine |
| `src/lib/groupeParoleService.ts` | +incrementParticipantExit, +isParticipantBanned, -initSessionState, +gardes terminales |
| `src/components/vocal/SuspensionOverlay.tsx` | Props simplifiés |
| `src/components/vocal/AnimateurWaitOverlay.tsx` | Renommé CountdownOverlay, props simplifiés |
| `src/types/groupeParole.ts` | Pas de changement (types déjà bons) |
| `functions/src/index.ts` | +guard banned dans getLiveKitToken |

## Bilan net

- **Créé** : ~710 lignes (machine + hooks)
- **Supprimé** : ~284 lignes (anciens hooks)
- **Retiré de SalleVocalePage** : ~450 lignes
- **Net** : environ -25 lignes au total, mais surtout une architecture maintenable

## Points à surveiller après déploiement

1. **Multi-device** : un même utilisateur sur 2 onglets compte comme 2 participants dans LiveKit — à surveiller
2. **Mobile background** : iOS Safari peut couper WebRTC en arrière-plan après ~30s — la grâce de 30s devrait absorber
3. **Firestore cold start** : les listeners peuvent mettre 1-2s à s'initialiser — la machine doit gérer le cas "pas encore de sessionState"
4. **Concurrence remplacement** : la transaction `proposeAsAnimateur` gère le cas, mais il faut tester avec 2 clics simultanés
5. **TTL token LiveKit** : 1h — un participant banni qui a déjà un token peut techniquement se reconnecter jusqu'à expiration (le kick client est le mécanisme primaire)
