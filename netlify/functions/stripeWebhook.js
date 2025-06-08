// Using CommonJS syntax for better Netlify compatibility
const { Handler } = require('@netlify/functions');
const Stripe = require('stripe');
const admin = require('firebase-admin');
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
// Using CommonJS handler format
const handler = async (event) => {
    var _a, _b, _c, _d;
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
        console.log('Processing webhook event:', stripeEvent.type);
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            // Get line items to update stock
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
            // Create order in Firestore
            const orderRef = db.collection('orders').doc();
            const batch = db.batch();
            // Parse shipping info from metadata if available
            let shippingInfo = null;
            if ((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.shippingInfo) {
                try {
                    shippingInfo = JSON.parse(session.metadata.shippingInfo);
                }
                catch (e) {
                    console.error('Error parsing shipping info:', e);
                }
            }
            // Prepare order data - remove any undefined values
            const orderData = {
                sessionId: session.id || '',
                amount: (session.amount_total || 0) / 100,
                status: 'paid',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            };
            // Only add fields if they exist
            if ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.userId) {
                orderData.userId = session.metadata.userId;
            }
            if (session.payment_intent) {
                orderData.paymentIntentId = session.payment_intent;
            }
            if (shippingInfo) {
                orderData.shipping = shippingInfo;
            }
            // Process line items
            if (lineItems && lineItems.data && lineItems.data.length > 0) {
                orderData.items = lineItems.data.map((item) => {
                    var _a, _b;
                    const itemData = {
                        quantity: item.quantity || 0,
                        price: ((((_a = item.price) === null || _a === void 0 ? void 0 : _a.unit_amount) || 0) / 100)
                    };
                    if ((_b = item.price) === null || _b === void 0 ? void 0 : _b.product) {
                        itemData.id = item.price.product;
                    }
                    if (item.description) {
                        itemData.title = item.description;
                    }
                    return itemData;
                });
            }
            else {
                orderData.items = [];
            }
            // Set order data
            batch.set(orderRef, orderData);
            console.log('Order data prepared:', JSON.stringify(orderData, null, 2));
            // Update stock levels for each item
            if (lineItems && lineItems.data && lineItems.data.length > 0) {
                for (const item of lineItems.data) {
                    if (!((_c = item.price) === null || _c === void 0 ? void 0 : _c.product) || !item.quantity)
                        continue;
                    try {
                        const bookRef = db.collection('livres_enfants').doc(item.price.product);
                        batch.update(bookRef, {
                            stock: admin.firestore.FieldValue.increment(-item.quantity)
                        });
                        console.log(`Updating stock for book ${item.price.product}: -${item.quantity}`);
                    }
                    catch (error) {
                        console.error(`Error updating stock for book ${(_d = item.price) === null || _d === void 0 ? void 0 : _d.product}:`, error);
                        // Continue with other items even if one fails
                    }
                }
            }
            // Commit all changes
            await batch.commit();
            console.log('Order created and stocks updated:', orderRef.id);
        }
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
