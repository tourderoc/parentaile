import React, { useState } from 'react';
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../components/ui/dialog";
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, Send, Check, X, Video } from 'lucide-react';
import { nanoid } from 'nanoid';

interface Workshop {
  id: string;
  title: string;
  date: Date;
  time: string;
  instructor: string;
  participants: string[];
  description?: string;
  feedback?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  meetingUrl?: string;
}

interface WorkshopDetailsDialogProps {
  workshop: Workshop;
  onClose: () => void;
  onStatusChange: () => void;
}

export const WorkshopDetailsDialog: React.FC<WorkshopDetailsDialogProps> = ({
  workshop,
  onClose,
  onStatusChange
}) => {
  const [feedback, setFeedback] = useState(workshop.feedback || '');
  const [saving, setSaving] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError(null);

      await updateDoc(doc(db, 'workshops', workshop.id), {
        status: 'completed',
        feedback,
        completedAt: serverTimestamp()
      });

      onStatusChange();
      onClose();
    } catch (error) {
      console.error('Error completing workshop:', error);
      setError('Une erreur est survenue lors de la finalisation de l\'atelier');
    } finally {
      setSaving(false);
    }
  };

  const handleSendReminder = async () => {
    try {
      setSendingReminder(true);
      setError(null);

      const notificationPromises = workshop.participants.map(userId =>
        addDoc(collection(db, 'notifications'), {
          userId,
          title: 'Rappel d\'atelier',
          message: `L'atelier "${workshop.title}" commence dans 15 minutes.`,
          type: 'info',
          category: 'workshop',
          createdAt: serverTimestamp(),
          read: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        })
      );

      await Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error sending reminders:', error);
      setError('Une erreur est survenue lors de l\'envoi des rappels');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleGenerateLink = async () => {
    try {
      setGeneratingLink(true);
      setError(null);

      const meetingUrl = `https://meet.jit.si/parentaile-workshop-${nanoid(10)}`;
      
      await updateDoc(doc(db, 'workshops', workshop.id), {
        meetingUrl,
        updatedAt: serverTimestamp()
      });

      // Send notifications to all participants
      const notificationPromises = workshop.participants.map(userId =>
        addDoc(collection(db, 'notifications'), {
          userId,
          title: 'Lien visio disponible',
          message: `Le lien de visioconférence pour l'atelier "${workshop.title}" est maintenant disponible.`,
          type: 'info',
          category: 'workshop',
          createdAt: serverTimestamp(),
          read: false,
          expiresAt: new Date(workshop.date.getTime() + 24 * 60 * 60 * 1000) // 24h after workshop
        })
      );

      await Promise.all(notificationPromises);
      onStatusChange();
      onClose();
    } catch (error) {
      console.error('Error generating meeting link:', error);
      setError('Une erreur est survenue lors de la génération du lien');
    } finally {
      setGeneratingLink(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Détails de l'atelier</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <h3 className="font-medium mb-2">Informations</h3>
            <div className="space-y-2 text-gray-600">
              <p><span className="font-medium">Titre :</span> {workshop.title}</p>
              <p>
                <span className="font-medium">Date :</span>{' '}
                {format(workshop.date, 'EEEE d MMMM yyyy', { locale: fr })}
              </p>
              <p><span className="font-medium">Heure :</span> {workshop.time}</p>
              <p>
                <span className="font-medium">Intervenant :</span>{' '}
                {workshop.instructor === 'admin' ? 'Moi' : workshop.instructor}
              </p>
              {workshop.description && (
                <p><span className="font-medium">Description :</span> {workshop.description}</p>
              )}
              {workshop.meetingUrl && (
                <p>
                  <span className="font-medium">Lien visio :</span>{' '}
                  <a 
                    href={workshop.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {workshop.meetingUrl}
                  </a>
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Participants ({workshop.participants.length})</h3>
            {workshop.participants.length > 0 ? (
              <div className="space-y-2">
                <ul className="space-y-1 text-gray-600">
                  {workshop.participants.map((participant, index) => (
                    <li key={participant}>Participant {index + 1}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSendReminder}
                    disabled={sendingReminder}
                    className="flex-1"
                  >
                    {sendingReminder ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Envoi des rappels...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Envoyer un rappel à tous
                      </>
                    )}
                  </Button>
                  {!workshop.meetingUrl && (
                    <Button
                      onClick={handleGenerateLink}
                      disabled={generatingLink}
                      className="flex-1 bg-primary hover:bg-primary/90"
                    >
                      {generatingLink ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Génération...
                        </>
                      ) : (
                        <>
                          <Video className="w-4 h-4 mr-2" />
                          Générer le lien visio
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Aucun participant inscrit</p>
            )}
          </div>

          {workshop.status !== 'completed' && (
            <div>
              <h3 className="font-medium mb-2">Retour sur l'atelier</h3>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Notes et observations sur l'atelier..."
                className="min-h-[150px]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            <X className="w-4 h-4 mr-2" />
            Fermer
          </Button>
          {workshop.status !== 'completed' && (
            <Button
              onClick={handleComplete}
              disabled={saving}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Finalisation...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Marquer comme terminé
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};