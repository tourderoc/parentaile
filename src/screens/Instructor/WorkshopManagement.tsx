import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Textarea } from "../../components/ui/textarea";
import { format, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Video, Check, Send, Loader2, AlertCircle } from 'lucide-react';
import { nanoid } from 'nanoid';
import { WorkshopDialog } from '../Admin/components/WorkshopDialog';

interface Workshop {
  id: string;
  title: string;
  date: Date;
  time: string;
  instructor: string;
  participants: string[];
  description?: string;
  meetingUrl?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  feedback?: string;
}

export const WorkshopManagement = () => {
  const navigate = useNavigate();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPastWorkshops, setShowPastWorkshops] = useState(false);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate('/');
          return;
        }

        const userDoc = await getDocs(query(
          collection(db, 'users'),
          where('uid', '==', user.uid),
          where('role', '==', 'hanene')
        ));

        if (userDoc.empty) {
          navigate('/');
          return;
        }

        fetchWorkshops();
      } catch (error) {
        console.error('Error checking access:', error);
        navigate('/');
      }
    };

    checkAccess();
  }, [navigate]);

  const fetchWorkshops = async () => {
    try {
      setLoading(true);
      const workshopsQuery = query(
        collection(db, 'workshops'),
        where('instructor', '==', 'hanene'),
        orderBy('date', 'desc')
      );

      const snapshot = await getDocs(workshopsQuery);
      const workshopsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate()
      })) as Workshop[];

      setWorkshops(workshopsData);
    } catch (error) {
      console.error('Error fetching workshops:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = async (workshop: Workshop) => {
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
          expiresAt: new Date(workshop.date.getTime() + 24 * 60 * 60 * 1000)
        })
      );

      await Promise.all(notificationPromises);
      fetchWorkshops();
    } catch (error) {
      console.error('Error generating meeting link:', error);
      setError('Une erreur est survenue lors de la génération du lien');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleSendReminder = async (workshop: Workshop) => {
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
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
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

  const handleComplete = async (workshop: Workshop) => {
    try {
      setSaving(true);
      setError(null);

      await updateDoc(doc(db, 'workshops', workshop.id), {
        status: 'completed',
        feedback,
        completedAt: serverTimestamp()
      });

      // Send notifications to all participants
      const notificationPromises = workshop.participants.map(userId =>
        addDoc(collection(db, 'notifications'), {
          userId,
          title: 'Atelier terminé',
          message: `L'atelier "${workshop.title}" est maintenant terminé.`,
          type: 'info',
          category: 'workshop',
          createdAt: serverTimestamp(),
          read: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })
      );

      await Promise.all(notificationPromises);
      setSelectedWorkshop(null);
      fetchWorkshops();
    } catch (error) {
      console.error('Error completing workshop:', error);
      setError('Une erreur est survenue lors de la finalisation de l\'atelier');
    } finally {
      setSaving(false);
    }
  };

  const now = new Date();
  const filteredWorkshops = workshops.filter(workshop => {
    if (workshop.status === 'cancelled') return false;
    
    const workshopDate = new Date(workshop.date);
    workshopDate.setHours(parseInt(workshop.time.split(':')[0]));
    workshopDate.setMinutes(parseInt(workshop.time.split(':')[1]));
    return showPastWorkshops ? isBefore(workshopDate, now) : !isBefore(workshopDate, now);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </Link>
          <div className="flex gap-2">
            <WorkshopDialog onAddWorkshop={async (workshop) => {
              try {
                const workshopData = {
                  ...workshop,
                  participants: [],
                  maxParticipants: 7,
                  duration: 45,
                  breakDuration: 5,
                  createdAt: serverTimestamp(),
                  createdBy: auth.currentUser?.uid
                };

                const docRef = await addDoc(collection(db, 'workshops'), workshopData);
                await fetchWorkshops();
              } catch (error) {
                console.error('Error adding workshop:', error);
                setError('Une erreur est survenue lors de la création de l\'atelier');
              }
            }} />
            <Button
              variant={showPastWorkshops ? 'default' : 'outline'}
              onClick={() => setShowPastWorkshops(true)}
            >
              Ateliers passés
            </Button>
            <Button
              variant={!showPastWorkshops ? 'default' : 'outline'}
              onClick={() => setShowPastWorkshops(false)}
            >
              Ateliers à venir
            </Button>
          </div>
        </div>

        <Card className="p-6">
          <h1 className="text-2xl font-bold text-primary mb-6">
            Mes ateliers
          </h1>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {filteredWorkshops.map((workshop) => (
                <Card key={workshop.id} className="p-4">
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="font-semibold mb-1">{workshop.title}</h3>
                      <p className="text-gray-600">
                        {format(workshop.date, 'EEEE d MMMM yyyy', { locale: fr })} à {workshop.time}
                      </p>
                      <p className="text-gray-600">
                        Participants : {workshop.participants.length}
                      </p>
                      {workshop.description && (
                        <p className="text-gray-600 mt-2">{workshop.description}</p>
                      )}
                    </div>

                    {!showPastWorkshops && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleSendReminder(workshop)}
                          disabled={sendingReminder}
                        >
                          {sendingReminder ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Envoi des rappels...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Envoyer un rappel
                            </>
                          )}
                        </Button>

                        {workshop.meetingUrl ? (
                          <a
                            href={workshop.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline">
                              <Video className="w-4 h-4 mr-2" />
                              Voir le lien
                            </Button>
                          </a>
                        ) : (
                          <Button
                            onClick={() => handleGenerateLink(workshop)}
                            disabled={generatingLink}
                            className="bg-primary hover:bg-primary/90"
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

                        {workshop.status !== 'completed' && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedWorkshop(workshop);
                              setFeedback(workshop.feedback || '');
                            }}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Marquer comme terminé
                          </Button>
                        )}
                      </div>
                    )}

                    {showPastWorkshops && workshop.feedback && (
                      <div className="mt-2">
                        <h4 className="font-medium mb-2">Retour sur l'atelier :</h4>
                        <p className="text-gray-600">{workshop.feedback}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}

              {filteredWorkshops.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Aucun atelier {showPastWorkshops ? 'passé' : 'à venir'}
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {selectedWorkshop && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg p-6">
              <h2 className="text-xl font-bold mb-4">Finaliser l'atelier</h2>
              <div className="space-y-4">
                <div>
                  <label className="block font-medium mb-2">
                    Retour sur l'atelier
                  </label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Notes et observations sur l'atelier..."
                    className="min-h-[150px]"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedWorkshop(null);
                      setFeedback('');
                    }}
                    disabled={saving}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={() => handleComplete(selectedWorkshop)}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Finalisation...
                      </>
                    ) : (
                      'Terminer l\'atelier'
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};