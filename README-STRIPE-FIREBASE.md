# Configuration de Firebase pour les Webhooks Stripe

Ce document explique comment configurer Firebase Admin SDK pour les fonctions Netlify qui traitent les webhooks Stripe.

## Problématique

Les webhooks Stripe nécessitent une connexion fiable à Firebase Firestore pour mettre à jour le statut des commandes lorsqu'un paiement est complété. Les approches précédentes ont posé des problèmes :

- Erreurs de parsing JSON avec la variable d'environnement `FIREBASE_SERVICE_ACCOUNT`
- Problèmes d'accès au fichier de clé de service dans l'environnement Netlify
- Erreurs d'initialisation Firebase (app/no-app, invalid-credential)

## Solution : Identifiants Firebase intégrés directement dans le code

Pour une méthode plus stable et fiable, nous avons intégré directement les identifiants Firebase dans le code du webhook.

### Avantages de cette approche

1. **Fiabilité maximale** : Aucune dépendance à des fichiers externes ou des variables d'environnement
2. **Simplicité de déploiement** : Aucune configuration supplémentaire nécessaire sur Netlify
3. **Performances optimales** : Pas de lecture de fichier ou de parsing JSON à l'exécution

### Sécurité

⚠️ **Important** : Les identifiants Firebase sont intégrés directement dans le code.

- Le code est déployé sur Netlify dans un environnement sécurisé
- Les fonctions Netlify ne sont pas exposées publiquement dans leur code source
- Les identifiants ne sont accessibles que par le service Netlify et non par les utilisateurs

### Rotation des identifiants

Si vous devez changer les identifiants Firebase :

1. Générez une nouvelle clé de service dans la console Firebase
2. Mettez à jour le code dans `netlify/functions/stripeWebhook.ts` avec les nouveaux identifiants
3. Redéployez l'application sur Netlify

## Fonctionnement

Le webhook Stripe (`stripeWebhook.ts`) est configuré pour :

1. Utiliser directement les identifiants Firebase intégrés dans le code
2. Initialiser Firebase Admin avec ces identifiants
3. Se connecter à Firestore pour mettre à jour les commandes lorsqu'un paiement est complété

Cette approche est plus robuste car elle :
- Élimine complètement les problèmes de parsing JSON
- Fonctionne de manière fiable dans l'environnement Netlify
- Assure une connexion stable à Firebase Firestore

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
