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

### 3. Test VPS-only en conditions réelles ✅ EFFECTUÉ 2026-04-26

Test grandeur nature : Firebase coupé temporairement, tout fonctionnel, Firebase rétabli.
Aucune perte de données (Firestore conservait tout pendant le test).

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

## Résultats du test VPS-only du 2026-04-26

**Contexte :** test effectué depuis la maison (sans accès physique au cabinet). Migration des données Firestore → PostgreSQL **skippée volontairement** (dual-write actif depuis le 17 avril, données déjà présentes sur VPS).

### Déroulement

| Étape | Résultat |
|-------|----------|
| A — Migration données | ⏭️ Skippée (dual-write suffisant, données déjà sur VPS) |
| B — Couper Firebase (`VITE_FIREBASE_BRIDGE=false`) + build + deploy | ✅ OK |
| C — Créer token MedCompanion + activer sur Parent'aile | ✅ Token visible dans VPS (`status: used`) |
| C — Envoyer message depuis Parent'aile | ✅ Message dans PostgreSQL, visible dans MedCompanion |
| C — Vérifier notifications | ✅ Fonctionnel |
| D — Rétablir dual-write + restore main sur parentaile.fr | ✅ OK |

### Bugs découverts et corrigés pendant le test

**1. `GET /bridge/tokens` → 405 (MedCompanion)**
- Cause : `VpsBridgeService.FetchAllTokensAsync()` appelait `GET /bridge/tokens` (n'existe pas en GET)
- Fix : endpoint corrigé → `GET /bridge/tokens/sync/medcompanion`
- Commit : `3e11131` (MedCompanion)

**2. `GET /bridge/messages` → 405 (MedCompanion)**
- Cause : `VpsBridgeService.FetchMessagesAsync()` appelait `GET /bridge/messages` (n'existe pas)
- Fix : endpoint corrigé → `GET /bridge/messages/doctor/medcompanion`
- Commit : `3e11131` (MedCompanion)

**3. `doctor_id` vide dans les messages (VPS)**
- Cause : `MessageComposer.tsx` envoyait `doctor_id: ''` au POST `/bridge/messages`
- Fix VPS : `bridge_router.py` déduit `doctor_id` depuis `bridge_tokens` si champ vide
- Fix data : 3 messages existants backfillés via SQL `UPDATE bridge_messages SET doctor_id = ...`
- Note pour le merge : corriger `MessageComposer.tsx` pour envoyer le vrai `doctor_id`

**4. Badge "Messages" ne se mettait pas à jour (MedCompanion)**
- Cause : `RunSyncAttemptAsync` dans `PilotageControl` lisait uniquement Firebase
- Fix : ajout d'un check VPS en premier dans la boucle de sync
- Commit : `3e11131` (MedCompanion)

**5. Messages en double dans le dialog MedCompanion**
- Cause : `FetchAndSyncMessagesAsync` dédupliquait par ID uniquement (UUID VPS ≠ ID Firestore → même message compté deux fois)
- Fix : déduplication supplémentaire par `tokenId|contenu`
- Commit : `3e11131` (MedCompanion)

### Verdict

**Le bridge VPS fonctionne de bout en bout sans Firebase.** Les 5 bugs trouvés sont tous corrigés. Le merge peut se faire en confiance.

---

## Jour du merge (dimanche, après 250 users) — Checklist

> ⚠️ **IMPÉRATIF : faire depuis le cabinet (bureau), pas depuis la maison.**
> La migration des données Firestore → PostgreSQL nécessite un accès réseau stable et le poste de développement principal.
> La branche `dev` de Parent'aile et le projet MedCompanion sont sur la machine du bureau.

### Pré-requis le matin du merge

- [ ] Être au cabinet avec accès à la machine de développement
- [ ] MedCompanion rebuild depuis le bureau (`dotnet build medcompagnio2.sln`)
- [ ] Vérifier que parentaile-v0 est sur la branche `dev` et à jour (`git pull`)
- [ ] Avoir une connexion internet stable (upload du build Netlify ~2 min)
- [ ] Prévenir les utilisateurs actifs si possible (heure creuse recommandée : dimanche matin)

### Étape 1 — Migration des données (5-10 min)

**Depuis le cabinet uniquement.** Le script lit Firestore et écrit dans PostgreSQL VPS.

```bash
ssh root@145.223.117.145
cd /root/account-service

# Dry-run de contrôle (vérifier les chiffres avant d'écrire)
export DATABASE_URL='postgresql://account_service:1e72630fed2a950b67c4a7eade300993dfa2adb9e07e7c54@127.0.0.1:5432/account_db'
export FIREBASE_SA_PATH='/root/account-service/firebase-service-account.json'
venv/bin/python3 migrate_firebase_to_vps.py --dry-run

# Migration réelle (idempotent, ON CONFLICT DO NOTHING — safe à relancer)
venv/bin/python3 migrate_firebase_to_vps.py
```

- [ ] Dry-run affiche des chiffres cohérents (tokens, messages, notifs — comparer avec Firestore console)
- [ ] Migration réelle sans erreur
- [ ] Vérifier les counts dans PostgreSQL :
  ```bash
  sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_tokens;"
  sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_messages;"
  sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_notifications;"
  ```
- [ ] Backfill `doctor_id` si nécessaire (bug connu, corrigé côté VPS mais anciens messages peuvent être vides) :
  ```bash
  sudo -u postgres psql account_db -c "UPDATE bridge_messages m SET doctor_id = t.doctor_id FROM bridge_tokens t WHERE m.token_id = t.token_id AND (m.doctor_id IS NULL OR m.doctor_id = '');"
  ```

### Étape 2 — Couper Firebase côté Parent'aile (5 min)

```bash
# Depuis le bureau, branche dev de parentaile-v0
# Dans le .env
VITE_FIREBASE_BRIDGE=false

npm run build
netlify deploy --prod --dir=dist
```

- [ ] Modifier `.env` (`VITE_FIREBASE_BRIDGE=false`)
- [ ] `npm run build` (depuis la branche `dev`)
- [ ] `netlify deploy --prod --dir=dist`

### Étape 3 — Merger dev → main (5 min)

```bash
# Depuis le bureau, repo parentaile-v0
git checkout main
git merge dev
git push origin main
```

- [ ] Résoudre les conflits éventuels (peu probables — main n'a pas évolué)
- [ ] `git push origin main`
- [ ] Netlify rebuild automatique depuis main (si CI configuré) — sinon redéployer manuellement

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

### Étape 6 — Backup hors-site Google Drive (30 min, une seule fois)

> Fait le jour du merge pour sécuriser les données avant la coupure Firebase.
> Le backup PostgreSQL quotidien tourne déjà sur le VPS, mais il est stocké localement —
> si Hostinger perd le serveur, les données seraient perdues. Google Drive = copie externe gratuite.

**Installer rclone et configurer Google Drive :**

```bash
ssh root@145.223.117.145

# Installer rclone
curl https://rclone.org/install.sh | sudo bash

# Configurer Google Drive (interface interactive)
rclone config
# → n (new remote) → nom: gdrive → type: drive (Google Drive)
# → laisser client_id et client_secret vides
# → scope: drive.file (accès uniquement aux fichiers créés par rclone)
# → Suivre le lien OAuth → se connecter avec nairmedcin@gmail.com → coller le code
```

**Créer le script de backup hors-site :**

```bash
cat > /root/backup-offsite.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_FILE="/root/backups/postgres_${DATE}.sql.gz"

# Dump PostgreSQL
sudo -u postgres pg_dump account_db | gzip > "$BACKUP_FILE"

# Upload Google Drive dans dossier parentaile-backups/
rclone copy "$BACKUP_FILE" gdrive:parentaile-backups/

# Garder uniquement les 30 derniers jours en local
find /root/backups/ -name "*.sql.gz" -mtime +30 -delete

# Garder uniquement les 30 derniers fichiers sur Drive
rclone delete --min-age 30d gdrive:parentaile-backups/

echo "[$(date)] Backup hors-site OK: $BACKUP_FILE"
EOF
chmod +x /root/backup-offsite.sh
mkdir -p /root/backups
```

**Configurer le cron quotidien (3h30 — après le backup local à 3h15) :**

```bash
(crontab -l; echo "30 3 * * * /root/backup-offsite.sh >> /root/logs/backup-offsite.log 2>&1") | crontab -
```

**Tester immédiatement :**

```bash
/root/backup-offsite.sh
rclone ls gdrive:parentaile-backups/
```

- [ ] `rclone` installé et configuré avec `nairmedcin@gmail.com`
- [ ] Script `/root/backup-offsite.sh` créé et exécutable
- [ ] Cron 3h30 ajouté
- [ ] Test manuel OK — fichier visible dans Google Drive (dossier `parentaile-backups`)
- [ ] Vérifier que le fichier est lisible : `gunzip -t /root/backups/postgres_$(date +%Y%m%d).sql.gz`

### Étape 7 — Vérifier les logs (5 min)

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
