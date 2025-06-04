import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, ExternalLink, ShoppingBag } from 'lucide-react';
import { useCartStore } from '../../lib/cart';

interface Book {
  id: string;
  title: string;
  description: string;
  age_range: string;
  price: number;
  amazon_link: string;
  image_url: string;
  themes: string[];
  emotions: string[];
  added_date: Date;
  stock: number;
}

export const BookDetails = () => {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((state) => state.addItem);

  useEffect(() => {
    const fetchBook = async () => {
      if (!id) return;

      try {
        const bookDoc = await getDoc(doc(db, 'livres_enfants', id));
        if (bookDoc.exists()) {
          setBook({
            id: bookDoc.id,
            ...bookDoc.data(),
            added_date: bookDoc.data().added_date.toDate()
          } as Book);
        }
      } catch (error) {
        console.error('Error fetching book:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  const handleAddToCart = () => {
    if (!book) return;
    
    addItem({
      id: book.id,
      title: book.title,
      price: book.price,
      quantity: 1,
      image_url: book.image_url
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Livre non trouvé</h1>
          <Link to="/boutique">
            <Button>Retour à la boutique</Button>
          </Link>
        </div>
      </div>
    );
  }

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
        </div>

        <Card className="p-6 md:p-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <img
                src={book.image_url}
                alt={book.title}
                className="w-full rounded-lg shadow-lg"
              />
            </div>

            <div>
              <h1 className="text-2xl font-bold mb-4">{book.title}</h1>
              
              <div className="space-y-4 mb-6">
                <p className="text-lg font-medium">
                  Âge recommandé : {book.age_range}
                </p>
                <p className="text-3xl font-bold text-primary">
                  {book.price.toFixed(2)} €
                </p>
                {book.stock > 0 ? (
                  <p className="text-green-600">
                    En stock ({book.stock} disponible{book.stock > 1 ? 's' : ''})
                  </p>
                ) : (
                  <p className="text-red-600">Rupture de stock</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {book.themes.map((theme) => (
                  <span
                    key={theme}
                    className="bg-primary/10 text-primary px-3 py-1 rounded-full"
                  >
                    {theme}
                  </span>
                ))}
              </div>

              <div className="space-y-4 mb-8">
                <h2 className="text-lg font-semibold">Description</h2>
                <p className="text-gray-600 whitespace-pre-wrap">
                  {book.description}
                </p>
              </div>

              <div className="space-y-3">
                <a
                  href={book.amazon_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-full flex items-center justify-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Acheter sur Amazon
                  </Button>
                </a>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddToCart}
                  disabled={book.stock === 0}
                >
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  {book.stock > 0 ? 'Ajouter au panier' : 'Indisponible'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};