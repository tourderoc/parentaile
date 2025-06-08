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
    // Check if we have service account credentials in environment variables
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('Using service account from environment variable');
      } catch (e) {
        console.error('Error parsing FIREBASE_SERVICE_ACCOUNT:', e);
      }
    }

    // Initialize with explicit configuration
    admin.initializeApp({
      credential: serviceAccount 
        ? admin.credential.cert(serviceAccount)
        : admin.credential.applicationDefault(),
      // If you have a specific database URL, add it here
      // databaseURL: "https://your-project-id.firebaseio.com"
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    // Continue anyway to avoid blocking the webhook response
  }
}

// Get Firestore instance and test connection
const db = admin.firestore();
console.log('Firestore instance created');

// Test Firestore connection
(async () => {
  try {
    // Try to access a collection to verify connection
    const testRef = db.collection('_test_connection');
    await testRef.listDocuments();
    console.log('Firestore connection verified successfully');
  } catch (error) {
    console.error('Error connecting to Firestore:', error);
  }
})();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Function to log to both console and a debug collection in Firestore
const logToFirestore = async (message: string, data?: any) => {
  try {
    const logRef = db.collection('webhook_logs').doc();
    await logRef.set({
      message,
      data: data ? JSON.stringify(data) : null,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[LOGGED TO FIRESTORE] ${message}`);
  } catch (error) {
    console.error('Error logging to Firestore:', error);
  }
};

// Process the webhook event asynchronously without blocking the response
const processWebhookEvent = async (stripeEvent: StripeEvent) => {
  try {
    await logToFirestore(`Processing webhook event asynchronously: ${stripeEvent.type}`, { eventType: stripeEvent.type });
    
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      
      // Get line items to update stock
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      
      // Create order in Firestore
      const orderRef = db.collection('orders').doc();
      await logToFirestore(`Creating order with ID: ${orderRef.id}`);
      
      // Verify the orders collection exists
      try {
        const ordersCollection = db.collection('orders');
        const snapshot = await ordersCollection.limit(1).get();
        await logToFirestore(`Orders collection exists: ${snapshot.size > 0 ? 'Yes (has documents)' : 'Yes (empty)'}`);
      } catch (error) {
        await logToFirestore('Error checking orders collection', error);
      }
      
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
      try {
        await orderRef.set(orderData);
        await logToFirestore(`Order data saved to Firestore: ${orderRef.id}`, orderData);
        
        // Verify the document was created
        const docSnapshot = await orderRef.get();
        if (docSnapshot.exists) {
          await logToFirestore(`Verified order document exists: ${orderRef.id}`);
        } else {
          await logToFirestore(`WARNING: Order document does not exist after set: ${orderRef.id}`);
        }
      } catch (error) {
        await logToFirestore(`ERROR saving order data to Firestore: ${orderRef.id}`, error);
        throw error; // Re-throw to handle in the outer catch block
      }

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
    // Using a more reliable approach than setTimeout
    const processingPromise = processWebhookEvent(stripeEvent);
    
    // We don't await this promise, but we handle any errors
    processingPromise.catch(error => {
      console.error('Error in async webhook processing:', error);
      // Try to log to Firestore as well
      logToFirestore('Error in async webhook processing', error).catch(() => {});
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
