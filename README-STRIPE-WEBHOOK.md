# Configuration du Webhook Stripe pour Netlify

Ce document explique comment configurer et déployer correctement le webhook Stripe sur Netlify pour mettre à jour les commandes existantes dans Firestore.

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

## Flux de traitement des commandes

Le processus de commande suit désormais ce flux :

1. **Création de la commande côté frontend** :
   - Avant d'initier le paiement Stripe, le frontend crée une commande dans Firestore
   - La commande a un statut initial `pending`
   - Un `orderId` unique est généré (par exemple : `timestamp-userId`)
   - Toutes les informations de commande sont enregistrées (articles, infos de livraison, etc.)

2. **Création de la session Stripe** :
   - Lors de la création de la session Stripe via `createStripeCheckout`
   - L'`orderId` est passé dans le champ `metadata` de la session Stripe
   - L'utilisateur est redirigé vers la page de paiement Stripe

3. **Traitement du webhook après paiement** :
   - Lorsque le paiement est complété (`checkout.session.completed`)
   - Le webhook récupère l'`orderId` depuis `metadata`
   - Il recherche la commande correspondante dans Firestore
   - Il met à jour son statut à `paid` et ajoute les détails du paiement

4. **Affichage client après paiement** :
   - Une fois redirigé vers la page de succès
   - Le frontend affiche un modal de confirmation
   - Le modal inclut un résumé de la commande (numéro, produits, prix, adresse)

## Avantages de cette approche

Cette approche présente plusieurs avantages :

- **Fiabilité** : La commande est créée avant même que le paiement ne soit initié
- **Traçabilité** : Toutes les commandes sont enregistrées, même celles abandonnées
- **Cohérence** : Le webhook met à jour une commande existante plutôt que d'en créer une nouvelle
- **Expérience utilisateur** : Le frontend peut afficher immédiatement les détails de la commande
- **Sécurité** : Vérification en deux temps (création côté client + confirmation par webhook)
