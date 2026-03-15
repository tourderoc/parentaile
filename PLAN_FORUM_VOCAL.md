# Plan Forum Vocal — Parent'aile

> Document de vision et plan technique pour le module forum vocal.
> Dernière mise à jour : 15/03/2026

---

## Concept

Des **groupes de parole temporaires entre parents**, audio uniquement, limités dans le temps et en nombre de participants. Ce n'est ni un réseau social, ni un espace de soin médical, ni un forum classique.

### Principes fondateurs

- **Éphémère** : un forum vit 7 jours puis disparaît complètement
- **Intime** : 5 parents maximum par vocal
- **Humain** : audio sans vidéo, pas d'IA dans le forum
- **Contenant** : un animateur gère la parole
- **Simple** : pas addictif, pas compétitif, pas toxique

---

## Fonctionnement d'un forum

1. Un parent crée un forum (titre, description, catégorie, date/heure du vocal)
2. Création minimum 24h avant le vocal
3. Phase écrite : les parents échangent par écrit et s'inscrivent au vocal (max 5)
4. Vocal : 45 minutes, audio uniquement
5. L'animateur (créateur) peut muter, donner la parole, exclure un participant
6. Si l'animateur est absent après 5min, le premier inscrit prend le relais
7. Après le vocal : le forum continue en écrit quelques jours
8. J+7 : le forum et toutes ses données sont supprimés
9. Les participants laissent une évaluation simple (étoiles + mot optionnel)

---

## Prérequis de lancement

**Seuil : 250 utilisateurs actifs sur Parent'aile** (actuellement ~61, mars 2026)

Raison : à 5-10% de participation, 250 users = 12-25 parents actifs sur le forum = 3-5 forums viables simultanément.

---

## Stratégie de lancement

Le Dr Nair anime lui-même les premiers forums pour :
- Créer l'habitude et la confiance
- Montrer l'exemple du format
- Générer le bouche-à-oreille

Puis transition progressive vers des forums créés par les parents eux-mêmes.

---

## État d'avancement (mars 2026)

### Ce qui est FAIT ✅

| Fonctionnalité | Fichier(s) | Statut |
|----------------|-----------|--------|
| Création de groupes (titre, description, thème, date vocal, structure) | `SlideForum.tsx`, `CreateGroupeParole.tsx` | ✅ |
| Inscription / désinscription des participants (max 5) | `groupeParoleService.ts` | ✅ |
| Phase écrite : chat temps réel (WhatsApp-style) | `GroupeDetailPage.tsx` | ✅ |
| Chat ouvert à tous les parents inscrits au site | `GroupeDetailPage.tsx` | ✅ |
| Modération : créateur peut supprimer des messages | `GroupeDetailPage.tsx` | ✅ |
| Dictée vocale dans le chat | `GroupeDetailPage.tsx` | ✅ |
| Messages longs tronqués avec "Plus de détails" | `GroupeDetailPage.tsx` | ✅ |
| Quitter un groupe avec avertissement contextuel | `GroupeDetailPage.tsx` | ✅ |
| Page détail groupe (`/espace/groupes/:groupeId`) | `GroupeDetailPage.tsx` | ✅ |
| Cartes cliquables dans le listing des groupes | `SlideForum.tsx` | ✅ |
| Hub "Mon Espace" (remplace l'ancienne slide Messages) | `SlideMonEspace.tsx` | ✅ |
| Page "Mes Groupes" avec 3 sections filtrées | `MesGroupesPage.tsx` | ✅ |
| Page "Mes Messages" (wrapper standalone) | `MesMessagesPage.tsx` | ✅ |
| Cartouche vocale sur les cartes (UI prête, 4 états) | `MesGroupesPage.tsx` | ✅ |
| Expiration auto à 7 jours (filtrage côté client) | `groupeParoleService.ts` | ✅ |

### Ce qui reste à faire 🔧

Voir les étapes ci-dessous.

---

## Plan d'implémentation LiveKit — Étapes détaillées

### Étape 0 : Prérequis (à faire par le Dr Nair)

- [ ] Créer un compte sur [LiveKit Cloud](https://cloud.livekit.io) (gratuit, 50h/mois)
- [ ] Récupérer les clés : **API Key** + **API Secret**
- [ ] Les noter dans un endroit sûr (on les mettra dans Firebase Functions)

---

### Étape 1 : Installation des dépendances

**Frontend** (parentaile-v0) :
```bash
npm install @livekit/components-react livekit-client
```

**Backend** (firebase-functions) :
```bash
cd firebase-functions
npm install livekit-server-sdk
```

**Variables d'environnement Firebase** :
```bash
firebase functions:config:set livekit.api_key="VOTRE_API_KEY" livekit.api_secret="VOTRE_API_SECRET" livekit.url="wss://votre-projet.livekit.cloud"
```

---

### Étape 2 : Cloud Function — Génération de tokens

**Fichier** : `firebase-functions/src/livekit.ts`

Créer une Cloud Function HTTP `getLiveKitToken` qui :
1. Vérifie que l'utilisateur est authentifié (Firebase Auth)
2. Vérifie que le groupe existe et que le vocal est dans les 15 min (ou en cours)
3. Vérifie que l'utilisateur est inscrit comme participant
4. Génère un token LiveKit JWT avec :
   - `roomName` : `parentaile-groupe-{groupeId}`
   - `participantName` : pseudo du parent
   - `participantIdentity` : uid Firebase
   - Permissions : `canPublish: true` (audio), `canSubscribe: true`
   - Pour le créateur/animateur : `canPublishData: true` (pour les commandes admin)
5. Retourne le token au client

**Sécurité** :
- Le token expire après 1h
- Seuls les participants inscrits obtiennent un token
- La room n'existe que pendant la fenêtre vocal (15 min avant → 45 min après début)

---

### Étape 3 : Service client LiveKit

**Fichier** : `src/lib/liveKitService.ts`

```typescript
// Fonctions :
export async function getLiveKitToken(groupeId: string): Promise<string>
// → Appelle la Cloud Function, retourne le token JWT

export function getRoomName(groupeId: string): string
// → Retourne "parentaile-groupe-{groupeId}"
```

---

### Étape 4 : Page Salle Vocale (composant principal)

**Fichier** : `src/screens/Espace/SalleVocalePage.tsx`
**Route** : `/espace/groupes/:groupeId/vocal`

```
SalleVocalePage
├── Écran de chargement (connexion à LiveKit)
├── Header
│   ├── Titre du groupe
│   ├── Timer 45 min (compte à rebours)
│   └── Bouton quitter (rouge)
├── Zone participants (cercle ou grille)
│   ├── Avatar + pseudo de chaque participant
│   ├── Indicateur "parle" (cercle vert pulsant quand audio détecté)
│   ├── Indicateur "muté" (icône micro barré)
│   └── Badge "Animateur" sur le créateur
├── Contrôles personnels
│   ├── Bouton Mute / Unmute (micro)
│   └── Bouton Quitter la salle
├── Contrôles animateur (si créateur)
│   ├── Muter un participant
│   ├── Exclure un participant
│   └── Donner / retirer la parole
└── Règles rappelées au début
    └── Modal "Rappel des règles" (affiché 5 sec à l'entrée)
```

**Hooks LiveKit utilisés** :
- `useLiveKitRoom()` — connexion à la room
- `useParticipants()` — liste des participants en temps réel
- `useLocalParticipant()` — contrôles micro local
- `useIsSpeaking()` — indicateur "qui parle"

**Comportements** :
- Auto-déconnexion quand le timer atteint 0
- Si l'animateur quitte → le premier inscrit (par `dateInscription`) prend le relais
- Pas de vidéo (audio-only forcé)
- Indicateur visuel "qui parle" basé sur le niveau audio

---

### Étape 5 : Connecter le bouton "Rejoindre"

**Fichier** : `src/screens/Espace/MesGroupesPage.tsx`

Remplacer le `alert()` dans la `VocalCartouche` (état "open") par :
```typescript
onClick={() => navigate(`/espace/groupes/${groupe.id}/vocal`)
```

**Fichier** : `src/App.tsx`

Ajouter la route :
```tsx
<Route path="/espace/groupes/:groupeId/vocal" element={<SalleVocalePage />} />
```

---

### Étape 6 : Notifications push — Rappel 15 min avant

**Fichier** : `firebase-functions/src/notifications.ts`

Cloud Function scheduled (toutes les minutes ou via Cloud Scheduler) :
1. Requête Firestore : groupes avec `dateVocal` dans les 15 prochaines minutes
2. Pour chaque groupe trouvé, si pas déjà notifié (champ `rappelEnvoye: true`) :
   - Envoyer une notification push à chaque participant inscrit
   - Marquer `rappelEnvoye: true` sur le doc du groupe
3. Contenu de la notification :
   - Titre : "Vocal dans 15 min !"
   - Body : "Le groupe « {titre} » commence bientôt. Rejoignez la salle."
   - Action : ouvre `/espace/groupes/{groupeId}` (la cartouche vocale sera en mode "open")

**Champ à ajouter au type** : `rappelEnvoye?: boolean` dans `GroupeParole`

---

### Étape 7 : Évaluation post-vocal

**Fichier** : `src/screens/Espace/EvaluationVocalDialog.tsx`

Affichée automatiquement quand le parent quitte la salle ou quand le timer se termine :
- 5 étoiles (note de 1 à 5)
- Champ texte optionnel (1 ligne, "Un mot sur cette session ?")
- Bouton "Envoyer" + "Passer"

**Stockage Firestore** : sous-collection `groupes/{id}/evaluations`
```typescript
{
  uid: string,
  pseudo: string,
  note: number, // 1-5
  commentaire?: string,
  date: Timestamp
}
```

---

### Étape 8 : Suppression automatique à J+7

**Fichier** : `firebase-functions/src/cleanup.ts`

Cloud Function scheduled (quotidienne, 3h du matin) :
1. Requête : groupes avec `dateExpiration < now`
2. Pour chaque groupe expiré :
   - Supprimer tous les docs de `groupes/{id}/messages`
   - Supprimer tous les docs de `groupes/{id}/evaluations`
   - Supprimer le doc `groupes/{id}`
3. Log le nombre de groupes supprimés

> Actuellement, le filtrage est côté client (les groupes expirés ne s'affichent pas). Cette étape ajoute le nettoyage réel des données côté serveur.

---

## Ordre d'implémentation recommandé

| # | Étape | Dépendance | Effort |
|---|-------|-----------|--------|
| 0 | Créer compte LiveKit Cloud | Aucune | 5 min |
| 1 | Installer dépendances | Étape 0 | 10 min |
| 2 | Cloud Function token | Étape 1 | 1-2h |
| 3 | Service client LiveKit | Étape 2 | 30 min |
| 4 | **Page Salle Vocale** | Étape 3 | 3-4h |
| 5 | Connecter le bouton "Rejoindre" | Étape 4 | 15 min |
| 6 | Notifications push rappel | Indépendant | 1-2h |
| 7 | Évaluation post-vocal | Étape 4 | 1h |
| 8 | Suppression auto J+7 | Indépendant | 1h |

**Total estimé** : ~8-10h de développement

---

## Plan par phases (vision produit)

### V1 (250 users) — Forum vocal complet, animé par le Dr Nair

- ✅ Création de forum (titre, description, catégorie, date/heure)
- ✅ Inscription des participants (max 5)
- ✅ Phase écrite avant/après le vocal (chat temps réel)
- ✅ Cartouche vocale avec états (en attente → bientôt → salle ouverte)
- 🔧 Vocal 45min via LiveKit (audio-only) — **Étapes 0-5**
- 🔧 Gestion animateur : muter, exclure, donner la parole — **Étape 4**
- 🔧 Notifications push (rappel 15min avant) — **Étape 6**
- 🔧 Évaluations simples post-vocal — **Étape 7**
- 🔧 Suppression automatique après 7 jours — **Étape 8**

### V1.5 (~350 users) — Ouverture aux parents

- Les parents peuvent créer leurs propres forums
- Relais animateur automatique si créateur absent (5 min)
- Catégories de sujets prédéfinies
- Règles d'utilisation affichées avant chaque vocal

### V2 (400+ users) — Modération et badges

- Badges légers : "Premier forum créé", "5 vocaux participés", "Animateur apprécié"
- Signalement d'un participant ou d'un forum
- Bannissement temporaire si 2+ signalements
- Score de confiance (indicateur de participation positive, pas un classement)

---

## Choix technique : LiveKit

### Pourquoi LiveKit

- Open-source (Apache 2.0), gratuit en self-hosted
- Audio-only natif (pas un hack vidéo)
- Gestion des rôles animateur/participant native dans l'API (mute, kick, parole)
- SDK React propre, compatible avec le stack Vite + React du projet
- Pas de vendor lock-in : migration Cloud → self-hosted sans changer le code client

### Plan infrastructure

| Phase | Infra | Coût | Limite |
|-------|-------|------|--------|
| Développement + lancement | LiveKit Cloud (gratuit) | 0€ | 50h/mois (~13 forums) |
| Si ça décolle | LiveKit self-hosted sur VPS | ~4-6€/mois (Hetzner) | Aucune |

### Stack complète du forum

- **Frontend** : React + Vite + Tailwind (existant) + `@livekit/components-react` + `livekit-client`
- **Backend** : Firebase Firestore (forums, messages, inscriptions, évaluations) + `livekit-server-sdk`
- **Audio** : LiveKit Cloud puis self-hosted
- **Notifications** : Firebase Cloud Messaging (existant)
- **Nettoyage** : Firebase Cloud Functions scheduled (TTL 7 jours)

---

## Fichiers à créer/modifier (résumé)

| Action | Fichier | Description |
|--------|---------|-------------|
| Créer | `firebase-functions/src/livekit.ts` | Cloud Function génération token |
| Créer | `firebase-functions/src/cleanup.ts` | Cloud Function suppression J+7 |
| Créer | `firebase-functions/src/notifications.ts` | Cloud Function rappel 15 min |
| Créer | `src/lib/liveKitService.ts` | Service client (appel Cloud Function) |
| Créer | `src/screens/Espace/SalleVocalePage.tsx` | Page salle vocale complète |
| Créer | `src/screens/Espace/EvaluationVocalDialog.tsx` | Dialog évaluation post-vocal |
| Modifier | `src/screens/Espace/MesGroupesPage.tsx` | Connecter bouton "Rejoindre" |
| Modifier | `src/App.tsx` | Route `/espace/groupes/:groupeId/vocal` |
| Modifier | `src/types/groupeParole.ts` | Ajouter `rappelEnvoye?: boolean` |

---

## Risques identifiés

| Risque | Mitigation |
|--------|------------|
| Forums vides | Dr Nair anime les premiers forums |
| Animateur absent | Relais automatique au premier inscrit après 5min |
| Dérive émotionnelle | Rappel des règles avant chaque vocal + limite 45min |
| Sujets polémiques | Catégories prédéfinies (V1.5) |
| Dépendance LiveKit Cloud | Migration self-hosted possible sans changement code |
| Problèmes micro mobile | Test sur iOS Safari + Android Chrome avant lancement |

---

## Ce qui est volontairement exclu

- Pas de vidéo
- Pas d'IA dans le forum
- Pas de système compétitif / gamification lourde
- Pas de permanence des contenus (tout disparaît à J+7)
- Pas de forum public visible sans inscription
