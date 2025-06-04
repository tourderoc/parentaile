import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { ArrowLeft, Search } from 'lucide-react';

interface Book {
  id: string;
  title: string;
  description: string;
  short_description: string;
  author: string;
  price: number;
  amazon_link: string;
  image_url: string;
  themes: string[];
  added_date: Date;
}

const themes = [
  'Parentalité',
  'Éducation',
  'Développement',
  'Psychologie',
  'Santé',
  'Famille'
];

export const ParentsBooks = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksQuery = query(
          collection(db, 'livres_parents'),
          orderBy('added_date', 'desc')
        );

        const booksSnapshot = await getDocs(booksQuery);
        const booksData = booksSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          added_date: doc.data().added_date.toDate()
        })) as Book[];

        setBooks(booksData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching books:', error);
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         book.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTheme = !selectedTheme || book.themes.includes(selectedTheme);

    return matchesSearch && matchesTheme;
  });

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
        <div className="flex items-center gap-4 mb-8">
          <Link to="/boutique">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à la boutique
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">
            📚 Livres pour parents
          </h1>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Rechercher un livre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <div className="flex gap-4">
              <select
                value={selectedTheme || ''}
                onChange={(e) => setSelectedTheme(e.target.value || null)}
                className="border rounded-md px-3 py-2"
              >
                <option value="">Tous les thèmes</option>
                {themes.map(theme => (
                  <option key={theme} value={theme}>{theme}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Books Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredBooks.map((book) => (
            <Link key={book.id} to={`/boutique/livre/${book.id}`}>
              <Card className="h-full hover:shadow-lg transition-shadow">
                <img
                  src={book.image_url}
                  alt={book.title}
                  className="w-full h-48 object-cover rounded-t-lg"
                />
                <div className="p-4">
                  <h3 className="font-semibold mb-2 line-clamp-2">{book.title}</h3>
                  {book.author && (
                    <p className="text-sm text-gray-600 mb-2">Par {book.author}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {book.themes.slice(0, 2).map((theme) => (
                      <span
                        key={theme}
                        className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                  <p className="text-primary font-bold">{book.price.toFixed(2)} €</p>
                  <Button className="w-full mt-3">En savoir plus</Button>
                </div>
              </Card>
            </Link>
          ))}

          {filteredBooks.length === 0 && (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-600">Aucun livre trouvé</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};