import { loadStripe } from '@stripe/stripe-js';
import { ShippingInfo } from './shipping';

export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export const createCheckoutSession = async (items: any[], shippingInfo?: ShippingInfo) => {
  try {
    const response = await fetch('/createStripeCheckout', {

      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items,
        shippingInfo,
        success_url: `${window.location.origin}/boutique?success=true`,
        cancel_url: `${window.location.origin}/cart?canceled=true`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    const { url } = await response.json();
    if (!url) {
      throw new Error('Invalid response from checkout service');
    }

    window.location.href = url;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};
