import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { Button } from './button';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Loader2, CheckCircle, Package, CreditCard, MapPin, Mail, Phone } from 'lucide-react';

interface OrderConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

interface OrderDetails {
  id: string;
  orderId: string;
  products: Array<{
    id: string;
    title: string;
    price: number;
    quantity: number;
  }>;
  total: number;
  userName: string;
  email: string;
  address: string;
  phone?: string;
  status: string;
}

export function OrderConfirmationDialog({ open, onOpenChange, orderId }: OrderConfirmationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      if (!orderId || !open) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Rechercher la commande par orderId en utilisant Firestore v9
        const ordersQuery = query(
          collection(db, 'orders'),
          where('orderId', '==', orderId),
          limit(1)
        );
        
        const ordersSnapshot = await getDocs(ordersQuery);
        
        if (ordersSnapshot.empty) {
          setError('Commande introuvable');
          setLoading(false);
          return;
        }
        
        const orderDoc = ordersSnapshot.docs[0];
        const orderData = { ...orderDoc.data(), id: orderDoc.id } as OrderDetails;
        
        setOrder(orderData);
      } catch (error) {
        console.error('Erreur lors de la récupération des détails de la commande:', error);
        setError('Une erreur est survenue lors de la récupération des détails de la commande');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetails();
  }, [orderId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <CheckCircle className="text-green-500 h-6 w-6" />
            Commande confirmée
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">
            {error}
          </div>
        ) : order ? (
          <div className="py-4 space-y-6">
            <p className="text-center text-lg">
              Merci pour votre commande ! Elle sera traitée dans les plus brefs délais.
            </p>
            
            {/* Récapitulatif de commande */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Package className="h-5 w-5" />
                Récapitulatif de commande
              </div>
              
              <div className="space-y-2">
                {order.products.map((product) => (
                  <div key={product.id} className="flex justify-between">
                    <span>
                      {product.title} {product.quantity > 1 ? `(x${product.quantity})` : ''}
                    </span>
                    <span>{(product.price * product.quantity).toFixed(2)} €</span>
                  </div>
                ))}
                
                <div className="border-t pt-2 font-medium flex justify-between">
                  <span>Total</span>
                  <span>{order.total.toFixed(2)} €</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-gray-500" />
                <span>Numéro de commande: <span className="font-mono">{order.orderId}</span></span>
              </div>
            </div>
            
            {/* Coordonnées de livraison */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <MapPin className="h-5 w-5" />
                Coordonnées de livraison
              </div>
              
              <div className="space-y-2">
                <div>
                  <span className="font-medium">{order.userName}</span>
                </div>
                <div className="whitespace-pre-line text-gray-600">
                  {order.address}
                </div>
                
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span>{order.email}</span>
                </div>
                
                {order.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span>{order.phone}</span>
                  </div>
                )}
              </div>
            </div>
            
            <p className="text-center text-sm text-gray-600">
              Vous pourrez suivre votre commande dans votre espace personnel, rubrique « Mes achats ».
            </p>
          </div>
        ) : null}
        
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
