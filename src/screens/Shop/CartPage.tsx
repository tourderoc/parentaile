import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Trash2, Plus, Minus, Loader2, AlertCircle } from 'lucide-react';
import { useCartStore } from '../../lib/cart';

export const CartPage = () => {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity } = useCartStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = () => {
    try {
      setIsCheckingOut(true);
      setError(null);
      // Navigate to shipping page instead of directly to Stripe
      navigate('/shipping');
    } catch (error) {
      console.error('Error during checkout:', error);
      setError('Une erreur est survenue. Veuillez réessayer.');
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/boutique">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à la boutique
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">
            Mon panier
          </h1>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {items.length > 0 ? (
          <div className="grid gap-6">
            <Card className="p-6">
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 py-4 border-b last:border-0">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-20 h-20 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium">{item.title}</h3>
                      <p className="text-gray-600">{item.price.toFixed(2)} €</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, Math.max(0, item.quantity - 1))}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-medium">Total</span>
                <span className="text-2xl font-bold">{total.toFixed(2)} €</span>
              </div>
              <Button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Redirection...
                  </>
                ) : (
                  'Procéder au paiement'
                )}
              </Button>
            </Card>
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-gray-600 mb-4">Votre panier est vide</p>
            <Link to="/boutique">
              <Button className="bg-primary hover:bg-primary/90">
                Continuer mes achats
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
};
