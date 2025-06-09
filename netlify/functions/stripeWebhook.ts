// Using CommonJS syntax for better Netlify compatibility
const { Handler } = require('@netlify/functions');
const Stripe = require('stripe');
const admin = require('firebase-admin');

// Webhook that updates existing orders in Firestore when payment is completed

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
    // Utiliser les variables d'environnement Netlify pour Firebase
    const projectId = process.env.FIREBASE_PROJECT_ID || 'parentaile';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY ? 
      process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;
    
    if (clientEmail && privateKey) {
      // Créer l'objet de configuration avec les variables d'environnement
      const serviceAccount = {
        projectId,
        clientEmail,
        privateKey
      };
      
      console.log(`Initialisation de Firebase Admin avec le compte de service: ${clientEmail}`);
      
      // Initialiser Firebase Admin avec les identifiants des variables d'environnement
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      console.log('Firebase Admin initialisé avec succès via variables d\'environnement');
    } else {
      // Fallback à l'initialisation par défaut si les variables ne sont pas définies
      console.log('Variables d\'environnement Firebase manquantes, tentative d\'initialisation par défaut');
      admin.initializeApp();
      console.log('Firebase Admin initialisé avec les identifiants par défaut');
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de Firebase Admin:', error);
    
    // En cas d'erreur, essayer d'initialiser avec les identifiants par défaut
    try {
      admin.initializeApp();
      console.log('Firebase Admin initialisé avec les identifiants par défaut (fallback)');
    } catch (fallbackError) {
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
const processPaymentSuccess = async (stripeEvent: StripeEvent) => {
  try {
    console.log(`Processing webhook event: ${stripeEvent.type}`);
    
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      console.log(`Payment successful for session: ${session.id}`);
      console.log(`Payment intent: ${session.payment_intent}`);
      
      // Check if we have orderId in metadata
      if (!session.metadata?.orderId) {
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
      const updateData: Record<string, any> = {
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
  } catch (error) {
    console.error('Error processing webhook event:', error);
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
