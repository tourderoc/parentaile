import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { ArrowLeft, Users, Video, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Workshop {
  id: string;
  title: string;
  description?: string;
  date: Date;
  time: string;
  instructor: string;
  participants: string[];
  meetingUrl?: string;
}

export const Workshops = () => {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);

  useEffect(() => {
    const fetchWorkshops = async () => {
      try {
        const now = new Date();
        const workshopsQuery = query(
          collection(db, 'workshops'),
          where('date', '>=', now),
          orderBy('date', 'asc')
        );

        const workshopsSnapshot = await getDocs(workshopsQuery);
        const workshopsData = workshopsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date.toDate(),
          participants: doc.data().participants || []
        })) as Workshop[];

        setWorkshops(workshopsData);
      } catch (error) {
        console.error('Error fetching workshops:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkshops();
  }, []);

  const handleRegister = async (workshopId: string) => {
    if (!auth.currentUser) return;

    try {
      setRegistering(workshopId);
      const workshop = workshops.find(w => w.id === workshopId);
      
      if (!workshop || workshop.participants.length >= 7) return;

      const workshopRef = doc(db, 'workshops', workshopId);
      await updateDoc(workshopRef, {
        participants: [...workshop.participants, auth.currentUser.uid]
      });

      // Update local state
      setWorkshops(workshops.map(w => 
        w.id === workshopId 
          ? { ...w, participants: [...w.participants, auth.currentUser.uid] }
          : w
      ));
    } catch (error) {
      console.error('Error registering for workshop:', error);
    } finally {
      setRegistering(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Users className="w-8 h-8" />
            Ateliers à venir
          </h1>
        </div>

        <div className="grid gap-6">
          {workshops.length > 0 ? (
            workshops.map((workshop) => (
              <Card key={workshop.id} className="p-6">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold mb-2">{workshop.title}</h2>
                    <div className="space-y-2">
                      <p className="text-gray-600">
                        <span className="font-medium">Date :</span>{' '}
                        {format(workshop.date, "d MMMM yyyy 'à' ", { locale: fr })}
                        {workshop.time}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-medium">Intervenant :</span>{' '}
                        {workshop.instructor === 'admin' ? 'Parent\'aile' : workshop.instructor}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-medium">Places restantes :</span>{' '}
                        {7 - workshop.participants.length} / 7
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {auth.currentUser ? (
                      workshop.participants.includes(auth.currentUser.uid) ? (
                        <div className="text-center">
                          <div className="bg-green-50 text-green-600 px-4 py-2 rounded-lg mb-2">
                            Vous êtes inscrit(e)
                          </div>
                          {workshop.meetingUrl && (
                            <a
                              href={workshop.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-primary hover:underline justify-center"
                            >
                              <Video className="w-4 h-4" />
                              Rejoindre l'atelier
                            </a>
                          )}
                        </div>
                      ) : workshop.participants.length < 7 ? (
                        <div className="space-y-2">
                          <Button
                            onClick={() => handleRegister(workshop.id)}
                            disabled={registering === workshop.id}
                            className="bg-primary hover:bg-primary/90 w-full"
                          >
                            {registering === workshop.id ? 'Inscription...' : "S'inscrire"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setSelectedWorkshop(workshop)}
                            className="w-full"
                          >
                            En savoir plus
                          </Button>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 text-yellow-600 px-4 py-2 rounded-lg text-center">
                          Atelier complet
                        </div>
                      )
                    ) : (
                      <div className="space-y-2">
                        <Link to="/" className="block">
                          <Button variant="outline" className="w-full">
                            Connectez-vous pour vous inscrire
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          onClick={() => setSelectedWorkshop(workshop)}
                          className="w-full"
                        >
                          En savoir plus
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-8 text-center">
              <p className="text-gray-600">
                Aucun atelier n'est programmé pour le moment.
              </p>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!selectedWorkshop} onOpenChange={(open) => !open && setSelectedWorkshop(null)}>
        <DialogContent className="sm:max-w-[600px]">
          {selectedWorkshop && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedWorkshop.title}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {format(selectedWorkshop.date, "d MMMM yyyy", { locale: fr })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {selectedWorkshop.time}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">Intervenant</h3>
                    <p className="text-gray-600">
                      {selectedWorkshop.instructor === 'admin' ? 'Parent\'aile' : selectedWorkshop.instructor}
                    </p>
                  </div>

                  {selectedWorkshop.description && (
                    <div>
                      <h3 className="font-medium mb-2">À propos de cet atelier</h3>
                      <p className="text-gray-600 whitespace-pre-wrap">
                        {selectedWorkshop.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="font-medium mb-2">Places disponibles</h3>
                    <p className="text-gray-600">
                      {7 - selectedWorkshop.participants.length} places restantes sur 7
                    </p>
                  </div>

                  {auth.currentUser ? (
                    selectedWorkshop.participants.includes(auth.currentUser.uid) ? (
                      <div className="space-y-4">
                        <div className="bg-green-50 text-green-600 p-4 rounded-lg">
                          Vous êtes inscrit(e) à cet atelier
                        </div>
                        {selectedWorkshop.meetingUrl && (
                          <Button
                            className="w-full bg-primary hover:bg-primary/90"
                            onClick={() => window.open(selectedWorkshop.meetingUrl, '_blank')}
                          >
                            <Video className="w-4 h-4 mr-2" />
                            Rejoindre l'atelier en visio
                          </Button>
                        )}
                      </div>
                    ) : selectedWorkshop.participants.length < 7 ? (
                      <Button
                        onClick={() => handleRegister(selectedWorkshop.id)}
                        disabled={registering === selectedWorkshop.id}
                        className="w-full bg-primary hover:bg-primary/90"
                      >
                        {registering === selectedWorkshop.id ? 'Inscription...' : "S'inscrire à l'atelier"}
                      </Button>
                    ) : (
                      <div className="bg-yellow-50 text-yellow-600 p-4 rounded-lg">
                        Cet atelier est complet
                      </div>
                    )
                  ) : (
                    <Link to="/">
                      <Button className="w-full">
                        Connectez-vous pour vous inscrire
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};