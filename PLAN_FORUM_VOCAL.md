# Plan Forum Vocal — Parent'aile

> Document de vision et plan technique pour le module forum vocal.
> Dernière mise à jour : 11/03/2026

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

## Plan par étapes

### V1 (250 users) — Forum vocal complet, animé par le Dr Nair

- Création de forum (titre, description, catégorie, date/heure)
- Inscription des participants (max 5)
- Phase écrite avant/après le vocal
- Vocal 45min via LiveKit (audio-only)
- Gestion animateur : muter, exclure, donner la parole
- Notifications push (rappel 15min avant)
- Évaluations simples post-vocal
- Suppression automatique après 7 jours

### V1.5 (~350 users) — Ouverture aux parents

- Les parents peuvent créer leurs propres forums
- Relais animateur automatique si créateur absent
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

- **Frontend** : React + Vite + Tailwind (existant) + LiveKit React SDK
- **Backend** : Firebase Firestore (forums, messages, inscriptions, évaluations)
- **Audio** : LiveKit Cloud puis self-hosted
- **Notifications** : Firebase Cloud Messaging (existant)
- **Nettoyage** : Firebase Cloud Functions scheduled (TTL 7 jours)

---

## Risques identifiés

| Risque | Mitigation |
|--------|------------|
| Forums vides | Dr Nair anime les premiers forums |
| Animateur absent | Relais automatique au premier inscrit après 5min |
| Dérive émotionnelle | Rappel des règles avant chaque vocal + limite 45min |
| Sujets polémiques | Catégories prédéfinies (V1.5) |
| Dépendance LiveKit Cloud | Migration self-hosted possible sans changement code |

---

## Ce qui est volontairement exclu

- Pas de vidéo
- Pas d'IA dans le forum
- Pas de système compétitif / gamification lourde
- Pas de permanence des contenus (tout disparaît à J+7)
- Pas de forum public visible sans inscription
