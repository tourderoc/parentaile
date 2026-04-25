# MERGE PLAN — Fusion branche principale + coupure Firebase

> **Jour cible** : un dimanche, une fois l'objectif de **250 utilisateurs** atteint.
> **Durée estimée** : 30-45 minutes (pas de maintenance visible pour les parents).

---

## Etat actuel (2026-04-25)

| Brique | Statut |
|--------|--------|
| Account service (comptes, enfants, groupes) | ✅ VPS only |
| Avatar service | ✅ VPS only |
| Notifications parentales (groupes vocaux) | ✅ VPS only |
| Bridge tokens (MedCompanion ↔ Parent'aile) | ✅ Dual-write VPS + Firebase |
| Bridge messages (parent → médecin) | ✅ Dual-write VPS + Firebase |
| Bridge notifications (médecin → parent) | ✅ Dual-write VPS + Firebase |
| Script migration Firestore → PostgreSQL | ✅ Prêt et testé (dry-run OK : 707 documents) |
| Firebase Auth | ✅ Conservé à vie |
| FCM push | ✅ Conservé à vie (transport uniquement) |

---

## Pre-merge : tâches obligatoires (faire en amont)

### 1. Vérifier les deux chemins d'inscription

Après merge, les deux pages d'inscription coexistent :
- **`EspaceRegister.tsx`** (espace parent) → crée Firebase Auth + VPS account
- **`RegisterForm.tsx`** (page principale via `AuthModal`) → crée Firebase Auth + Firestore `users` + VPS account

S'assurer que les deux chemins fonctionnent correctement en test avant le merge.

### 2. Rebuild MedCompanion

La version actuelle de MedCompanion (commit `f0beef4`) inclut le dual-write VPS.
Rebuild l'exe et l'utiliser quelques jours avant le merge pour vérifier que les tokens,
notifications et réponses arrivent bien sur le VPS.

### 3. Test VPS-only en conditions réelles (dimanche 27 avril 2026)

Test grandeur nature : couper Firebase temporairement, vérifier que tout fonctionne,
puis revenir sur Firebase. Aucun risque de perte de données (Firestore conserve tout).

**Pré-requis :** MedCompanion rebuild avec le dual-write (commit `f0beef4`).

**Étape A — Migrer les données Firestore → PostgreSQL (5 min)**

```bash
ssh root@145.223.117.145
cd /root/account-service
export DATABASE_URL='postgresql://account_service:1e72630fed2a950b67c4a7eade300993dfa2adb9e07e7c54@127.0.0.1:5432/account_db'
export FIREBASE_SA_PATH='/root/account-service/firebase-service-account.json'
venv/bin/python3 migrate_firebase_to_vps.py
```

**Étape B — Couper Firebase (2 min)**

```bash
# Dans le .env de Parent'aile
VITE_FIREBASE_BRIDGE=false
npm run build && firebase deploy --only hosting
```

**Étape C — Tests (10 min)**

- [ ] Créer un token dans MedCompanion → vérifier qu'il apparaît sur Parent'aile
- [ ] Envoyer un message depuis Parent'aile → vérifier dans MedCompanion
- [ ] Répondre depuis MedCompanion → vérifier la notification push côté parent
- [ ] Notification rapide depuis MedCompanion → badge + push reçu
- [ ] Dashboard Parent'aile : liste des messages, historique, badges notifs
- [ ] Vérifier les logs VPS : `journalctl -u parentaile-account --since "10 min ago" | grep -i error`

**Étape D — Revenir sur Firebase (2 min)**

```bash
# Remettre dans le .env
VITE_FIREBASE_BRIDGE=true   # ou supprimer la ligne
npm run build && firebase deploy --only hosting
```

**Résultat attendu :** si tout passe → le merge final sera une simple répétition de ce test,
sans l'étape D. Si des problèmes sont détectés → on les corrige avant le vrai merge.

---

## Jour du merge (dimanche, après 250 users) — Checklist

### Étape 1 — Migration des données (5 min)

```bash
ssh root@145.223.117.145
cd /root/account-service

# Dry-run de contrôle
export DATABASE_URL='postgresql://account_service:1e72630fed2a950b67c4a7eade300993dfa2adb9e07e7c54@127.0.0.1:5432/account_db'
export FIREBASE_SA_PATH='/root/account-service/firebase-service-account.json'
venv/bin/python3 migrate_firebase_to_vps.py --dry-run

# Migration réelle (idempotent, ON CONFLICT DO NOTHING)
venv/bin/python3 migrate_firebase_to_vps.py
```

- [ ] Dry-run affiche les bons chiffres (~220 tokens, ~314 notifs, ~169 messages, ~4 users)
- [ ] Migration réelle sans erreur
- [ ] Vérifier quelques tokens dans PostgreSQL :
  ```bash
  sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_tokens;"
  sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_messages;"
  sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_notifications;"
  ```

### Étape 2 — Couper Firebase côté Parent'aile (5 min)

```bash
# Dans le .env de production Parent'aile
VITE_FIREBASE_BRIDGE=false
```

- [ ] Modifier `.env` (ou `.env.production`)
- [ ] `npm run build`
- [ ] Déployer sur Firebase Hosting (`firebase deploy --only hosting`)

### Étape 3 — Merger dev → main (5 min)

- [ ] `git checkout main && git merge dev`
- [ ] Résoudre les conflits éventuels
- [ ] `git push origin main`

### Étape 4 — Vérifier le VPS (2 min)

```bash
systemctl restart parentaile-account
journalctl -u parentaile-account -f
```

- [ ] Service redémarré sans erreur
- [ ] `systemctl status vocal-reminders.timer` actif

### Étape 5 — Tests smoke (10 min)

- [ ] **Token** : créer un token dans MedCompanion → vérifier qu'il apparaît dans PostgreSQL
- [ ] **Activation** : utiliser le token sur Parent'aile → statut passe à "used" dans PostgreSQL
- [ ] **Message** : envoyer un message depuis Parent'aile → apparaît dans MedCompanion
- [ ] **Réponse** : répondre depuis MedCompanion → réponse visible dans Parent'aile
- [ ] **Notification** : envoyer une notification rapide → badge + push FCM reçu
- [ ] **Inscription** : nouveau parent s'inscrit → compte créé dans VPS
- [ ] **Groupes vocaux** : vérifier qu'un groupe existant charge correctement

### Étape 6 — Vérifier les logs (5 min)

```bash
# Logs VPS
journalctl -u parentaile-account --since "30 min ago" | grep -i error

# Console Firebase — vérifier qu'il n'y a plus d'écriture Firestore
# (sauf Firebase Auth qui reste)
```

- [ ] Aucune erreur critique dans les logs
- [ ] Firestore ne reçoit plus d'écritures (sauf Auth)

---

## Rollback d'urgence (si problème)

```bash
# 1. Remettre Firebase côté Parent'aile
# .env : VITE_FIREBASE_BRIDGE=true (ou supprimer la ligne)
# npm run build && firebase deploy --only hosting

# 2. Les données sont toujours dans Firestore (dual-write = rien n'a été supprimé)
# 3. MedCompanion continue à écrire sur les deux — aucune action nécessaire
```

Le rollback prend 5 minutes. Aucune donnée n'est perdue car le dual-write gardait
Firebase à jour jusqu'à la coupure.

---

## Post-merge : nettoyage (semaine suivante)

### Code Parent'aile — supprimer `@FIREBASE_LEGACY`

```bash
# Trouver tous les fichiers avec du code Firebase legacy
grep -r "@FIREBASE_LEGACY" src/ --include="*.ts" --include="*.tsx" -l
```

- [ ] Supprimer les imports Firebase (`firebase/firestore`, `db`) dans les fichiers migrés
- [ ] Supprimer les fonctions `_subscribeFirebase`, `_getNotifications*Firebase`, etc.
- [ ] Supprimer les blocs `if (USE_FIREBASE) { ... }` et garder uniquement la branche VPS
- [ ] Supprimer `VITE_FIREBASE_BRIDGE` du `.env`
- [ ] Vérifier compilation `npx tsc --noEmit`

### Code MedCompanion — supprimer Firebase bridge

- [ ] Dans `TokenService.cs` : supprimer les appels `_firebaseService.WriteToken/UpdateTokenStatus/DeleteToken`
- [ ] Dans `MessagesControl.xaml.cs` : supprimer les appels `_firebaseService.UpdateMessageReply/WriteNotification`
- [ ] Dans `PilotageControl.xaml.cs` : supprimer les appels `_firebaseService.WriteNotification/SendBroadcast`
- [ ] `PatientMessageService.cs` : supprimer le merge Firebase dans `FetchAndSyncMessagesAsync`
- [ ] `TokenService.cs` : supprimer le fallback Firebase dans `SyncFromFirebaseAsync`
- [ ] Évaluer la suppression complète de `FirebaseService.cs` (listeners Firestore SDK)

### Firebase — archivage

- [ ] Évaluer la suppression de `RegisterForm.tsx` / `AuthModal` si tous les parents passent par `EspaceRegister`
- [ ] Archiver la collection Firestore `users` (remplacée par VPS accounts)
- [ ] Archiver les collections `tokens`, `messages`, `notifications` (30 jours lecture seule puis suppression)
- [ ] Supprimer les Cloud Functions Firebase si plus utilisées (`functions/src/index.ts` déjà vidé)
- [ ] `banReports` : migrer ou archiver (usage résiduel)
