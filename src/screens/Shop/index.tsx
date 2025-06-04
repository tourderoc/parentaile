import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { ArrowLeft, Search, Filter, Clock, Home, ChevronLeft, ChevronRight, Loader2, ShoppingBag } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

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

const categories = [
  { id: 'kids', label: 'Livres enfants', path: '/boutique/livres-enfants' },
  { id: 'parents', label: 'Livres parents', path: '/boutique/livres-parents' },
  { id: 'apps', label: 'Applications', path: '/boutique/coming-soon/apps' },
  { id: 'games', label: 'Jeux', disabled: true },
  { id: 'videos', label: 'Vidéos', disabled: true },
  { id: 'free', label: 'Gratuits', disabled: true },
  { id: 'other', label: 'Autres produits', disabled: true },
];

export default function Shop() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksQuery = query(
          collection(db, 'livres_enfants'),
          where('isNew', '==', true),
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

  const handleCategoryClick = (path: string) => {
    navigate(path);
  };

  const filteredBooks = books.filter(book => 
    book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    book.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const newBooks = books.slice(0, 5);

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
          <Link to="/">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
            <ShoppingBag className="w-8 h-8" />
            📚 La Boutique Parent'aile
          </h1>
        </div>

        {/* Categories Navigation */}
        <nav className="mb-8 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {categories.map(category => (
              <Button
                key={category.id}
                variant="outline"
                onClick={() => !category.disabled && handleCategoryClick(category.path)}
                disabled={category.disabled}
              >
                {category.label}
                {category.disabled && <span className="ml-2 text-xs">(à venir)</span>}
              </Button>
            ))}
          </div>
        </nav>

        {/* Search */}
        <div className="bg-white rounded-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Rechercher un produit..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        {/* New Books Carousel */}
        {newBooks.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">🆕 Nouveautés</h2>
            <Swiper
              modules={[Navigation, Pagination]}
              spaceBetween={20}
              slidesPerView={1}
              navigation
              pagination={{ clickable: true }}
              breakpoints={{
                640: { slidesPerView: 2 },
                768: { slidesPerView: 3 },
                1024: { slidesPerView: 4 }
              }}
              className="pb-10"
            >
              {newBooks.map((book) => (
                <SwiperSlide key={book.id}>
                  <Link to={`/boutique/livre/${book.id}`}>
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
                        <p className="text-primary font-bold">{book.price.toFixed(2)} €</p>
                      </div>
                    </Card>
                  </Link>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}

        {/* Featured Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.slice(0, 3).map(category => (
            <Card 
              key={category.id}
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => !category.disabled && handleCategoryClick(category.path)}
            >
              <h3 className="text-xl font-semibold mb-4">{category.label}</h3>
              <p className="text-gray-600 mb-4">
                {category.id === 'kids' && "Découvrez notre sélection de livres pour enfants"}
                {category.id === 'parents' && "Des ressources pour vous accompagner"}
                {category.id === 'apps' && "Applications éducatives et ludiques"}
              </p>
              <Button 
                className="w-full"
                disabled={category.disabled}
              >
                Découvrir
                {category.disabled && " (bientôt disponible)"}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export { Shop }