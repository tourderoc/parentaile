import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Calendar } from "../../../components/ui/calendar";
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Trash2, Calendar as CalendarIcon, Loader2, AlertCircle } from 'lucide-react';

interface CancelSlotDialogProps {
  onSlotsDeleted: () => void;
}

interface Slot {
  id: string;
  date: Date;
  time: string;
  status: 'available' | 'reserved';
}

export const CancelSlotDialog: React.FC<CancelSlotDialogProps> = ({ onSlotsDeleted }) => {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAvailableSlots();
    }
  }, [open]);

  const fetchAvailableSlots = async () => {
    try {
      setLoading(true);
      setError(null);

      const now = new Date();
      const slotsQuery = query(
        collection(db, 'slots'),
        where('status', '==', 'available'),
        where('date', '>', Timestamp.fromDate(now))
      );

      const snapshot = await getDocs(slotsQuery);
      const slotsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate()
      })) as Slot[];

      setSlots(slotsData);
    } catch (error) {
      console.error('Error fetching slots:', error);
      setError('Une erreur est survenue lors du chargement des créneaux');
    } finally {
      setLoading(false);
    }
  };

  const handleSlotToggle = (slotId: string) => {
    const newSelected = new Set(selectedSlots);
    if (newSelected.has(slotId)) {
      newSelected.delete(slotId);
    } else {
      newSelected.add(slotId);
    }
    setSelectedSlots(newSelected);
  };

  const handleDeleteSlots = async () => {
    if (selectedSlots.size === 0) return;

    try {
      setDeleting(true);
      setError(null);

      const deletePromises = Array.from(selectedSlots).map(slotId =>
        deleteDoc(doc(db, 'slots', slotId))
      );

      await Promise.all(deletePromises);
      
      onSlotsDeleted();
      setOpen(false);
      setSelectedSlots(new Set());
      setShowConfirm(false);
    } catch (error) {
      console.error('Error deleting slots:', error);
      setError('Une erreur est survenue lors de la suppression des créneaux');
    } finally {
      setDeleting(false);
    }
  };

  const getSelectedDateSlots = () => {
    if (!selectedDate) return [];
    return slots.filter(slot => {
      const slotDate = new Date(slot.date);
      return slotDate.getDate() === selectedDate.getDate() &&
             slotDate.getMonth() === selectedDate.getMonth() &&
             slotDate.getFullYear() === selectedDate.getFullYear();
    });
  };

  return (
    <>
      <Button
        variant="outline"
        className="flex items-center gap-2"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-4 h-4" />
        Annuler des créneaux
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Annuler des créneaux disponibles</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="mb-4 flex items-center gap-2 text-primary">
                <CalendarIcon className="w-5 h-5" />
                <h3 className="font-medium">Sélectionnez une date</h3>
              </div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={fr}
                className="rounded-md border"
              />
            </div>

            <div>
              <h3 className="font-medium mb-4">Créneaux disponibles</h3>
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : selectedDate ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {getSelectedDateSlots().map((slot) => (
                    <div
                      key={slot.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSlots.has(slot.id)
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleSlotToggle(slot.id)}
                    >
                      <p className="font-medium">{slot.time}</p>
                    </div>
                  ))}
                  {getSelectedDateSlots().length === 0 && (
                    <p className="text-gray-500 text-center py-4">
                      Aucun créneau disponible pour cette date
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Veuillez sélectionner une date
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowConfirm(true)}
              disabled={selectedSlots.size === 0 || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                `Supprimer ${selectedSlots.size} créneau${selectedSlots.size > 1 ? 'x' : ''}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Êtes-vous sûr de vouloir supprimer {selectedSlots.size} créneau{selectedSlots.size > 1 ? 'x' : ''} ?
              Cette action est irréversible.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSlots}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Confirmer la suppression'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};