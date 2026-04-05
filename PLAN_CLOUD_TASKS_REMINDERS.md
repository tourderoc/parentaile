# Plan : Migration Cloud Tasks — Rappels vocaux

## Contexte

### Problème actuel
- `sendVocalReminders` tourne **toutes les 1 minute, 24h/24** → 1440 appels Firestore/jour
- Lectures `accounts/{uid}` séquentielles (boucle `for await`) au lieu de parallèles

### Objectif
- Zéro polling : chaque groupe déclenche ses propres tâches au bon moment
- Coût proportionnel à l'activité (quelques dizaines d'appels/mois vs 43 000)
- Annulation maintenue à **H-30min** — un groupe de parole c'est un état d'esprit, pas du remplissage de dernière minute

---

## Nouvelle logique métier

| Tâche | Déclenchement | Action |
|-------|--------------|--------|
| `task-30min` | dateVocal - 30min | Si < 3 inscrits → annulation + notif / Si ≥ 3 → notif "dans 30 min" |
| `task-15min` | dateVocal - 15min | Notif "dans 15 min" |
| `task-5min`  | dateVocal - 5min  | Notif "ça commence !" |

---

## Architecture

```
Groupe créé / dateVocal modifiée
          ↓
  Firestore onWrite (manageVocalTasks)
          ↓
  Cloud Tasks Queue "vocal-reminders"
  ┌─────────────────────────────────┐
  │ parentaile-{groupeId}-30min     │ → fireAt: dateVocal - 30min
  │ parentaile-{groupeId}-15min     │ → fireAt: dateVocal - 15min
  │ parentaile-{groupeId}-5min      │ → fireAt: dateVocal - 5min
  └─────────────────────────────────┘
          ↓ (à l'heure exacte)
  handleVocalReminder (HTTP function)
  → lit le groupe, envoie FCM ou annule
```

---

## Étapes d'implémentation

### Étape 1 — Setup infrastructure (Google Cloud Console)

1. Activer l'API Cloud Tasks :
   ```
   gcloud services enable cloudtasks.googleapis.com
   ```

2. Créer la queue :
   ```
   gcloud tasks queues create vocal-reminders \
     --location=europe-west1 \
     --max-attempts=3 \
     --min-backoff=10s
   ```

3. Donner les permissions au service account Cloud Functions :
   ```
   gcloud projects add-iam-policy-binding [PROJECT_ID] \
     --member="serviceAccount:[PROJECT_ID]@appspot.gserviceaccount.com" \
     --role="roles/cloudtasks.enqueuer"
   ```

4. Donner la permission d'invoquer les Cloud Functions (pour que Cloud Tasks puisse appeler handleVocalReminder) :
   ```
   gcloud projects add-iam-policy-binding [PROJECT_ID] \
     --member="serviceAccount:[PROJECT_ID]@appspot.gserviceaccount.com" \
     --role="roles/cloudfunctions.invoker"
   ```

5. Récupérer le PROJECT_ID :
   ```
   firebase projects:list
   ```

---

### Étape 2 — Installer la dépendance

```bash
cd functions
npm install @google-cloud/tasks
```

---

### Étape 3 — Variables de configuration

```bash
firebase functions:config:set \
  cloudtasks.project="[PROJECT_ID]" \
  cloudtasks.location="europe-west1" \
  cloudtasks.queue="vocal-reminders" \
  cloudtasks.handler_url="https://europe-west1-[PROJECT_ID].cloudfunctions.net/handleVocalReminder"
```

---

### Étape 4 — Coder `handleVocalReminder` (HTTP)

Reçoit : `{ groupeId: string, type: '30min' | '15min' | '5min' }`

Logique :
1. Lire le groupe dans Firestore
2. Si groupe n'existe plus ou status `cancelled` → exit silencieux
3. Vérifier la déduplication dans `notifications_sent` (même système qu'avant)
4. Selon `type` :
   - `30min` :
     - Si `participants.length < 3` → annuler le groupe + notif annulation (in-app + FCM)
     - Si `participants.length >= 3` → envoyer notif "dans 30 min"
   - `15min` → envoyer notif "dans 15 min"
   - `5min` → envoyer notif "ça commence !"
5. Marquer dans `notifications_sent` pour déduplication

**Lectures parallèles (fix perf) :**
```typescript
// Avant (séquentiel) :
for (const p of participants) {
  const snap = await db.collection('accounts').doc(p.uid).get();
}

// Après (parallèle) :
const snaps = await Promise.all(
  participants.map(p => db.collection('accounts').doc(p.uid).get())
);
```

---

### Étape 5 — Coder `manageVocalTasks` (Firestore onWrite)

Trigger : `onWrite` sur `groupes/{groupeId}`

Logique :
- **Groupe créé** (`before` n'existe pas) → créer 3 tâches
- **dateVocal modifiée** → supprimer les 3 anciennes tâches + recréer
- **Groupe annulé/supprimé** (`after.status === 'cancelled'` ou deleted) → supprimer les tâches en attente

Nommage des tâches (pour pouvoir les retrouver et les annuler) :
```
parentaile-{groupeId}-30min
parentaile-{groupeId}-15min
parentaile-{groupeId}-5min
```

---

### Étape 6 — Suppression de `sendVocalReminders`

Une fois les Cloud Tasks déployés et testés :
- Supprimer la fonction `sendVocalReminders` de `index.ts`
- Vérifier dans Firebase Console que la fonction scheduled est bien supprimée

---

## Protection contre les régressions

| Risque | Protection |
|--------|-----------|
| Tâche retentée 2x par Cloud Tasks | Déduplication `notifications_sent` déjà en place |
| Groupe annulé manuellement avant H-30 | `manageVocalTasks` onWrite supprime les tâches |
| dateVocal modifiée par l'animateur | onWrite détecte changement et replanifie |
| Tâche qui échoue | Cloud Tasks retente automatiquement (max 3 fois) |
| Groupe supprimé avant H-30 | onDelete supprime les tâches + exit silencieux dans handler |

---

## Ordre de déploiement recommandé

1. Setup Cloud Tasks (console) — Étape 1
2. Installer `@google-cloud/tasks` — Étape 2
3. Configurer les variables — Étape 3
4. Coder et déployer `handleVocalReminder` — Étape 4
5. Tester `handleVocalReminder` manuellement avec un appel HTTP
6. Coder et déployer `manageVocalTasks` — Étape 5
7. Vérifier que les tâches sont bien créées dans la console Cloud Tasks
8. Attendre qu'un vrai groupe passe → vérifier les notifs
9. Supprimer `sendVocalReminders` — Étape 6

---

## État : À implémenter
