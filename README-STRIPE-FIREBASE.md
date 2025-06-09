# Configuration de Firebase pour les Webhooks Stripe

Ce document explique comment configurer Firebase Admin SDK pour les fonctions Netlify qui traitent les webhooks Stripe.

## Problématique

Les webhooks Stripe nécessitent une connexion fiable à Firebase Firestore pour mettre à jour le statut des commandes lorsqu'un paiement est complété. L'approche initiale utilisant une variable d'environnement `FIREBASE_SERVICE_ACCOUNT` peut poser des problèmes :

- Erreurs de parsing JSON (unexpected token, too few bytes)
- Erreurs d'initialisation Firebase (app/no-app, invalid-credential)
- Complexité d'encodage et de décodage des clés privées

## Solution : Utilisation directe du fichier de clé de service

Pour une méthode plus stable et fiable, nous utilisons maintenant un fichier JSON de clé de service directement dans le projet.

### Étapes de configuration

1. **Obtenir le fichier de clé de service Firebase**
   - Allez sur la [Console Firebase](https://console.firebase.google.com/)
   - Sélectionnez votre projet
   - Allez dans Paramètres du projet > Comptes de service
   - Cliquez sur "Générer une nouvelle clé privée"
   - Téléchargez le fichier JSON

2. **Placer le fichier dans le projet**
   - Copiez le contenu du fichier JSON téléchargé
   - Remplacez le contenu du fichier `netlify/functions/firebase-service-account.json` avec vos informations réelles

3. **Déploiement sur Netlify**
   - Le fichier de clé de service sera déployé avec vos fonctions Netlify
   - Aucune configuration supplémentaire n'est nécessaire dans l'interface Netlify

### Structure du fichier de clé de service

Le fichier `firebase-service-account.json` doit contenir les informations suivantes :

```json
{
  "type": "service_account",
  "project_id": "votre-projet-id",
  "private_key_id": "votre-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nVotre clé privée...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxx@votre-projet.iam.gserviceaccount.com",
  "client_id": "votre-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxx%40votre-projet.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
```

### Sécurité

⚠️ **Important** : Le fichier de clé de service contient des informations sensibles.

- Assurez-vous que ce fichier est inclus dans votre `.gitignore` pour éviter de le committer accidentellement
- Limitez les permissions du compte de service dans Firebase aux opérations strictement nécessaires
- Considérez la rotation périodique de la clé pour une sécurité renforcée

## Fonctionnement

Le webhook Stripe (`stripeWebhook.ts`) est configuré pour :

1. Charger automatiquement le fichier de clé de service depuis `netlify/functions/firebase-service-account.json`
2. Initialiser Firebase Admin avec ces identifiants
3. Se connecter à Firestore pour mettre à jour les commandes lorsqu'un paiement est complété

Cette approche est plus robuste car elle :
- Évite les problèmes de parsing JSON des variables d'environnement
- Simplifie le déploiement et la configuration
- Assure une connexion fiable à Firebase Firestore
