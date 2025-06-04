import React from 'react';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar as CalendarComponent } from '../../../components/ui/calendar';
import { Card } from '../../../components/ui/card';

interface Slot {
  id: string;
  date: Date;
  time: string;
  status: 'available' | 'reserved' | 'past';
  userId?: string;
}

interface ConsultationCalendarProps {
  slots: Slot[];
}

export const ConsultationCalendar: React.FC<ConsultationCalendarProps> = ({ slots }) => {
  const [selectedDate, setSelectedDate] = React.useState<Date>();

  const selectedDateSlots = slots.filter(
    (slot) => selectedDate && isSameDay(new Date(slot.date), selectedDate)
  );

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="p-4">
        <CalendarComponent
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={fr}
          modifiers={{
            hasSlots: (date) =>
              slots.some((slot) => isSameDay(new Date(slot.date), date)),
          }}
          modifiersStyles={{
            hasSlots: {
              backgroundColor: 'var(--color-sage)',
              color: 'white',
            },
          }}
        />
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-4">
          {selectedDate
            ? `Créneaux du ${format(selectedDate, 'dd MMMM yyyy', { locale: fr })}`
            : 'Sélectionnez une date'}
        </h3>
        {selectedDateSlots.length > 0 ? (
          <div className="space-y-2">
            {selectedDateSlots.map((slot) => (
              <div
                key={slot.id}
                className={`p-2 rounded-md ${
                  slot.status === 'available'
                    ? 'bg-green-100 text-green-800'
                    : slot.status === 'reserved'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <p className="font-medium">{slot.time}</p>
                <p className="text-sm">
                  {slot.status === 'available'
                    ? 'Disponible'
                    : slot.status === 'reserved'
                    ? 'Réservé'
                    : 'Passé'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Aucun créneau sur cette date</p>
        )}
      </Card>
    </div>
  );
};