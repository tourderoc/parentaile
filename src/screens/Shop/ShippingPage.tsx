import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useCartStore } from '../../lib/cart';
import { useShippingStore, calculateShippingCost, ShippingInfo } from '../../lib/shipping';
import { createCheckoutSession } from '../../lib/stripe';

export const ShippingPage = () => {
  const navigate = useNavigate();
  const { items } = useCartStore();
  const { shippingInfo, setShippingInfo } = useShippingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form with saved shipping info if available
  const [formData, setFormData] = useState<ShippingInfo>(shippingInfo || {
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'France',
    saveForNextOrder: false,
  });

  // Calculate cart total and shipping cost
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shippingCost = calculateShippingCost(subtotal);
  const total = subtotal + shippingCost;

  // If cart is empty, redirect to cart page
  React.useEffect(() => {
    if (items.length === 0) {
      navigate('/cart');
    }
  }, [items, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, saveForNextOrder: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const requiredFields = ['firstName', 'lastName', 'address', 'city', 'postalCode', 'country'];
    const missingFields = requiredFields.filter(field => !formData[field as keyof ShippingInfo]);
    
    if (missingFields.length > 0) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      
      // Save shipping info to store
      setShippingInfo(formData);
      
      // Add shipping cost to items if applicable
      const checkoutItems = [...items];
      if (shippingCost > 0) {
        checkoutItems.push({
          id: 'shipping',
          title: 'Frais de livraison',
          price: shippingCost,
          quantity: 1,
          image_url: ''
        });
      }
      
      // Create checkout session with shipping info
      await createCheckoutSession(checkoutItems, formData);
    } catch (error) {
      console.error('Error during checkout:', error);
      setError('Une erreur est survenue lors du paiement. Veuillez réessayer.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/cart">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour au panier
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">
            Informations de livraison
          </h1>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_300px] gap-6">
          <Card className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <Label htmlFor="address">Adresse *</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="city">Ville *</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Code postal *</Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <Label htmlFor="country">Pays *</Label>
                <Input
                  id="country"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="flex items-center space-x-2 mb-6">
                <Checkbox
                  id="saveForNextOrder"
                  checked={formData.saveForNextOrder}
                  onCheckedChange={handleCheckboxChange}
                />
                <Label htmlFor="saveForNextOrder" className="font-normal">
                  Enregistrer mes infos pour la prochaine commande
                </Label>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  'Procéder au paiement'
                )}
              </Button>
            </form>
          </Card>

          <Card className="p-6 h-fit">
            <h2 className="text-xl font-semibold mb-4">Récapitulatif</h2>
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>{item.title} (x{item.quantity})</span>
                  <span>{(item.price * item.quantity).toFixed(2)} €</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 mb-4">
              <div className="flex justify-between mb-2">
                <span>Sous-total</span>
                <span>{subtotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Frais de livraison</span>
                <span>
                  {shippingCost === 0 
                    ? 'Gratuit' 
                    : `${shippingCost.toFixed(2)} €`}
                </span>
              </div>
              {shippingCost === 0 && (
                <div className="text-green-600 text-sm mb-2">
                  Livraison gratuite à partir de 30€
                </div>
              )}
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{total.toFixed(2)} €</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
