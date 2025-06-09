// Using CommonJS syntax for better Netlify compatibility
const { Handler } = require('@netlify/functions');
const Stripe = require('stripe');
const admin = require('firebase-admin');
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    try {
        // Définir directement les informations d'identification Firebase
        // Cette approche est plus fiable que de charger un fichier externe
        const serviceAccount = {
            "type": "service_account",
            "project_id": "parentaile",
            "private_key_id": "3066af4b8d47a8858df3522bd132af3c1daca492",
            "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDfdREFRe0F+oH8\n5OpOj45IRkgRSB01SZxrG3WksVSNGujoreB+tc1ITC1lrfnB9uX8IThmgvkGwOMd\npLMegrgNkrOgXLK/zVgFEBc9hA6xRM/h6gWDjFva2tLRt5ihFoKOeYmQIJV1lX+9\npPytDo1xKkeH65zzfx2NBI0S4BNXzNFylCpPky7WaS1s//CYzrs4jGAWOqm7TCY5\nil9EnCDy+ysxytOPab7uRMQIqsu33QpRDb+AyBi/BYRnztZqfsFYwLBUkoYG6L1B\nZYn3owJEUp+BTA/hVrv4ET36FL1LCYxDGd2r7vM3Mm43PPAQWHRdlhe/dopavVls\n6q6Ste/7AgMBAAECggEAY5aw90Cq2jdDJ4p+QnUIXH22ML2LBuy/oZyjWbsOi7Sq\niMi1fMNZshcBRIe9AA0hgrTrhgRpJ/FfRx7YFYj8rk/rblTh9Ul3KQp60RfB1I9u\ndqjtvCsZ5PgRbRX+GA0IMqdH/8wF0FnIjKSzWA1cTEsjhhgj4wGMEgUtOnRTKpVw\nri98qxQY5fYK5Jhj8E6dlfxNTwDFUNUIvygX6muzieYeA/8JPGobRGdMRVDKYOWx\najIdZkdJAfzJ3Iq8KtHrSEjbT+G0YG8hHnXwPFdaHLbfBsACzxsVv0pSkoTEgI6Z\nlwrSwvCqgdrwAAJp/kVdPH8jVyBCMKmp8BE7fh8igQKBgQDyIIJrY0O30pPns2M4\nsX7m86xcbfEjFePUgSj35uqep+s/RkWEFzIGxr3Z0qsyqEoP7rtIwnhKGAEfwPL1\nErfFk4SrRKA8X2E+0Re3GoaxfjTQFXGqkaJooYlrc9V/Lip8PoYIJGriCKnP8l6R\nMxIj47XJT4gz0qk47c2a1DYdkwKBgQDsQrZJhgB6OOvptRiKq+ZSBR8XZtBlC7BQ\n+3nQGZPMAg4ZaG0k4Lvk5xD4i215oh6h5XtGo6A9E6YfA1/D/CZuLu+PU/yguNFQ\ndmmaDF+kY4WxJrm1CwHnRATTdq/KTTm0vsWII5FpcB2+E5/yvJr8Y3hkrgYYrfqC\n20ppgPuk+QKBgQDpoS7W+ghMpncq+nBCMxq1NOjaowcriKK22Q4z7m/zOSoIewD2\nzP7rhPeJ5/pjPfmA2CWEtoklTXZAMoj8qtwCXC6GqAhJWOtXlqBggMr5F0NUiWyN\nXkss1LnpofKe7mf2TMo9rw4nHp7kVQSk7HeTg9RT9FcDUkEQ+n0K6btx2wKBgQCw\nURUTB6Mhk4tTzae0DZeETHgokb0iO7fop9P/nqbzD/GPuqQBaoouyNacdglMRdXQ\ngp8eV4yFKD3IVU9JxsqzXenAMDCPjX4AK26h3WwfFXq3eywKVV2lRtjHK4MDWeCf\n5+Mot0qUwmwf5ytuDp0nj+BQWqMIFganU5pT5ENomQKBgFnOEosta9MpAowxKmBa\n7SaYDelxxn6HhgP9o5NLPXUaWAuXdY7B6bZLvZ3+XHhO2L0044QZjyDlsY0aXjrr\n34EQIoaGK9KFICu9cStdUqWv2zpOvjgDkua/tDfkN07Fz0uK7CvHWKXHl8ublExF\nr8xSzdNPv1kAKQSaLgDc5K3Y\n-----END PRIVATE KEY-----\n",
            "client_email": "firebase-adminsdk-fbsvc@parentaile.iam.gserviceaccount.com",
            "client_id": "112359845571527650377",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40parentaile.iam.gserviceaccount.com",
            "universe_domain": "googleapis.com"
        };
        console.log('Initialisation de Firebase Admin avec les identifiants intégrés');
        // Initialiser Firebase Admin avec les identifiants intégrés
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('Firebase Admin initialisé avec succès');
    }
    catch (error) {
        console.error('Erreur lors de l\'initialisation de Firebase Admin:', error);
        // En cas d'erreur, essayer d'initialiser avec les identifiants par défaut
        try {
            admin.initializeApp();
            console.log('Firebase Admin initialisé avec les identifiants par défaut (fallback)');
        }
        catch (fallbackError) {
            console.error('Échec de l\'initialisation avec les identifiants par défaut:', fallbackError);
        }
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
