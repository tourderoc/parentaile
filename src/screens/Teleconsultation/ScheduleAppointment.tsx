import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Calendar } from "../../components/ui/calendar";
import { ArrowLeft, Loader2, Calendar as CalendarIcon, Clock } from "lucide-react";
import { db, auth } from "../../lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, orderBy, Timestamp, getDoc } from 'firebase/firestore';
import { format, isSameDay, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createConsultationNotification } from '../../lib/notifications';

interface Consultation {
  id: string;
  date: Timestamp;
  category: string;
  status: string;
  userId: string;
  rdv_date?: Timestamp;
  meetingUrl?: string;
}

interface Slot {
  id: string;
  date: Timestamp;
  time: string;
  status: 'available' | 'reserved';
  userId?: string;
}

export const ScheduleAppointment = () => {
  const navigate = useNavigate();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConsultations = async () => {
      if (!auth.currentUser) {
        navigate('/');
        return;
      }

      try {
        setLoading(true);
        const now = new Date();

        // Fetch user's consultations
        const userConsultationsQuery = query(
          collection(db, 'messages'),
          where('userId', '==', auth.currentUser.uid),
          where('status', 'in', ['en_attente', 'confirme']),
          orderBy('date', 'desc')
        );

        const consultationsSnapshot = await getDocs(userConsultationsQuery);
        const consultationsData = consultationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Consultation[];

        setConsultations(consultationsData);

        // Fetch available slots
        const slotsQuery = query(
          collection(db, 'slots'),
          where('status', '==', 'available'),
          where('date', '>', Timestamp.fromDate(now)),
          orderBy('date', 'asc')
        );

        const slotsSnapshot = await getDocs(slotsQuery);
        const slotsData = slotsSnapshot.docs.map(doc => {
          const data = doc.data();
          const slotDate = data.date.toDate();
          const [hours, minutes] = data.time.split(':').map(Number);
          slotDate.setHours(hours, minutes, 0, 0);

          // Only include slots that are in the future
          if (isBefore(slotDate, now)) {
            return null;
          }

          return {
            id: doc.id,
            ...data
          };
        }).filter((slot): slot is Slot => slot !== null);

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

  const handleBookSlot = async (slotId: string, slotDate: Timestamp, slotTime: string) => {
    if (!auth.currentUser) {
      setError('Vous devez être connecté pour réserver un créneau.');
      return;
    }

    try {
      setBooking(true);
      setError(null);

      // Find the pending consultation
      const pendingConsultation = consultations.find(c => c.status === 'en_attente');
      if (!pendingConsultation) {
        setError('Aucune demande de consultation en attente.');
        return;
      }

      // Get the slot document reference
      const slotRef = doc(db, 'slots', slotId);
      
      // Check if the slot document exists and is available
      const slotDoc = await getDoc(slotRef);
      
      if (!slotDoc.exists()) {
        setError('Ce créneau n\'existe plus.');
        return;
      }

      const slotData = slotDoc.data();
      if (slotData.status !== 'available') {
        setError('Ce créneau n\'est plus disponible. Veuillez en choisir un autre.');
        return;
      }

      // Verify the slot is not in the past
      const slotDateTime = slotDate.toDate();
      const [hours, minutes] = slotTime.split(':').map(Number);
      slotDateTime.setHours(hours, minutes, 0, 0);
      
      if (isBefore(slotDateTime, new Date())) {
        setError('Ce créneau est déjà passé. Veuillez en choisir un autre.');
        return;
      }

      // Update the slot status
      await updateDoc(slotRef, {
        status: 'reserved',
        userId: auth.currentUser.uid
      });

      // Update the consultation with the selected slot
      await updateDoc(doc(db, 'messages', pendingConsultation.id), {
        status: 'confirme',
        rdv_date: slotDate,
        rdv_time: slotTime,
        slotId: slotId,
        updated_at: Timestamp.now()
      });

      // Create notification
      await createConsultationNotification(
        auth.currentUser.uid,
        pendingConsultation.id,
        slotDate.toDate(),
        slotTime,
        'scheduled'
      );

      // Redirect to my consultations page
      navigate('/my-consultations');
    } catch (error) {
      console.error('Error booking slot:', error);
      setError('Une erreur est survenue lors de la réservation.');
    } finally {
      setBooking(false);
    }
  };

  const getAvailableSlotsForDate = (date: Date) => {
    return availableSlots.filter(slot => 
      isSameDay(slot.date.toDate(), date)
    );
  };

  // Check if a date has any available slots
  const hasAvailableSlots = (date: Date) => {
    return availableSlots.some(slot => isSameDay(slot.date.toDate(), date));
  };

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
  const confirmedConsultations = consultations.filter(c => c.status === 'confirme');
  const selectedDateSlots = selectedDate ? getAvailableSlotsForDate(selectedDate) : [];

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/dashboard" className="mb-6 text-primary inline-block">
          <Button variant="ghost" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour au tableau de bord
          </Button>
        </Link>

        {confirmedConsultations.length > 0 && (
          <Card className="p-6 md:p-8 mb-8">
            <h2 className="text-2xl font-bold text-primary mb-6">
              Mes consultations confirmées
            </h2>
            <div className="space-y-4">
              {confirmedConsultations.map((consultation) => (
                <div key={consultation.id} className="bg-white p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">
                        {format(consultation.rdv_date?.toDate() || new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
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
                        className="text-primary hover:underline"
                      >
                        Rejoindre la consultation
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {pendingConsultation ? (
          <Card className="p-6 md:p-8">
            <h2 className="text-2xl font-bold text-primary mb-6">
              Choisir un créneau
            </h2>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
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
                  disabled={(date) => date < new Date()}
                  modifiers={{
                    hasSlots: (date) => hasAvailableSlots(date)
                  }}
                  modifiersStyles={{
                    hasSlots: {
                      backgroundColor: 'var(--color-sage)',
                      color: 'white'
                    }
                  }}
                  className="rounded-md border"
                />
              </div>

              <div>
                <div className="mb-4 flex items-center gap-2 text-primary">
                  <Clock className="w-5 h-5" />
                  <h3 className="font-medium">Créneaux disponibles</h3>
                </div>
                {selectedDate ? (
                  selectedDateSlots.length > 0 ? (
                    <div className="space-y-2">
                      {selectedDateSlots.map((slot) => (
                        <Button
                          key={slot.id}
                          variant="outline"
                          className="w-full justify-between"
                          onClick={() => handleBookSlot(slot.id, slot.date, slot.time)}
                          disabled={booking}
                        >
                          <span>{slot.time}</span>
                          {booking && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      Aucun créneau disponible pour cette date
                    </p>
                  )
                ) : (
                  <p className="text-gray-500 text-center py-4">
                    Veuillez sélectionner une date pour voir les créneaux disponibles
                  </p>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 md:p-8 text-center">
            <h2 className="text-2xl font-bold text-primary mb-4">
              Aucune demande en attente
            </h2>
            <p className="text-gray-600 mb-6">
              Vous n'avez pas de demande de consultation en attente.
            </p>
            <Link to="/teleconsultation">
              <Button className="bg-primary hover:bg-primary/90">
                Faire une demande de consultation
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
};