import { loadStripe } from '@stripe/stripe-js';
import { ShippingInfo } from './shipping';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import { useCartStore } from './cart';

export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Créer une commande dans Firestore et retourner son ID
const createOrder = async (items: any[], shippingInfo?: ShippingInfo) => {
  try {
    // Calculer le total
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = items.find(item => item.id === 'shipping')?.price || 0;
    const total = subtotal + shippingCost;

    // Créer un ID unique pour la commande
    const orderId = uuidv4();

    // Créer la commande dans Firestore
    const orderData = {
      orderId,
      products: items.filter(item => item.id !== 'shipping').map(item => ({
        id: item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        image_url: item.image_url
      })),
      subtotal,
      shippingCost,
      total,
      status: 'pending', // La commande est en attente de paiement
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userName: shippingInfo ? `${shippingInfo.firstName} ${shippingInfo.lastName}` : 'Client',
      email: shippingInfo?.email || '',
      address: shippingInfo ? 
        `${shippingInfo.address}\n${shippingInfo.postalCode} ${shippingInfo.city}\n${shippingInfo.country}` : 
        '',
      phone: shippingInfo?.phone || ''
    };

    // Ajouter la commande à Firestore
    const docRef = await addDoc(collection(db, 'orders'), orderData);
    console.log('Commande créée avec ID:', docRef.id, 'et orderId:', orderId);

    return orderId;
  } catch (error) {
    console.error('Erreur lors de la création de la commande:', error);
    throw error;
  }
};

export const createCheckoutSession = async (items: any[], shippingInfo?: ShippingInfo) => {
  try {
    // Créer d'abord la commande dans Firestore
    const orderId = await createOrder(items, shippingInfo);

    // Ensuite, créer la session Stripe avec l'ID de commande dans les métadonnées
    const response = await fetch('/createStripeCheckout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items,
        shippingInfo,
        orderId, // Inclure l'ID de commande dans la requête
        success_url: `${window.location.origin}/boutique?success=true&orderId=${orderId}`,
        cancel_url: `${window.location.origin}/cart?canceled=true&orderId=${orderId}`,
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

    // Vider le panier après la création de la commande
    useCartStore.getState().clearCart();

    // Rediriger vers la page de paiement Stripe
    window.location.href = url;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};
