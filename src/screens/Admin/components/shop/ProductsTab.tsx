import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { AlertCircle, Package, Pencil, Loader2, Plus, Minus } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  price: number;
  stock: number;
  image_url: string;
  added_date: Date;
}

export const ProductsTab = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const productsQuery = query(
          collection(db, 'livres_enfants'),
          orderBy('added_date', 'desc')
        );

        const snapshot = await getDocs(productsQuery);
        const productsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          added_date: doc.data().added_date.toDate(),
          stock: doc.data().stock || 0
        })) as Product[];

        setProducts(productsData);
      } catch (error) {
        console.error('Error fetching products:', error);
        setError('Une erreur est survenue lors du chargement des produits');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleUpdateStock = async (productId: string, newStock: number) => {
    try {
      setSaving(true);
      setError(null);

      const productRef = doc(db, 'livres_enfants', productId);
      await updateDoc(productRef, {
        stock: newStock
      });

      setProducts(products.map(product =>
        product.id === productId
          ? { ...product, stock: newStock }
          : product
      ));
    } catch (error) {
      console.error('Error updating stock:', error);
      setError('Une erreur est survenue lors de la mise à jour du stock');
    } finally {
      setSaving(false);
      setEditingProduct(null);
    }
  };

  const handleQuickStockUpdate = async (productId: string, increment: number) => {
    try {
      const product = products.find(p => p.id === productId);
      if (!product) return;

      const newStock = Math.max(0, product.stock + increment);
      await handleUpdateStock(productId, newStock);
    } catch (error) {
      console.error('Error updating stock:', error);
      setError('Une erreur est survenue lors de la mise à jour du stock');
    }
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
        {products.map((product) => (
          <Card key={product.id} className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16">
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full h-full object-cover rounded"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{product.title}</h3>
                <p className="text-gray-600">{product.price.toFixed(2)} €</p>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-500" />
                    <span className={`text-sm ${
                      product.stock < 5 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      Stock : {product.stock}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickStockUpdate(product.id, -1)}
                      disabled={product.stock === 0}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickStockUpdate(product.id, 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingProduct(product)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le stock</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="py-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Stock actuel
                  </label>
                  <Input
                    type="number"
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({
                      ...editingProduct,
                      stock: parseInt(e.target.value)
                    })}
                    min="0"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditingProduct(null)}
                    disabled={saving}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={() => handleUpdateStock(editingProduct.id, editingProduct.stock)}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      'Enregistrer'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};