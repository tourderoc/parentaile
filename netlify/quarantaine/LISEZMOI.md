# Quarantaine (10/11/2026)

Le webhook Stripe (`stripeWebhook`) est sorti de `netlify/functions/` : le paiement n'est pas utilisé
sur le site pour l'instant, et Netlify refuse désormais de l'empaqueter (fichier CommonJS compilé
alors que `package.json` déclare `"type": "module"`), ce qui faisait échouer toute la mise en ligne.

Pour le remettre : le réécrire en ESM (ou le compiler en `.cjs`), le replacer dans
`netlify/functions/`, et remettre sa compilation dans le script `build` de `package.json`.
