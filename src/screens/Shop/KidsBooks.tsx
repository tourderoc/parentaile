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
  age_range: string;
  price: number;
  amazon_link: string;
  image_url: string;
  themes: string[];
  emotions: string[];
  added_date: Date;
}

const ageRanges = [
  '0-3 ans',
  '3-6 ans',
  '6-9 ans',
  '9-12 ans',
  '12+ ans'
];

const emotions = [
  'Joie',
  'Tristesse',
  'Colère',
  'Peur',
  'Confiance'
];

const themes = [
  'Famille',
  'École',
  'Amitié',
  'Nature',
  'Aventure'
];

export const KidsBooks = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgeRange, setSelectedAgeRange] = useState<string | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksQuery = query(
          collection(db, 'livres_enfants'),
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
    const matchesAge = !selectedAgeRange || book.age_range === selectedAgeRange;
    const matchesEmotion = !selectedEmotion || book.emotions.includes(selectedEmotion);
    const matchesTheme = !selectedTheme || book.themes.includes(selectedTheme);

    return matchesSearch && matchesAge && matchesEmotion && matchesTheme;
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
            📚 Livres pour enfants
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
                value={selectedAgeRange || ''}
                onChange={(e) => setSelectedAgeRange(e.target.value || null)}
                className="border rounded-md px-3 py-2"
              >
                <option value="">Âge</option>
                {ageRanges.map(range => (
                  <option key={range} value={range}>{range}</option>
                ))}
              </select>
              <select
                value={selectedEmotion || ''}
                onChange={(e) => setSelectedEmotion(e.target.value || null)}
                className="border rounded-md px-3 py-2"
              >
                <option value="">Émotions</option>
                {emotions.map(emotion => (
                  <option key={emotion} value={emotion}>{emotion}</option>
                ))}
              </select>
              <select
                value={selectedTheme || ''}
                onChange={(e) => setSelectedTheme(e.target.value || null)}
                className="border rounded-md px-3 py-2"
              >
                <option value="">Thématiques</option>
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
                <div className="h-48 relative">
                  <img
                    src={book.image_url}
                    alt={book.title}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2 line-clamp-2">{book.title}</h3>
                  <p className="text-sm text-gray-600 mb-2">{book.age_range}</p>
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
        </div>
      </div>
    </div>
  );
};