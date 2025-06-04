import * as functions from 'firebase-functions';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';

admin.initializeApp();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export const createCheckoutSession = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const { items, success_url, cancel_url } = data;

    if (!items?.length) {
      throw new Error('No items provided');
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item: any) => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: item.title,
            images: [item.image_url],
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url,
      cancel_url,
      metadata: {
        userId: context.auth.uid,
      },
    });

    return { sessionId: session.id };
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const signature = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (!userId) {
        throw new Error('No user ID in session metadata');
      }

      // Update order status and stock levels
      const db = admin.firestore();
      const batch = db.batch();

      // Create order record
      const orderRef = db.collection('orders').doc();
      batch.set(orderRef, {
        userId,
        sessionId: session.id,
        paymentIntentId: session.payment_intent,
        status: 'paid',
        amount: session.amount_total! / 100,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update stock levels
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      for (const item of lineItems.data) {
        const productRef = db.collection('livres_enfants').doc(item.price?.product as string);
        batch.update(productRef, {
          stock: admin.firestore.FieldValue.increment(-item.quantity!),
        });
      }

      await batch.commit();
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Webhook Error');
  }
});