import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { BooksSection } from './components/BooksSection';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Book {
  id: string;
  title: string;
  short_description: string;
  age_range: string;
  price: number;
  added_date: Date;
  type?: 'kids' | 'parents';
}

export const BooksPage = () => {
  const [kidsBooks, setKidsBooks] = useState<Book[]>([]);
  const [parentsBooks, setParentsBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const [kidsBooksSnapshot, parentsBooksSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'livres_enfants'), orderBy('added_date', 'desc'))),
          getDocs(query(collection(db, 'livres_parents'), orderBy('added_date', 'desc')))
        ]);
        
        const fetchedKidsBooks = kidsBooksSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          added_date: doc.data().added_date.toDate(),
          type: 'kids'
        })) as Book[];

        const fetchedParentsBooks = parentsBooksSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          added_date: doc.data().added_date.toDate(),
          type: 'parents'
        })) as Book[];

        setKidsBooks(fetchedKidsBooks);
        setParentsBooks(fetchedParentsBooks);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching books:', error);
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const handleBookAdded = async () => {
    try {
      const [kidsBooksSnapshot, parentsBooksSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'livres_enfants'), orderBy('added_date', 'desc'))),
        getDocs(query(collection(db, 'livres_parents'), orderBy('added_date', 'desc')))
      ]);
      
      setKidsBooks(kidsBooksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        added_date: doc.data().added_date.toDate(),
        type: 'kids'
      })) as Book[]);

      setParentsBooks(parentsBooksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        added_date: doc.data().added_date.toDate(),
        type: 'parents'
      })) as Book[]);
    } catch (error) {
      console.error('Error refreshing books:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Retour au tableau de bord
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-primary">
              Gérer les livres
            </h1>
          </div>
        </div>

        <BooksSection books={kidsBooks} onBookAdded={handleBookAdded} type="kids" />
        <BooksSection books={parentsBooks} onBookAdded={handleBookAdded} type="parents" />
      </div>
    </div>
  );
};