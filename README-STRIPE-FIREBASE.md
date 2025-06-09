# Configuration de Firebase pour les Webhooks Stripe

Ce document explique comment configurer Firebase Admin SDK pour les fonctions Netlify qui traitent les webhooks Stripe.

## Problématique

Les webhooks Stripe nécessitent une connexion fiable à Firebase Firestore pour mettre à jour le statut des commandes lorsqu'un paiement est complété. Les approches précédentes ont posé des problèmes :

- Erreurs de parsing JSON avec la variable d'environnement `FIREBASE_SERVICE_ACCOUNT`
- Problèmes d'accès au fichier de clé de service dans l'environnement Netlify
- Erreurs d'initialisation Firebase (app/no-app, invalid-credential)

## Solution : Variables d'environnement Netlify simplifiées

Pour une méthode plus stable et fiable, nous utilisons maintenant des variables d'environnement Netlify individuelles pour les informations d'identification Firebase.

### Configuration des variables d'environnement

Dans l'interface Netlify, configurez les variables d'environnement suivantes :

1. `FIREBASE_PROJECT_ID` : L'ID de votre projet Firebase (par exemple, "parentaile")
2. `FIREBASE_CLIENT_EMAIL` : L'email du compte de service (par exemple, "firebase-adminsdk-xxxx@parentaile.iam.gserviceaccount.com")
3. `FIREBASE_PRIVATE_KEY` : La clé privée complète, y compris les parties "-----BEGIN PRIVATE KEY-----" et "-----END PRIVATE KEY-----"

### Obtenir ces informations

1. Allez sur la [Console Firebase](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Allez dans Paramètres du projet > Comptes de service
4. Cliquez sur "Générer une nouvelle clé privée"
5. Ouvrez le fichier JSON téléchargé et copiez les valeurs correspondantes

### Avantages de cette approche

1. **Sécurité améliorée** : Les identifiants sensibles ne sont pas stockés dans le code
2. **Simplicité de configuration** : Variables individuelles faciles à configurer dans Netlify
3. **Facilité de mise à jour** : Possibilité de mettre à jour les identifiants sans modifier le code

## Fonctionnement

Le webhook Stripe (`stripeWebhook.ts`) est configuré pour :

1. Récupérer les variables d'environnement Netlify pour Firebase
2. Initialiser Firebase Admin avec ces identifiants
3. Se connecter à Firestore pour mettre à jour les commandes lorsqu'un paiement est complété

Cette approche est plus robuste car elle :
- Évite les problèmes de parsing JSON complexes
- Utilise des variables d'environnement individuelles plus faciles à gérer
- Assure une connexion fiable à Firebase Firestore

## Résolution des problèmes courants

### Erreur "No orderId found in session metadata"

Cette erreur indique que la session Stripe ne contient pas l'identifiant de commande dans ses métadonnées. Pour résoudre ce problème :

1. Assurez-vous que lors de la création de la session Stripe, vous incluez l'identifiant de commande dans les métadonnées :
   ```javascript
   const session = await stripe.checkout.sessions.create({
     // Autres paramètres...
     metadata: {
       orderId: 'votre-identifiant-de-commande'
     }
   });
   ```

2. Vérifiez que l'identifiant de commande est correctement formaté et correspond à celui stocké dans Firestore

### Problèmes avec la clé privée

Si vous rencontrez des erreurs liées à la clé privée, assurez-vous que :

1. La clé privée est complète, y compris les délimiteurs "-----BEGIN PRIVATE KEY-----" et "-----END PRIVATE KEY-----"
2. Les sauts de ligne sont préservés (le code remplace automatiquement les `\\n` par de vrais sauts de ligne)
3. La clé est correctement échappée dans l'interface Netlify
