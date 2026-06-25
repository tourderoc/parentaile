# MERGE PLAN — Fusion branche principale + coupure Firebase

> **Jour cible merge** : **Dimanche 29 juin 2026, 9h au cabinet**
> **Durée estimée merge** : 45-60 minutes (pas de maintenance visible pour les parents).

---

## ⚡ Vendredi 27 juin — Communication utilisateurs (5 min)

> Faire une fois les **250 utilisateurs atteints**.

**Dans MedCompanion :**
1. Ouvrir **Pilotage → Utilisateurs**
2. Cliquer **"Broadcast"** (bouton en haut de la liste)
3. Message suggéré :

```
Bonne nouvelle ! Le groupe de parole est maintenant disponible sur Parent'aile.
Retrouvez-le dans Mon Espace → Groupes.
Une mise à jour importante arrivera ce dimanche — aucune action requise de votre part.
```

4. Envoyer → push FCM envoyé à tous les parents actifs

> Le dual-write Firebase est encore actif vendredi → couverture maximale.

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

## Bug découvert en dual-write actif — 2026-04-28

**Symptôme :** un parent active son token depuis `parentaile.fr` (branche `main`) → MedCompanion continue d'afficher "En attente d'activation" indéfiniment, même après refresh de l'onglet Utilisateurs.

**Cause racine :**
- `main` n'a PAS le code dual-write (il n'est livré que sur `dev`).
- Quand le parent active : Firebase reçoit `status: used`, mais le VPS n'est jamais notifié → reste `pending`.
- Côté MedCompanion, [TokenService.cs `SyncFromFirebaseAsync`](../MedCompagion%20V1%20b%C3%A9ta/MedCompanion/Services/TokenService.cs) lit le VPS en priorité. Comme le VPS connaît le token (en `pending`), Firebase est ignoré pour ce token (condition `if (!ContainsKey)`).
- Résultat : MedCompanion montre l'état VPS obsolète.

**Patch temporaire appliqué (à retirer après merge) :**
- Dans `SyncFromFirebaseAsync`, si VPS dit `pending` ET Firebase dit `used` → on croit Firebase (état plus avancé).
- 3 lignes ajoutées dans la boucle de fusion `fbStatuses`. Commenté `Patch dual-write` pour traçabilité.

**Pourquoi ce patch et pas un fix côté React :**
- Le vrai fix = couper Firebase et basculer `main` sur le code VPS-only = c'est exactement le merge final.
- En attendant, ce patch protège l'affichage MedCompanion contre la divergence Firebase/VPS pendant que les deux sources coexistent.

**À FAIRE après le merge :**
- ✅ Couper `VITE_FIREBASE_BRIDGE=false` + déployer `main` (déjà dans la checklist Étape 2)
- 🆕 Retirer le patch dual-write dans `TokenService.cs` (la branche `else if (kvp.Value == "used" && tokenStatuses[kvp.Key] == "pending")`)
- 🆕 Backfill des tokens orphelins éventuels : tout token Firebase `used` qui n'est pas `used` côté VPS doit être resynchronisé. Script SQL ou one-shot Python à prévoir.

---

## Jour du merge — Dimanche 29 juin 2026, 9h au cabinet

> ⚠️ **IMPÉRATIF : faire depuis le cabinet (bureau), pas depuis la maison.**
> Durée totale estimée : **45-60 min** (backup Google Drive inclus).

**Avant de commencer, ouvrir 3 onglets dans le navigateur :**
- [Console Firestore](https://console.firebase.google.com/) → pour comparer les counts à l'étape 1
- [Pilotage Parent'aile](https://parentaile.fr) connecté en admin → pour les tests smoke
- MedCompanion ouvert sur le bureau → pour les tests smoke

---

### Étape 0 — Vérifications préliminaires (5 min)

**Terminal du bureau :**
```bash
cd "c:\Users\nair\Desktop\parentaile-v0"
git checkout dev
git pull origin dev
git status
```
→ doit afficher `nothing to commit, working tree clean`

**VPS en ligne :**
```bash
ssh root@145.223.117.145 "systemctl is-active parentaile-account && echo VPS_OK"
```
→ doit afficher `VPS_OK`

- [ ] Repo `dev` propre et à jour
- [ ] VPS répond

---

### Étape 1 — Migration des données Firestore → PostgreSQL (10 min)

```bash
ssh root@145.223.117.145
cd /root/account-service
export DATABASE_URL='postgresql://account_service:1e72630fed2a950b67c4a7eade300993dfa2adb9e07e7c54@127.0.0.1:5432/account_db'
export FIREBASE_SA_PATH='/root/account-service/firebase-service-account.json'
```

**Dry-run d'abord — lire les chiffres attentivement :**
```bash
venv/bin/python3 migrate_firebase_to_vps.py --dry-run
```
> Comparer les chiffres affichés avec la console Firestore (tokens, messages, notifications).
> Si les chiffres semblent aberrants → **STOP**, ne pas continuer, contacter Claude.

**Si dry-run OK — migration réelle (idempotent, safe à relancer) :**
```bash
venv/bin/python3 migrate_firebase_to_vps.py
```

**Vérifier les counts dans PostgreSQL :**
```bash
sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_tokens;"
sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_messages;"
sudo -u postgres psql account_db -c "SELECT count(*) FROM bridge_notifications;"
```

**Backfill `doctor_id` (bug connu sur anciens messages) :**
```bash
sudo -u postgres psql account_db -c "UPDATE bridge_messages m SET doctor_id = t.doctor_id FROM bridge_tokens t WHERE m.token_id = t.token_id AND (m.doctor_id IS NULL OR m.doctor_id = '');"
```

- [ ] Dry-run affiche des chiffres cohérents avec Firestore console
- [ ] Migration réelle terminée sans erreur
- [ ] Counts PostgreSQL cohérents
- [ ] Backfill `doctor_id` exécuté

---

### Étape 2 — Couper Firebase côté Parent'aile (5 min)

**Depuis le bureau, dans `parentaile-v0` :**

Ouvrir le fichier `.env` et modifier :
```
VITE_FIREBASE_BRIDGE=false
```

```bash
npm run build
netlify deploy --prod --dir=dist
```
> Attendre la fin du déploiement (1-2 min), puis vérifier que [parentaile.fr](https://parentaile.fr) charge.

- [ ] `.env` modifié (`VITE_FIREBASE_BRIDGE=false`)
- [ ] `npm run build` sans erreur
- [ ] `netlify deploy --prod --dir=dist` terminé
- [ ] parentaile.fr accessible

---

### Étape 3 — Merger dev → main (5 min)

```bash
git checkout main
git merge dev
git push origin main
```
> Conflits peu probables — `main` n'a pas évolué depuis avril.
> Si Netlify CI actif sur `main` → rebuild automatique, sinon :
```bash
netlify deploy --prod --dir=dist
```

- [ ] `git merge dev` sans conflit bloquant
- [ ] `git push origin main` OK
- [ ] parentaile.fr toujours accessible après rebuild

---

### Étape 4 — Redémarrer et surveiller le VPS (2 min)

```bash
ssh root@145.223.117.145
systemctl restart parentaile-account
journalctl -u parentaile-account -f
```
> Laisser défiler 30 secondes. Pas d'erreur rouge → `Ctrl+C`.

```bash
systemctl status vocal-reminders.timer
```
→ doit afficher `active`

- [ ] Service redémarré sans erreur critique
- [ ] `vocal-reminders.timer` actif

---

### Étape 5 — Tests smoke (10 min)

Faire chaque test dans l'ordre. Un seul échec → voir **Rollback** en bas de page.

- [ ] **Token** : créer un token dans MedCompanion → vérifier qu'il apparaît dans Pilotage > Utilisateurs (statut "En attente")
- [ ] **Activation** : utiliser le token sur Parent'aile → statut passe à "Actif" dans Pilotage
- [ ] **Message parent → médecin** : envoyer un message depuis Parent'aile → message visible dans MedCompanion
- [ ] **Réponse médecin → parent** : répondre depuis MedCompanion → réponse visible dans Parent'aile
- [ ] **Notification rapide** : envoyer une notif depuis MedCompanion → badge + push FCM reçu sur le téléphone
- [ ] **Inscription** : créer un nouveau compte parent → compte visible dans Pilotage
- [ ] **Logs propres** :
  ```bash
  journalctl -u parentaile-account --since "15 min ago" | grep -i error
  ```
  → aucune erreur critique

---

### Étape 6 — Backup hors-site Google Drive (30 min, à faire une seule fois)

> Peut être lancé pendant les tests smoke (tourne en parallèle).
> Le backup PostgreSQL quotidien tourne déjà sur le VPS mais est stocké localement —
> si le serveur est perdu, les données partent avec. Google Drive = copie externe gratuite.

```bash
ssh root@145.223.117.145

# Installer rclone
curl https://rclone.org/install.sh | sudo bash

# Configurer Google Drive (guide interactif)
rclone config
# → n (new remote)
# → nom : gdrive
# → type : drive (Google Drive)
# → client_id et client_secret : laisser vides (Entrée)
# → scope : drive.file
# → Suivre le lien OAuth → se connecter avec nairmedcin@gmail.com → coller le code affiché
```

**Créer le script de backup :**
```bash
cat > /root/backup-offsite.sh << 'SCRIPT'
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_FILE="/root/backups/postgres_${DATE}.sql.gz"
sudo -u postgres pg_dump account_db | gzip > "$BACKUP_FILE"
rclone copy "$BACKUP_FILE" gdrive:parentaile-backups/
find /root/backups/ -name "*.sql.gz" -mtime +30 -delete
echo "[$(date)] Backup hors-site OK: $BACKUP_FILE"
SCRIPT
chmod +x /root/backup-offsite.sh
mkdir -p /root/backups /root/logs
```

**Ajouter le cron à 3h30 (après le backup local à 3h15) :**
```bash
(crontab -l; echo "30 3 * * * /root/backup-offsite.sh >> /root/logs/backup-offsite.log 2>&1") | crontab -
```

**Tester immédiatement :**
```bash
/root/backup-offsite.sh
rclone ls gdrive:parentaile-backups/
```
→ le fichier doit apparaître dans Google Drive

- [ ] `rclone` installé et configuré avec `nairmedcin@gmail.com`
- [ ] Script `/root/backup-offsite.sh` créé et exécutable
- [ ] Cron 3h30 ajouté (`crontab -l` pour vérifier)
- [ ] Test manuel OK — fichier visible dans Google Drive (dossier `parentaile-backups`)

---

### Étape 7 — Vérification finale des logs (5 min)

```bash
ssh root@145.223.117.145
journalctl -u parentaile-account --since "30 min ago" | grep -i error
```

Ouvrir la console Firebase → onglet Firestore → vérifier qu'il n'y a plus de nouvelles écritures dans `tokens`, `messages`, `notifications` (Firebase Auth reste actif, c'est normal).

- [ ] Aucune erreur critique dans les logs VPS
- [ ] Firestore ne reçoit plus d'écritures (hors Auth)

---

## ✅ Merge terminé — durée réelle : _____ min

---

## Rollback d'urgence (si problème à n'importe quelle étape)

```bash
# 1. Remettre Firebase dans .env
VITE_FIREBASE_BRIDGE=true

# 2. Rebuild et déployer
npm run build
netlify deploy --prod --dir=dist
```

**Le rollback prend 5 minutes.** Aucune donnée n'est perdue — le dual-write gardait Firebase à jour jusqu'à la coupure. MedCompanion continue d'écrire sur les deux sans aucune action de ta part.

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
- [ ] `TokenService.cs` : retirer le **patch dual-write 2026-04-28** (branche `else if Firebase=used && VPS=pending`) — voir section "Bug découvert en dual-write actif"
- [ ] Évaluer la suppression complète de `FirebaseService.cs` (listeners Firestore SDK)

### Firebase — archivage

- [ ] Évaluer la suppression de `RegisterForm.tsx` / `AuthModal` si tous les parents passent par `EspaceRegister`
- [ ] Archiver la collection Firestore `users` (remplacée par VPS accounts)
- [ ] Archiver les collections `tokens`, `messages`, `notifications` (30 jours lecture seule puis suppression)
- [ ] Supprimer les Cloud Functions Firebase si plus utilisées (`functions/src/index.ts` déjà vidé)
- [ ] `banReports` : **supprimer directement** (données de test dev uniquement — `submitBanFeedback` n'existait que sur dev, aucune migration nécessaire)
