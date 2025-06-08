"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const stripe_1 = __importDefault(require("stripe"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const handler = async (event) => {
    var _a, _b, _c;
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
            // Set order data
            batch.set(orderRef, {
                userId: (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.userId,
                sessionId: session.id,
                amount: session.amount_total / 100,
                status: 'paid',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                paymentIntentId: session.payment_intent,
                items: lineItems.data.map(item => {
                    var _a, _b;
                    return ({
                        id: (_a = item.price) === null || _a === void 0 ? void 0 : _a.product,
                        quantity: item.quantity,
                        price: ((_b = item.price) === null || _b === void 0 ? void 0 : _b.unit_amount) / 100,
                        title: item.description
                    });
                }),
                shipping: shippingInfo,
                orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            });
            // Update stock levels for each item
            for (const item of lineItems.data) {
                if (!((_c = item.price) === null || _c === void 0 ? void 0 : _c.product) || !item.quantity)
                    continue;
                const bookRef = db.collection('livres_enfants').doc(item.price.product);
                batch.update(bookRef, {
                    stock: admin.firestore.FieldValue.increment(-item.quantity)
                });
                console.log(`Updating stock for book ${item.price.product}: -${item.quantity}`);
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
exports.handler = handler;
//# sourceMappingURL=stripeWebhook.js.map