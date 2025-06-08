// Using CommonJS syntax for better Netlify compatibility
const { Handler } = require('@netlify/functions');
const Stripe = require('stripe');
const admin = require('firebase-admin');

// Netlify Functions have a 10-second timeout
// We need to respond to Stripe quickly to avoid 502 errors
const RESPONSE_TIMEOUT = 8000; // 8 seconds to be safe

// TypeScript interfaces for type safety
interface StripeEvent {
  type: string;
  data: {
    object: any;
  };
}

interface LineItem {
  price?: {
    product?: string;
    unit_amount?: number;
  };
  quantity?: number;
  description?: string;
}

interface NetlifyEvent {
  httpMethod: string;
  headers: {
    [key: string]: string;
  };
  body: string;
}

interface NetlifyResponse {
  statusCode: number;
  headers?: {
    [key: string]: string;
  };
  body: string;
}

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      // Using default credentials
      // If you need specific credentials, add them here
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    // Continue anyway to avoid blocking the webhook response
  }
}
const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Process the webhook event asynchronously without blocking the response
const processWebhookEvent = async (stripeEvent: StripeEvent) => {
  try {
    console.log('Processing webhook event asynchronously:', stripeEvent.type);
    
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      
      // Get line items to update stock
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      
      // Create order in Firestore
      const orderRef = db.collection('orders').doc();
      console.log('Creating order with ID:', orderRef.id);
      
      // Parse shipping info from metadata if available
      let shippingInfo = null;
      if (session.metadata?.shippingInfo) {
        try {
          shippingInfo = JSON.parse(session.metadata.shippingInfo);
        } catch (e) {
          console.error('Error parsing shipping info:', e);
        }
      }

      // Prepare order data - remove any undefined values
      const orderData: Record<string, any> = {
        sessionId: session.id || '',
        amount: (session.amount_total || 0) / 100,
        status: 'paid',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      };

      // Only add fields if they exist
      if (session.metadata?.userId) {
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
        orderData.items = lineItems.data.map((item: LineItem) => {
          const itemData: Record<string, any> = {
            quantity: item.quantity || 0,
            price: ((item.price?.unit_amount || 0) / 100)
          };

          if (item.price?.product) {
            itemData.id = item.price.product;
          }

          if (item.description) {
            itemData.title = item.description;
          }

          return itemData;
        });
      } else {
        orderData.items = [];
      }

      // Set order data directly without batch
      await orderRef.set(orderData);
      console.log('Order data saved to Firestore:', orderRef.id);

      // Update stock levels for each item separately
      if (lineItems && lineItems.data && lineItems.data.length > 0) {
        const updatePromises = lineItems.data.map(async (item: LineItem) => {
          if (!item.price?.product || !item.quantity) return Promise.resolve();

          try {
            const bookRef = db.collection('livres_enfants').doc(item.price.product as string);
            await bookRef.update({
              stock: admin.firestore.FieldValue.increment(-item.quantity)
            });
            console.log(`Updated stock for book ${item.price.product}: -${item.quantity}`);
            return Promise.resolve();
          } catch (error) {
            console.error(`Error updating stock for book ${item.price?.product}:`, error);
            return Promise.resolve(); // Continue with other items even if one fails
          }
        });

        // Wait for all stock updates to complete
        await Promise.all(updatePromises);
        console.log('All stock updates completed');
      }
    }
  } catch (error) {
    console.error('Error in async webhook processing:', error);
  }
};

// Using CommonJS handler format
const handler = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
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
    const stripeEvent: StripeEvent = stripe.webhooks.constructEvent(
      body,
      signature,
      endpointSecret
    );

    console.log('Webhook event received:', stripeEvent.type);

    // Start processing the event asynchronously
    // This allows us to respond to Stripe quickly
    setTimeout(() => {
      processWebhookEvent(stripeEvent).catch(error => {
        console.error('Error in delayed webhook processing:', error);
      });
    }, 0);

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

// Using CommonJS exports
exports.handler = handler;
