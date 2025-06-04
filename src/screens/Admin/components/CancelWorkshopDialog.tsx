import React, { useState } from 'react';
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../components/ui/dialog";
import { doc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Loader2, AlertCircle } from 'lucide-react';

interface Workshop {
  id: string;
  title: string;
  date: Date;
  time: string;
  participants: string[];
}

interface CancelWorkshopDialogProps {
  workshop: Workshop;
  onClose: () => void;
  onCancelled: () => void;
}

export const CancelWorkshopDialog: React.FC<CancelWorkshopDialogProps> = ({
  workshop,
  onClose,
  onCancelled
}) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);

      // Create notifications for all participants
      const notificationPromises = workshop.participants.map(userId =>
        addDoc(collection(db, 'notifications'), {
          userId,
          title: 'Atelier annulé',
          message: `L'atelier "${workshop.title}" prévu le ${workshop.date.toLocaleDateString('fr-FR')} à ${workshop.time} a été annulé.`,
          type: 'warning',
          category: 'workshop',
          createdAt: serverTimestamp(),
          read: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        })
      );

      await Promise.all([
        ...notificationPromises,
        deleteDoc(doc(db, 'workshops', workshop.id))
      ]);

      onCancelled();
      onClose();
    } catch (error) {
      console.error('Error cancelling workshop:', error);
      setError('Une erreur est survenue lors de l\'annulation de l\'atelier');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler l'atelier</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <p className="text-gray-600">
            Êtes-vous sûr de vouloir annuler cet atelier ? Cette action est irréversible et 
            tous les participants seront notifiés de l'annulation.
          </p>

          <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2">Détails de l'atelier :</h4>
            <ul className="space-y-1 text-sm text-yellow-800">
              <li>Titre : {workshop.title}</li>
              <li>Date : {workshop.date.toLocaleDateString('fr-FR')}</li>
              <li>Heure : {workshop.time}</li>
              <li>Participants inscrits : {workshop.participants.length}</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleting}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Annulation...
              </>
            ) : (
              'Confirmer l\'annulation'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};