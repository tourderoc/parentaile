import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Card } from "../../../components/ui/card";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { Button } from '../../../components/ui/button';

interface WeeklyCalendarProps {
  onConsultationClick: (consultationId: string) => void;
}

interface CalendarEvent {
  id: string;
  type: 'consultation' | 'slot';
  time: string;
  status: string;
  pseudo?: string;
  date: Date;
  presence?: {
    online: boolean;
    inMeeting: boolean;
  };
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({ onConsultationClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

        // Fetch consultations
        const consultationsQuery = query(
          collection(db, 'messages'),
          where('status', 'in', ['confirme', 'lien_genere']),
          where('rdv_date', '>=', Timestamp.fromDate(weekStart)),
          where('rdv_date', '<=', Timestamp.fromDate(weekEnd))
        );

        // Fetch available slots
        const slotsQuery = query(
          collection(db, 'slots'),
          where('status', '==', 'available'),
          where('date', '>=', Timestamp.fromDate(weekStart)),
          where('date', '<=', Timestamp.fromDate(weekEnd))
        );

        const [consultationsSnapshot, slotsSnapshot] = await Promise.all([
          getDocs(consultationsQuery),
          getDocs(slotsQuery)
        ]);

        const consultationEvents = consultationsSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'consultation' as const,
          time: doc.data().rdv_time,
          status: doc.data().status,
          pseudo: doc.data().pseudo,
          date: doc.data().rdv_date.toDate(),
          presence: doc.data().presence
        }));

        const slotEvents = slotsSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'slot' as const,
          time: doc.data().time,
          status: 'available',
          date: doc.data().date.toDate()
        }));

        setEvents([...consultationEvents, ...slotEvents]);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [currentDate]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 6)
  });

  const getEventsForDateAndTime = (date: Date, time: string) => {
    return events.filter(event => 
      isSameDay(event.date, date) && event.time === time
    );
  };

  const timeSlots = Array.from({ length: 43 }, (_, i) => {
    const hour = Math.floor(i / 4) + 9;
    const minutes = (i % 4) * 15;
    return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  });

  const getEventColor = (event: CalendarEvent) => {
    if (event.type === 'slot') {
      return 'bg-green-100 text-green-800';
    }
    switch (event.status) {
      case 'confirme':
        return 'bg-blue-100 text-blue-800';
      case 'lien_genere':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEventStatusText = (event: CalendarEvent) => {
    if (event.type === 'slot') {
      return 'Disponible';
    }
    switch (event.status) {
      case 'confirme':
        return 'Confirmé';
      case 'lien_genere':
        return 'En ligne';
      default:
        return 'En attente';
    }
  };

  const getPresenceIndicator = (event: CalendarEvent) => {
    if (event.type !== 'consultation' || !event.presence) return null;

    if (event.presence.inMeeting) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
      );
    }

    if (event.presence.online) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      );
    }

    return null;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            Semaine du {format(weekStart, 'd MMMM yyyy', { locale: fr })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-8 gap-2 mb-4">
            <div className="sticky left-0 bg-white z-10">
              <div className="h-12 flex items-center font-medium">Horaire</div>
            </div>
            {weekDays.map((day) => (
              <div key={day.toString()} className="text-center">
                <div className="h-12 flex flex-col justify-center">
                  <span className="font-medium">
                    {format(day, 'EEEE', { locale: fr })}
                  </span>
                  <span className="text-sm text-gray-500">
                    {format(day, 'd MMM', { locale: fr })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {timeSlots.map((time) => {
              const hasEvents = weekDays.some(day => 
                getEventsForDateAndTime(day, time).length > 0
              );

              if (!hasEvents) return null;

              return (
                <div key={time} className="grid grid-cols-8 gap-2">
                  <div className="sticky left-0 bg-white z-10 flex items-center text-sm text-gray-500">
                    {time}
                  </div>
                  {weekDays.map((day) => {
                    const eventsAtSlot = getEventsForDateAndTime(day, time);
                    if (eventsAtSlot.length === 0) {
                      return <div key={day.toString()} className="h-12" />;
                    }
                    return (
                      <div
                        key={day.toString()}
                        className="h-12 border rounded-md relative group"
                      >
                        {eventsAtSlot.map((event) => (
                          <div
                            key={event.id}
                            className={`absolute inset-0 m-1 rounded cursor-pointer transition-opacity ${
                              getEventColor(event)
                            }`}
                            onClick={() => event.type === 'consultation' && onConsultationClick(event.id)}
                          >
                            {getPresenceIndicator(event)}
                            <div className="p-1 text-xs truncate">
                              {event.type === 'consultation' ? (
                                <>
                                  <div className="font-medium">{event.pseudo}</div>
                                  <div className="flex items-center gap-1">
                                    <Circle className="w-2 h-2" fill="currentColor" />
                                    {getEventStatusText(event)}
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Circle className="w-2 h-2" fill="currentColor" />
                                  {getEventStatusText(event)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};