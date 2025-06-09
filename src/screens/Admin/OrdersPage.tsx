import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card } from "../../components/ui/card";
import { 
  Home, 
  Search, 
  Filter, 
  Printer, 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  Calendar, 
  User, 
  FileDown,
  Package
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface OrderProduct {
  id: string;
  title: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  orderId: string;
  products: OrderProduct[];
  total: number;
  userName: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone?: string;
  status: string;
  createdAt: Date;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const ordersQuery = query(
          collection(db, 'orders'),
          orderBy('createdAt', 'desc')
        );
        
        const ordersSnapshot = await getDocs(ordersQuery);
        const ordersData = ordersSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            userName: `${data.firstName || ''} ${data.lastName || ''}`.trim()
          } as Order;
        });
        
        setOrders(ordersData);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchOrders();
  }, []);

  // Filtrer les commandes en fonction des critères
  const filteredOrders = orders.filter(order => {
    // Filtre par recherche (nom, email, numéro de commande)
    const searchMatch = 
      order.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filtre par statut
    const statusMatch = 
      statusFilter === 'all' || 
      (statusFilter === 'paid' && order.status === 'paid') ||
      (statusFilter === 'pending' && order.status === 'pending');
    
    // Filtre par date
    let dateMatch = true;
    const today = new Date();
    const orderDate = new Date(order.createdAt);
    
    if (dateFilter === 'today') {
      dateMatch = 
        orderDate.getDate() === today.getDate() &&
        orderDate.getMonth() === today.getMonth() &&
        orderDate.getFullYear() === today.getFullYear();
    } else if (dateFilter === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(today.getDate() - 7);
      dateMatch = orderDate >= oneWeekAgo;
    } else if (dateFilter === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(today.getMonth() - 1);
      dateMatch = orderDate >= oneMonthAgo;
    }
    
    return searchMatch && statusMatch && dateMatch;
  });

  // Exporter les commandes au format CSV
  const exportToCSV = () => {
    // En-têtes CSV
    const headers = [
      'Numéro de commande',
      'Date',
      'Nom',
      'Email',
      'Téléphone',
      'Adresse',
      'Produits',
      'Montant',
      'Statut'
    ].join(',');
    
    // Lignes de données
    const rows = filteredOrders.map(order => {
      const products = order.products.map(p => `${p.title} (x${p.quantity})`).join(' | ');
      const date = format(order.createdAt, 'dd/MM/yyyy');
      const status = order.status === 'paid' ? 'Payée' : 'En attente';
      
      return [
        order.orderId,
        date,
        order.userName,
        order.email,
        order.phone || '',
        `"${order.address}, ${order.postalCode} ${order.city}, ${order.country}"`,
        `"${products}"`,
        `${order.total.toFixed(2)} €`,
        status
      ].join(',');
    }).join('\n');
    
    // Contenu complet du CSV
    const csvContent = `${headers}\n${rows}`;
    
    // Créer un blob et un lien de téléchargement
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `commandes_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Retour au tableau de bord
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
              <Package className="w-8 h-8" />
              Gestion des commandes
            </h1>
          </div>
        </div>

        {/* Filtres et recherche */}
        <Card className="p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="paid">Payées</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les dates</SelectItem>
                  <SelectItem value="today">Aujourd'hui</SelectItem>
                  <SelectItem value="week">7 derniers jours</SelectItem>
                  <SelectItem value="month">30 derniers jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={exportToCSV}
            >
              <FileDown className="w-5 h-5" />
              Exporter CSV
            </Button>
          </div>
        </Card>

        {/* Liste des commandes */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500">Aucune commande ne correspond à vos critères de recherche.</p>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Accordion type="single" collapsible key={order.id}>
                <AccordionItem value={order.id} className="border rounded-lg bg-white overflow-hidden">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline">
                    <div className="flex flex-col md:flex-row md:items-center justify-between w-full text-left gap-4">
                      <div className="flex items-center gap-3">
                        {order.status === 'paid' ? (
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium">{order.orderId}</p>
                          <p className="text-sm text-gray-500">
                            {format(order.createdAt, 'dd MMMM yyyy', { locale: fr })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium">{order.userName}</p>
                          <p className="text-sm text-gray-500">{order.email}</p>
                        </div>
                      </div>
                      
                      <div className="font-bold text-primary">
                        {order.total.toFixed(2)} €
                      </div>
                    </div>
                  </AccordionTrigger>
                  
                  <AccordionContent className="px-6 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Informations client */}
                      <div>
                        <h3 className="font-semibold mb-2">Informations client</h3>
                        <div className="space-y-2 text-sm">
                          <p><span className="font-medium">Nom:</span> {order.userName}</p>
                          <p><span className="font-medium">Email:</span> {order.email}</p>
                          {order.phone && (
                            <p><span className="font-medium">Téléphone:</span> {order.phone}</p>
                          )}
                          <p><span className="font-medium">Adresse:</span> {order.address}</p>
                          <p><span className="font-medium">Ville:</span> {order.city}</p>
                          <p><span className="font-medium">Code postal:</span> {order.postalCode}</p>
                          <p><span className="font-medium">Pays:</span> {order.country}</p>
                        </div>
                      </div>
                      
                      {/* Détails de la commande */}
                      <div>
                        <h3 className="font-semibold mb-2">Détails de la commande</h3>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            {order.products.map((product) => (
                              <div key={product.id} className="flex justify-between text-sm">
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
                          
                          <div className="pt-2">
                            <p className="text-sm">
                              <span className="font-medium">Statut:</span>{' '}
                              <span className={order.status === 'paid' ? 'text-green-600' : 'text-red-600'}>
                                {order.status === 'paid' ? 'Payée' : 'En attente'}
                              </span>
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">Date:</span>{' '}
                              {format(order.createdAt, 'dd MMMM yyyy à HH:mm', { locale: fr })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="mt-6 flex justify-end">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="flex items-center gap-2">
                            <Printer className="w-4 h-4" />
                            Imprimer l'étiquette
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Étiquette d'expédition</DialogTitle>
                          </DialogHeader>
                          <div className="p-4 border rounded-md" id={`shipping-label-${order.id}`}>
                            <div className="text-center space-y-4 p-4" style={{ width: '148mm', height: '105mm' }}>
                              <h2 className="text-xl font-bold">Parent'aile</h2>
                              <div className="text-lg font-medium">{order.userName}</div>
                              <div className="whitespace-pre-line">
                                {order.address}<br />
                                {order.postalCode} {order.city}<br />
                                {order.country}
                              </div>
                              {order.phone && (
                                <div>{order.phone}</div>
                              )}
                              <div className="text-sm mt-4">
                                Commande: {order.orderId}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-4">
                            <Button variant="outline" onClick={() => {
                              const printContent = document.getElementById(`shipping-label-${order.id}`);
                              if (printContent) {
                                const printWindow = window.open('', '_blank');
                                if (printWindow) {
                                  printWindow.document.write(`
                                    <html>
                                      <head>
                                        <title>Étiquette d'expédition</title>
                                        <style>
                                          body { font-family: Arial, sans-serif; }
                                          .container { width: 148mm; height: 105mm; padding: 10mm; }
                                          .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10mm; }
                                          .address { text-align: center; font-size: 16px; margin-bottom: 5mm; }
                                          .order-id { text-align: center; font-size: 12px; margin-top: 10mm; }
                                          @media print {
                                            @page { size: A6; margin: 0; }
                                            body { margin: 0; }
                                          }
                                        </style>
                                      </head>
                                      <body>
                                        <div class="container">
                                          <div class="header">Parent'aile</div>
                                          <div class="address">
                                            ${order.userName}<br>
                                            ${order.address}<br>
                                            ${order.postalCode} ${order.city}<br>
                                            ${order.country}<br>
                                            ${order.phone ? order.phone + '<br>' : ''}
                                          </div>
                                          <div class="order-id">Commande: ${order.orderId}</div>
                                        </div>
                                        <script>
                                          window.onload = function() { window.print(); window.close(); }
                                        </script>
                                      </body>
                                    </html>
                                  `);
                                  printWindow.document.close();
                                }
                              }
                            }}>
                              Format A6
                            </Button>
                            <Button variant="outline" onClick={() => {
                              const printContent = document.getElementById(`shipping-label-${order.id}`);
                              if (printContent) {
                                const printWindow = window.open('', '_blank');
                                if (printWindow) {
                                  printWindow.document.write(`
                                    <html>
                                      <head>
                                        <title>Étiquette d'expédition</title>
                                        <style>
                                          body { font-family: Arial, sans-serif; }
                                          .container { width: 210mm; height: 148mm; padding: 15mm; }
                                          .header { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 15mm; }
                                          .address { text-align: center; font-size: 18px; margin-bottom: 10mm; }
                                          .order-id { text-align: center; font-size: 14px; margin-top: 15mm; }
                                          @media print {
                                            @page { size: A5; margin: 0; }
                                            body { margin: 0; }
                                          }
                                        </style>
                                      </head>
                                      <body>
                                        <div class="container">
                                          <div class="header">Parent'aile</div>
                                          <div class="address">
                                            ${order.userName}<br>
                                            ${order.address}<br>
                                            ${order.postalCode} ${order.city}<br>
                                            ${order.country}<br>
                                            ${order.phone ? order.phone + '<br>' : ''}
                                          </div>
                                          <div class="order-id">Commande: ${order.orderId}</div>
                                        </div>
                                        <script>
                                          window.onload = function() { window.print(); window.close(); }
                                        </script>
                                      </body>
                                    </html>
                                  `);
                                  printWindow.document.close();
                                }
                              }
                            }}>
                              Format A5
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))
          )}
        </div>
        
        {/* Pagination ou "Charger plus" si nécessaire */}
        {filteredOrders.length > 0 && (
          <div className="mt-6 flex justify-center">
            <p className="text-sm text-gray-500">
              Affichage de {filteredOrders.length} commande(s) sur {orders.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
