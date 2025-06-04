import React, { useState } from 'react';
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { AddBookDialog } from './AddBookDialog';
import { Book, Trash2, ArrowDown, Pencil, Loader2, Plus, Minus, Package } from 'lucide-react';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

interface Book {
  id: string;
  title: string;
  short_description: string;
  description: string;
  age_range: string;
  price: number;
  added_date: Date;
  amazon_link?: string;
  image_url?: string;
  themes?: string[];
  emotions?: string[];
  isNew?: boolean;
  type?: 'kids' | 'parents';
  stock: number;
}

interface BooksSectionProps {
  books: Book[];
  onBookAdded: () => void;
  type?: 'kids' | 'parents';
}

const ageRanges = ['3-5 ans', '6-9 ans', '9-12 ans'];

export const BooksSection: React.FC<BooksSectionProps> = ({ books, onBookAdded, type = 'kids' }) => {
  const [activeSection, setActiveSection] = useState<'nouveautes' | 'tous'>('nouveautes');
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce livre ?')) {
      return;
    }

    try {
      const collection = type === 'kids' ? 'livres_enfants' : 'livres_parents';
      await deleteDoc(doc(db, collection, bookId));
      onBookAdded();
    } catch (error) {
      console.error('Error deleting book:', error);
      alert('Une erreur est survenue lors de la suppression du livre');
    }
  };

  const handleRemoveFromNew = async (bookId: string) => {
    try {
      const collection = type === 'kids' ? 'livres_enfants' : 'livres_parents';
      const bookRef = doc(db, collection, bookId);
      await updateDoc(bookRef, {
        isNew: false
      });

      onBookAdded();
    } catch (error) {
      console.error('Error removing book from new:', error);
      alert('Une erreur est survenue lors du retrait du livre des nouveautés');
    }
  };

  const handleUpdateStock = async (bookId: string, increment: number) => {
    try {
      const collection = type === 'kids' ? 'livres_enfants' : 'livres_parents';
      const bookRef = doc(db, collection, bookId);
      const book = books.find(b => b.id === bookId);
      if (!book) return;

      const newStock = Math.max(0, book.stock + increment);
      await updateDoc(bookRef, {
        stock: newStock
      });

      onBookAdded();
    } catch (error) {
      console.error('Error updating stock:', error);
      setError('Une erreur est survenue lors de la mise à jour du stock');
    }
  };

  const handleEditSubmit = async () => {
    if (!editingBook) return;

    try {
      setSaving(true);
      setError(null);

      // Validate price
      const price = parseFloat(editingBook.price.toString());
      if (isNaN(price) || price <= 0 || price > 100) {
        setError('Le prix doit être compris entre 0 et 100 €');
        return;
      }

      // Update the book
      const collection = type === 'kids' ? 'livres_enfants' : 'livres_parents';
      const bookRef = doc(db, collection, editingBook.id);
      await updateDoc(bookRef, {
        title: editingBook.title,
        short_description: editingBook.short_description,
        description: editingBook.description,
        age_range: editingBook.age_range,
        price: price,
        image_url: editingBook.image_url,
        stock: parseInt(editingBook.stock.toString())
      });

      setEditingBook(null);
      onBookAdded();
    } catch (error) {
      console.error('Error updating book:', error);
      setError('Une erreur est survenue lors de la modification du livre');
    } finally {
      setSaving(false);
    }
  };

  // Filter books based on the active section
  const displayedBooks = books.filter(book => 
    activeSection === 'nouveautes' ? book.isNew : true
  );

  return (
    <Card className="p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Book className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-primary">
            Gérer les livres {type === 'kids' ? 'enfants' : 'parents'}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg overflow-hidden border">
            <Button
              variant={activeSection === 'nouveautes' ? 'default' : 'ghost'}
              className="rounded-none"
              onClick={() => setActiveSection('nouveautes')}
            >
              Nouveautés
            </Button>
            <Button
              variant={activeSection === 'tous' ? 'default' : 'ghost'}
              className="rounded-none"
              onClick={() => setActiveSection('tous')}
            >
              Tous les livres
            </Button>
          </div>
          <AddBookDialog onBookAdded={onBookAdded} type={type} />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-4">Titre</th>
              <th className="text-left py-3 px-4">Description</th>
              <th className="text-left py-3 px-4">Âge</th>
              <th className="text-right py-3 px-4">Prix</th>
              <th className="text-right py-3 px-4">Stock</th>
              <th className="text-right py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedBooks.map((book) => (
              <tr key={book.id} className="border-b">
                <td className="py-3 px-4">{book.title}</td>
                <td className="py-3 px-4">{book.short_description}</td>
                <td className="py-3 px-4">{book.age_range}</td>
                <td className="py-3 px-4 text-right">{book.price.toFixed(2)} €</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStock(book.id, -1)}
                      disabled={book.stock === 0}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className={book.stock < 5 ? 'text-red-600' : ''}>
                      {book.stock}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStock(book.id, 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => setEditingBook(book)}
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {activeSection === 'nouveautes' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-500 hover:text-green-700 hover:bg-green-50"
                        onClick={() => handleRemoveFromNew(book.id)}
                        title="Retirer des nouveautés"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteBook(book.id)}
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editingBook} onOpenChange={(open) => !open && setEditingBook(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Modifier le livre</DialogTitle>
          </DialogHeader>

          {editingBook && (
            <div className="py-4">
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Titre</label>
                  <Input
                    value={editingBook.title}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, title: e.target.value } : null)}
                    placeholder="Titre du livre"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description courte</label>
                  <Input
                    value={editingBook.short_description}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, short_description: e.target.value } : null)}
                    placeholder="Description courte (max 100 caractères)"
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description complète</label>
                  <Textarea
                    value={editingBook.description}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Description détaillée du livre"
                    className="min-h-[150px]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Tranche d'âge</label>
                    <Select
                      value={editingBook.age_range}
                      onValueChange={(value) => setEditingBook(prev => prev ? { ...prev, age_range: value } : null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une tranche d'âge" />
                      </SelectTrigger>
                      <SelectContent>
                        {ageRanges.map((range) => (
                          <SelectItem key={range} value={range}>
                            {range}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Prix (€)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editingBook.price}
                      onChange={(e) => setEditingBook(prev => prev ? { ...prev, price: parseFloat(e.target.value) } : null)}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Stock</label>
                    <Input
                      type="number"
                      min="0"
                      value={editingBook.stock}
                      onChange={(e) => setEditingBook(prev => prev ? { ...prev, stock: parseInt(e.target.value) } : null)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">URL de l'image</label>
                  <Input
                    value={editingBook.image_url}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, image_url: e.target.value } : null)}
                    placeholder="URL de l'image"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingBook(null)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={saving}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer les modifications'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};