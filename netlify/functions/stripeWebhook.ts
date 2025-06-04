import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.19.0";
import { initializeApp } from "https://esm.sh/firebase-admin@11.8.0/app";
import { getFirestore, FieldValue } from "https://esm.sh/firebase-admin@11.8.0/firestore";

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '');
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature || !endpointSecret) {
      console.error('Missing signature or webhook secret');
      return new Response('Webhook Error: Missing signature', { status: 400 });
    }

    // Get the raw body
    const body = await req.text();
    
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      endpointSecret
    );

    console.log('Processing webhook event:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
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
        createdAt: FieldValue.serverTimestamp(),
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
          stock: FieldValue.increment(-item.quantity)
        });

        console.log(`Updating stock for book ${item.price.product}: -${item.quantity}`);
      }

      // Commit all changes
      await batch.commit();
      console.log('Order created and stocks updated:', orderRef.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed' }), 
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
