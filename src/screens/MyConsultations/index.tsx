import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, Timestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { ArrowLeft, Video, Loader2, X, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createConsultationNotification } from '../../lib/notifications';

interface Consultation {
  id: string;
  date: Date;
  rdv_date?: Date | Timestamp;
  category: string;
  status: string;
  texte: string;
  meetingUrl?: string;
  rdv_time?: string;
  slotId?: string;
  userId: string;
  pseudo: string;
  email?: string;
  presence?: {
    online: boolean;
    lastSeen: Date;
    inMeeting: boolean;
  };
  summary?: {
    parent?: string;
    practitioner?: string;
    generatedAt?: Date;
  };
}

interface Slot {
  id: string;
  date: Date;
  time: string;
  status: 'available' | 'reserved';
}

export const MyConsultations = () => {
  const navigate = useNavigate();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [pastConsultations, setPastConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getFormattedDate = (date: Date | Timestamp | undefined) => {
    if (!date) return '';
    
    if (date instanceof Timestamp) {
      return format(date.toDate(), 'EEEE d MMMM yyyy', { locale: fr });
    }
    
    return format(date, 'EEEE d MMMM yyyy', { locale: fr });
  };

  useEffect(() => {
    const fetchConsultations = async () => {
      if (!auth.currentUser) {
        navigate('/');
        return;
      }

      try {
        setLoading(true);
        const now = new Date();

        // Fetch active consultations
        const activeConsultationsQuery = query(
          collection(db, 'messages'),
          where('userId', '==', auth.currentUser.uid),
          where('status', 'in', ['en_attente', 'confirme', 'lien_genere']),
          orderBy('date', 'desc')
        );

        const consultationsSnapshot = await getDocs(activeConsultationsQuery);
        const consultationsData = consultationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate(),
          rdv_date: doc.data().rdv_date
        })) as Consultation[];

        setConsultations(consultationsData);

        // Fetch past consultations
        const pastConsultationsQuery = query(
          collection(db, 'messages'),
          where('userId', '==', auth.currentUser.uid),
          where('status', '==', 'terminee'),
          orderBy('date', 'desc')
        );

        const pastConsultationsSnapshot = await getDocs(pastConsultationsQuery);
        const pastConsultationsData = pastConsultationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate(),
          rdv_date: doc.data().rdv_date
        })) as Consultation[];

        setPastConsultations(pastConsultationsData);

        // Fetch available slots
        const slotsQuery = query(
          collection(db, 'slots'),
          where('status', '==', 'available'),
          where('date', '>', Timestamp.fromDate(now)),
          orderBy('date', 'asc')
        );

        const slotsSnapshot = await getDocs(slotsQuery);
        const slotsData = slotsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date.toDate()
        })) as Slot[];

        setAvailableSlots(slotsData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching consultations:', error);
        setError('Une erreur est survenue lors du chargement des consultations.');
        setLoading(false);
      }
    };

    fetchConsultations();
  }, [navigate]);

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

  const pendingConsultation = consultations.find(c => c.status === 'en_attente');
  const confirmedConsultations = consultations.filter(c => c.status === 'confirme' || c.status === 'lien_genere');

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/dashboard" className="mb-6 text-primary inline-block">
          <Button variant="ghost" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour au tableau de bord
          </Button>
        </Link>

        <h1 className="text-3xl font-bold text-primary mb-8">
          Mes consultations
        </h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {confirmedConsultations.length > 0 && (
            <Card className="p-6 md:p-8">
              <h2 className="text-2xl font-bold text-primary mb-6">
                Consultations à venir
              </h2>
              <div className="space-y-4">
                {confirmedConsultations.map((consultation) => (
                  <div key={consultation.id} className="bg-white p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">
                          {getFormattedDate(consultation.rdv_date)}
                        </p>
                        <p className="text-gray-600">
                          {consultation.rdv_time}
                        </p>
                      </div>
                      {consultation.meetingUrl && (
                        <a
                          href={consultation.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-2"
                        >
                          <Video className="w-4 h-4" />
                          Rejoindre la consultation
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {pastConsultations.length > 0 && (
            <Card className="p-6 md:p-8">
              <h2 className="text-2xl font-bold text-primary mb-6">
                Consultations passées
              </h2>
              <div className="space-y-4">
                {pastConsultations.map((consultation) => (
                  <div key={consultation.id} className="bg-white p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">
                          {getFormattedDate(consultation.rdv_date) || getFormattedDate(consultation.date)}
                        </p>
                        <p className="text-gray-600">
                          {consultation.rdv_time}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800">
                        Terminée
                      </span>
                    </div>
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Motif de consultation</h4>
                      <p className="text-gray-600">{consultation.texte}</p>
                    </div>
                    {consultation.summary?.parent && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium mb-2">Résumé de la consultation</h4>
                        <p className="text-gray-600">{consultation.summary.parent}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!pendingConsultation && consultations.length === 0 && pastConsultations.length === 0 && (
            <Card className="p-6 md:p-8 text-center">
              <h2 className="text-2xl font-bold text-primary mb-4">
                Aucune consultation
              </h2>
              <p className="text-gray-600 mb-6">
                Vous n'avez pas de consultation en cours ou passée.
              </p>
              <Link to="/teleconsultation">
                <Button className="bg-primary hover:bg-primary/90">
                  Prendre rendez-vous
                </Button>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};