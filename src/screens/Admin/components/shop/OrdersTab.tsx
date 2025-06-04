import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Printer, Loader2, AlertCircle } from 'lucide-react';

interface Order {
  id: string;
  userId: string;
  userName: string;
  address: string;
  products: {
    id: string;
    title: string;
    quantity: number;
    price: number;
  }[];
  status: 'pending' | 'shipped';
  createdAt: Date;
  total: number;
}

export const OrdersTab = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const ordersQuery = query(
          collection(db, 'orders'),
          orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(ordersQuery);
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate()
        })) as Order[];

        setOrders(ordersData);
      } catch (error) {
        console.error('Error fetching orders:', error);
        setError('Une erreur est survenue lors du chargement des commandes');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const handlePrintLabel = (order: Order) => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generate shipping label HTML
    const labelHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Étiquette d'expédition</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 400px;
              margin: 0 auto;
            }
            .label {
              border: 2px solid #000;
              padding: 20px;
              margin-bottom: 20px;
            }
            .address {
              margin: 20px 0;
              font-size: 14px;
              line-height: 1.5;
            }
            .order-id {
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="label">
            <strong>DESTINATAIRE :</strong>
            <div class="address">
              ${order.userName}<br />
              ${order.address.replace(/\n/g, '<br />')}
            </div>
            <div class="order-id">
              Commande : ${order.id}
            </div>
          </div>
          <script>
            window.onload = () => window.print();
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(labelHtml);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {orders.map((order) => (
          <Card key={order.id} className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-medium">{order.userName}</h3>
                <p className="text-sm text-gray-500">
                  {format(order.createdAt, 'dd MMMM yyyy à HH:mm', { locale: fr })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePrintLabel(order)}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimer l'étiquette
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Adresse de livraison</h4>
                <p className="text-gray-600 whitespace-pre-line">
                  {order.address}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Articles</h4>
                <div className="space-y-2">
                  {order.products.map((product) => (
                    <div key={product.id} className="flex justify-between">
                      <span>{product.title} (x{product.quantity})</span>
                      <span>{(product.price * product.quantity).toFixed(2)} €</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-medium flex justify-between">
                    <span>Total</span>
                    <span>{order.total.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Aucune commande pour le moment
          </div>
        )}
      </div>
    </div>
  );
};