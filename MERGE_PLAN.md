# MERGE PLAN — Fusion branche principale + Espace Parent'aile

> **Jour cible** : un dimanche, une fois l'objectif de **250 utilisateurs** atteint.

---

## Pre-merge : taches obligatoires

### 1. Synchroniser les comptes Firebase → VPS

Les parents inscrits via le chemin legacy (`AuthModal` / `RegisterForm`) ont un compte **Firebase Auth + Firestore `users`** mais **pas de compte VPS (`accounts`)**.

**Action** : exécuter un script de sync one-shot qui :
- Liste tous les documents Firestore `users`
- Pour chaque `uid`, vérifie si un compte VPS existe (`GET /accounts/{uid}`)
- Si absent : crée le compte VPS (`POST /accounts`) avec `uid`, `email`, `pseudo` lus depuis Firestore
- Log les comptes créés et les éventuels conflits (pseudo dupliqué, etc.)

> **Note** : un fallback automatique existe dans `userContext.tsx` — si un parent se connecte et n'a pas de compte VPS, il est créé automatiquement. Le script one-shot garantit que TOUS les comptes sont présents dans le pilotage MedCompanion dès le merge, même pour les parents inactifs.

### 2. Vérifier les deux chemins d'inscription

Après merge, les deux pages d'inscription coexistent :
- **`EspaceRegister.tsx`** (espace parent) → crée Firebase Auth + VPS account
- **`RegisterForm.tsx`** (page principale via `AuthModal`) → crée Firebase Auth + Firestore `users` + VPS account

S'assurer que les deux chemins fonctionnent correctement en test avant le merge.

---

## Jour du merge (dimanche)

### Checklist

- [ ] Vérifier le nombre d'utilisateurs (objectif 250)
- [ ] Exécuter le script de sync Firebase → VPS accounts
- [ ] Vérifier dans le pilotage MedCompanion que tous les comptes apparaissent
- [ ] Merger la branche
- [ ] Déployer le frontend (Firebase Hosting)
- [ ] Redémarrer le service VPS (`systemctl restart account-service`)
- [ ] Test smoke : inscription nouveau parent (les deux chemins)
- [ ] Test smoke : notifications push (FCM)
- [ ] Test smoke : cron vocal-reminders (`systemctl status vocal-reminders.timer`)
- [ ] Vérifier les logs VPS (`journalctl -u account-service -f`)

---

## Post-merge : nettoyage

- [ ] Évaluer la suppression de `RegisterForm.tsx` / `AuthModal` si tous les parents passent par `EspaceRegister`
- [ ] Évaluer la suppression de la collection Firestore `users` (remplacée par VPS accounts + rôles)
- [ ] Supprimer les Cloud Functions Firebase si plus utilisées (`functions/src/index.ts` déjà vidé)
- [ ] Ajouter la section notifications dans le pilotage MedCompanion (onglet dédié)
