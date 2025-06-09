# Configuration du Webhook Stripe pour Netlify (Approche Simplifiée)

Ce document explique comment configurer et déployer correctement le webhook Stripe sur Netlify avec l'approche simplifiée où le webhook sert uniquement à vérifier le succès du paiement.

## Structure du projet

- Le webhook Stripe est défini dans `netlify/functions/stripeWebhook.ts`
- Ce fichier est compilé en JavaScript (`stripeWebhook.js`) lors du build
- La configuration Netlify est dans `netlify.toml`

## Variables d'environnement requises

Assurez-vous que ces variables d'environnement sont configurées dans les paramètres de déploiement Netlify :

- `STRIPE_SECRET_KEY` : Clé secrète de votre compte Stripe
- `STRIPE_WEBHOOK_SECRET` : Secret du webhook Stripe (généré lors de la création du webhook dans le dashboard Stripe)

## Déploiement sur Netlify

1. Connectez votre dépôt à Netlify
2. Configurez la commande de build : `npm run build` (qui compile également les fonctions)
3. Configurez le répertoire de publication : `dist`
4. Ajoutez les variables d'environnement mentionnées ci-dessus

## Configuration du webhook dans Stripe

1. Dans le dashboard Stripe, allez dans Développeurs > Webhooks
2. Cliquez sur "Ajouter un endpoint"
3. Entrez l'URL de votre webhook : `https://votre-site.netlify.app/.netlify/functions/stripeWebhook`
4. Sélectionnez les événements à écouter (au minimum `checkout.session.completed`)
5. Copiez le "Signing secret" généré et ajoutez-le comme variable d'environnement `STRIPE_WEBHOOK_SECRET` dans Netlify

## Tester le webhook

1. Dans le dashboard Stripe, allez dans Développeurs > Webhooks
2. Sélectionnez votre endpoint
3. Cliquez sur "Envoyer un événement de test"
4. Sélectionnez l'événement `checkout.session.completed`
5. Vérifiez les logs dans Netlify pour confirmer que l'événement a été reçu et traité

## Résolution des problèmes

Si le webhook ne fonctionne pas correctement :

1. Vérifiez les logs Netlify pour voir les erreurs
2. Assurez-vous que les variables d'environnement sont correctement configurées
3. Vérifiez que le secret du webhook est correct
4. Assurez-vous que la fonction est bien déployée (elle devrait apparaître dans l'onglet "Functions" de Netlify)

## Notes importantes

- Le webhook est configuré pour utiliser CommonJS (et non ESM) pour une meilleure compatibilité avec Netlify
- Le fichier TypeScript est compilé en JavaScript lors du build grâce à la commande `build:functions` dans package.json
- La directive `[functions]` dans netlify.toml indique à Netlify où trouver les fonctions serverless

## Résolution du problème de compilation

Si vous rencontrez des erreurs lors de la compilation des fonctions TypeScript, assurez-vous que :

1. La commande de build dans package.json cible spécifiquement le fichier stripeWebhook.ts :
   ```json
   "build:functions": "tsc netlify/functions/stripeWebhook.ts --outDir netlify/functions --module commonjs --target es2017 --esModuleInterop --skipLibCheck"
   ```

2. Le fichier stripeWebhook.ts utilise la syntaxe CommonJS (require/exports) et non ESM (import/export)

3. Les deux fichiers (stripeWebhook.ts et stripeWebhook.js) sont présents dans le répertoire netlify/functions

## Problèmes courants lors du déploiement

### Erreur "Could not load edge function"

Si vous voyez une erreur comme celle-ci lors du déploiement :
```
Could not load edge function at '/opt/build/repo/netlify/edge-functions/stripeWebhook.js'
```

Cela signifie que Netlify essaie de charger votre fonction comme une Edge Function au lieu d'une fonction serverless standard. Pour résoudre ce problème :

1. Assurez-vous qu'il n'y a pas de fichier `stripeWebhook.js` dans le répertoire `netlify/edge-functions/`
2. Si ce fichier existe, supprimez-le avec la commande : `rm netlify/edge-functions/stripeWebhook.js`
3. Vérifiez que votre fichier `netlify.toml` ne contient pas de configuration edge_functions pour stripeWebhook

Les Edge Functions et les Netlify Functions sont deux types de fonctions différents, et vous ne pouvez pas utiliser le même nom pour les deux.

## Approche simplifiée

Avec cette approche simplifiée :

1. **Le webhook Stripe ne sert qu'à vérifier le succès du paiement** :
   - Il reçoit l'événement `checkout.session.completed`
   - Il vérifie la signature pour s'assurer que l'événement vient bien de Stripe
   - Il enregistre les informations de base dans les logs Netlify
   - Il répond rapidement à Stripe avec un statut 200

2. **Aucune opération Firestore n'est effectuée dans le webhook** :
   - Pas de création de commande
   - Pas de mise à jour de stock
   - Pas d'écriture de logs dans Firestore

3. **Le traitement des données est géré côté client** :
   - Après redirection vers la page de succès, le frontend récupère les informations nécessaires
   - Le frontend crée la commande dans Firestore
   - Le frontend affiche un modal de confirmation avec les détails de la commande

Cette approche présente plusieurs avantages :
- Webhook plus simple et plus fiable
- Pas de problèmes de timeout avec Stripe
- Meilleur contrôle du processus de commande
- Expérience utilisateur plus fluide

## Affichage client après paiement

Une fois le paiement confirmé, le frontend doit :

1. **Afficher un modal de confirmation** :
   ```
   "Merci pour votre commande ! Elle sera traitée dans les plus brefs délais."
   ```

2. **Inclure un résumé de la commande** :
   - Numéro de commande
   - Produits achetés (titre + quantité)
   - Prix total
   - Adresse de livraison

3. **Enregistrer la commande dans Firestore** :
   - Créer un document dans la collection `orders`
   - Inclure toutes les informations nécessaires (produits, prix, adresse, etc.)
   - Mettre à jour les stocks si nécessaire
