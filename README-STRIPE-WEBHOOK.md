# Configuration du Webhook Stripe pour Netlify

Ce document explique comment configurer et déployer correctement le webhook Stripe sur Netlify.

## Structure du projet

- Le webhook Stripe est défini dans `netlify/functions/stripeWebhook.ts`
- Ce fichier est compilé en JavaScript (`stripeWebhook.js`) lors du build
- La configuration Netlify est dans `netlify.toml`

## Variables d'environnement requises

Assurez-vous que ces variables d'environnement sont configurées dans les paramètres de déploiement Netlify :

- `STRIPE_SECRET_KEY` : Clé secrète de votre compte Stripe
- `STRIPE_WEBHOOK_SECRET` : Secret du webhook Stripe (généré lors de la création du webhook dans le dashboard Stripe)
- `FIREBASE_SERVICE_ACCOUNT` : (Optionnel) JSON de votre compte de service Firebase pour l'authentification

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

### Erreur "Value for argument 'data' is not a valid Firestore document"

Si vous rencontrez cette erreur lors de l'exécution du webhook :
```
Error: Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value.
```

Cela signifie que vous essayez d'écrire des valeurs `undefined` dans Firestore, ce qui n'est pas autorisé. Pour résoudre ce problème :

1. Assurez-vous que tous les champs que vous écrivez dans Firestore ont des valeurs par défaut
2. Utilisez des vérifications conditionnelles pour n'ajouter que les champs qui ont des valeurs définies
3. Utilisez des objets intermédiaires pour préparer les données avant de les écrire dans Firestore

La version actuelle du webhook a été mise à jour pour gérer ce problème en :
- Préparant un objet `orderData` avec des valeurs par défaut
- N'ajoutant des champs supplémentaires que s'ils existent
- Vérifiant l'existence des données de ligne avant de les traiter
- Ajoutant des blocs try/catch pour gérer les erreurs lors de la mise à jour du stock

### Erreur "502 Sandbox.Timeout" dans Stripe

Si vous voyez des erreurs 502 Timeout dans le dashboard Stripe, cela signifie que votre fonction webhook prend trop de temps pour répondre. Netlify Functions ont une limite de temps d'exécution de 10 secondes, et si votre fonction dépasse cette limite, Stripe recevra une erreur de timeout.

Pour résoudre ce problème :

1. **Répondre rapidement à Stripe** : La fonction a été modifiée pour répondre immédiatement à Stripe avec un statut 200, puis continuer le traitement en arrière-plan.

2. **Traitement asynchrone** : Le traitement des données et les opérations Firestore sont effectués de manière asynchrone après avoir envoyé la réponse à Stripe.

3. **Optimisations de performance** :
   - Utilisation de `set()` direct au lieu de batches Firestore pour les commandes
   - Utilisation de `Promise.all()` pour les mises à jour de stock en parallèle
   - Meilleure gestion des erreurs pour éviter les blocages

4. **Journalisation améliorée** : Des logs détaillés ont été ajoutés pour faciliter le débogage.

Ces modifications permettent à la fonction de répondre à Stripe dans le délai imparti tout en assurant que les données sont correctement enregistrées dans Firestore.

### Problèmes d'écriture dans Firestore

Si les commandes ne sont pas enregistrées dans Firestore malgré l'absence d'erreurs dans les logs Netlify, cela peut être dû à plusieurs raisons :

1. **Problèmes d'authentification Firebase** : 
   - Assurez-vous que les identifiants Firebase sont correctement configurés
   - Ajoutez la variable d'environnement `FIREBASE_SERVICE_ACCOUNT` avec le JSON de votre compte de service

2. **Problèmes de permissions Firestore** :
   - Vérifiez que les règles de sécurité Firestore permettent l'écriture dans la collection `orders`
   - Assurez-vous que le compte de service a les droits d'écriture nécessaires

3. **Débogage amélioré** :
   - La fonction a été mise à jour pour inclure une journalisation détaillée dans Firestore
   - Une collection `webhook_logs` est créée pour stocker les logs d'exécution
   - Chaque étape du processus est enregistrée pour faciliter le débogage

4. **Vérification de la connexion** :
   - Un test de connexion à Firestore est effectué au démarrage de la fonction
   - Les erreurs de connexion sont enregistrées dans les logs Netlify

5. **Vérification des documents créés** :
   - Après chaque opération d'écriture, la fonction vérifie que le document a bien été créé
   - Les résultats de ces vérifications sont enregistrés dans les logs

Consultez la collection `webhook_logs` dans Firestore pour voir les détails d'exécution et identifier les problèmes potentiels.
