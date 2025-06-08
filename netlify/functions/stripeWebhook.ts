import { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
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
    const stripeEvent = stripe.webhooks.constructEvent(
      body,
      signature,
      endpointSecret
    );

    console.log('Processing webhook event:', stripeEvent.type);

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      
      // Get line items to update stock
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      
      // Create order in Firestore
      const orderRef = db.collection('orders').doc();
      const batch = db.batch();

      // Parse shipping info from metadata if available
      let shippingInfo = null;
      if (session.metadata?.shippingInfo) {
        try {
          shippingInfo = JSON.parse(session.metadata.shippingInfo);
        } catch (e) {
          console.error('Error parsing shipping info:', e);
        }
      }

      // Set order data
      batch.set(orderRef, {
        userId: session.metadata?.userId,
        sessionId: session.id,
        amount: session.amount_total! / 100,
        status: 'paid',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentIntentId: session.payment_intent,
        items: lineItems.data.map(item => ({
          id: item.price?.product,
          quantity: item.quantity,
          price: item.price?.unit_amount! / 100,
          title: item.description
        })),
        shipping: shippingInfo,
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      });

      // Update stock levels for each item
      for (const item of lineItems.data) {
        if (!item.price?.product || !item.quantity) continue;

        const bookRef = db.collection('livres_enfants').doc(item.price.product as string);
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

  } catch (error) {
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

export { handler };
