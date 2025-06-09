// Using CommonJS syntax for better Netlify compatibility
const { Handler } = require('@netlify/functions');
const Stripe = require('stripe');

// Simplified webhook that only verifies payment success
// No Firestore operations as per new requirements

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

// No Firebase initialization needed as we're not using Firestore

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16', // Use a specific API version
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Simple function to log webhook events
const logWebhookEvent = (stripeEvent: StripeEvent) => {
  console.log(`Webhook event received: ${stripeEvent.type}`);
  
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    console.log(`Payment successful for session: ${session.id}`);
    console.log(`Payment intent: ${session.payment_intent}`);
    
    // Log any metadata that might be useful for debugging
    if (session.metadata) {
      console.log('Session metadata:', session.metadata);
    }
    
    // No Firestore operations - these will be handled client-side
    console.log('Payment verification complete. Order creation will be handled client-side.');
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

    // Log the event but don't process it asynchronously
    // Just verify the payment was successful
    logWebhookEvent(stripeEvent);

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
