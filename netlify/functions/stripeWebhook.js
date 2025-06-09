// Using CommonJS syntax for better Netlify compatibility
const { Handler } = require('@netlify/functions');
const Stripe = require('stripe');
const admin = require('firebase-admin');
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    try {
        // Charger directement le fichier de clé de service
        const path = require('path');
        const fs = require('fs');
        // Chemin vers le fichier de clé de service
        const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
        console.log('Chargement du fichier de clé de service depuis:', serviceAccountPath);
        // Vérifier si le fichier existe
        if (fs.existsSync(serviceAccountPath)) {
            // Lire et parser le fichier JSON
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            // Initialiser Firebase Admin avec la clé de service
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('Firebase Admin initialisé avec succès via le fichier de clé de service');
        }
        else {
            console.error('Fichier de clé de service introuvable:', serviceAccountPath);
            // Fallback à la méthode par défaut si le fichier n'existe pas
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
            console.log('Firebase Admin initialisé avec les identifiants par défaut (fallback)');
        }
    }
    catch (error) {
        console.error('Erreur lors de l\'initialisation de Firebase Admin:', error);
    }
}
// Get Firestore instance
const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
// Process the webhook event and update order in Firestore
const processPaymentSuccess = async (stripeEvent) => {
    var _a;
    try {
        console.log(`Processing webhook event: ${stripeEvent.type}`);
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            console.log(`Payment successful for session: ${session.id}`);
            console.log(`Payment intent: ${session.payment_intent}`);
            // Check if we have orderId in metadata
            if (!((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.orderId)) {
                console.error('No orderId found in session metadata');
                return;
            }
            const orderId = session.metadata.orderId;
            console.log(`Updating order with ID: ${orderId}`);
            // Find the order in Firestore
            const ordersRef = db.collection('orders');
            const orderQuery = await ordersRef.where('orderId', '==', orderId).limit(1).get();
            if (orderQuery.empty) {
                console.error(`No order found with orderId: ${orderId}`);
                return;
            }
            const orderDoc = orderQuery.docs[0];
            console.log(`Found order document with ID: ${orderDoc.id}`);
            // Update the order status and payment details
            const updateData = {
                status: 'paid',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                paymentIntentId: session.payment_intent || null,
                stripeSessionId: session.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            // Add any additional payment details if available
            if (session.amount_total) {
                updateData.amountPaid = session.amount_total / 100;
            }
            if (session.payment_method_types) {
                updateData.paymentMethodTypes = session.payment_method_types;
            }
            // Update the order in Firestore
            await orderDoc.ref.update(updateData);
            console.log(`Order ${orderId} updated successfully with status: paid`);
            // Log the complete update for debugging
            console.log('Order update data:', updateData);
        }
    }
    catch (error) {
        console.error('Error processing webhook event:', error);
    }
};
// Using CommonJS handler format
const handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
            },
            body: 'ok'
        };
    }
    try {
        const signature = event.headers['stripe-signature'];
        if (!signature || !endpointSecret) {
            console.error('Missing signature or webhook secret');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Webhook Error: Missing signature' }),
            };
        }
        // Get the raw body
        const body = event.body || '';
        // Verify webhook signature
        const stripeEvent = stripe.webhooks.constructEvent(body, signature, endpointSecret);
        console.log('Webhook event received:', stripeEvent.type);
        // Process the payment success and update the order in Firestore
        // We don't await this to respond to Stripe quickly
        const processingPromise = processPaymentSuccess(stripeEvent);
        // Handle any errors in the background processing
        processingPromise.catch(error => {
            console.error('Error in async webhook processing:', error);
        });
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ received: true })
        };
    }
    catch (error) {
        console.error('Webhook error:', error);
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Webhook handler failed' })
        };
    }
};
// Using CommonJS exports
exports.handler = handler;
