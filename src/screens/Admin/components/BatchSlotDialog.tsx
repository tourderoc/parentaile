import React, { useState, useEffect, useRef } from 'react';
import { format, addMinutes, isBefore, isAfter, parse, setHours, setMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '../../../components/ui/button';
import { Calendar } from '../../../components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';

interface BatchSlotDialogProps {
  onSlotsAdded: () => void;
}

interface SlotCreationResult {
  time: string;
  success: boolean;
}

// Generate time slots from 9:00 to 19:30 with 15-minute intervals
const timeSlots = Array.from({ length: 43 }, (_, i) => {
  const hour = Math.floor(i / 4) + 9;
  const minutes = (i % 4) * 15;
  return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
});

const durations = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 heure' }
];

export const BatchSlotDialog: React.FC<BatchSlotDialogProps> = ({ onSlotsAdded }) => {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date>();
  const [startTime, setStartTime] = React.useState<string>('09:00');
  const [endTime, setEndTime] = React.useState<string>('17:00');
  const [duration, setDuration] = React.useState<string>('30');
  const [loading, setLoading] = React.useState(false);
  const [creationResults, setCreationResults] = React.useState<SlotCreationResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const isTimeSlotPast = (selectedDate: Date | undefined, slotTime: string): boolean => {
    if (!selectedDate) return false;
    
    const now = new Date();
    const [hours, minutes] = slotTime.split(':').map(Number);
    const slotDate = new Date(selectedDate);
    slotDate.setHours(hours, minutes, 0, 0);
    
    return isBefore(slotDate, now);
  };

  const validateTimeRange = (start: Date, end: Date): boolean => {
    const now = new Date();
    
    if (isBefore(start, now)) {
      setError('La date et l\'heure de début doivent être dans le futur.');
      return false;
    }

    if (!isBefore(start, end)) {
      setError('L\'heure de fin doit être après l\'heure de début.');
      return false;
    }

    const diffInMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    if (diffInMinutes < parseInt(duration)) {
      setError('La plage horaire doit être plus grande que la durée d\'un créneau.');
      return false;
    }

    return true;
  };

  const getTimeFromString = (timeStr: string, baseDate: Date): Date => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return setMinutes(setHours(baseDate, hours), minutes);
  };

  const createSlot = async (slotDate: Date, slotTime: string): Promise<boolean> => {
    try {
      const now = new Date();
      const [hours, minutes] = slotTime.split(':').map(Number);
      const slotDateTime = new Date(slotDate);
      slotDateTime.setHours(hours, minutes, 0, 0);
      
      if (isBefore(slotDateTime, now)) {
        return false;
      }

      const existingSlotsQuery = query(
        collection(db, 'slots'),
        where('date', '==', Timestamp.fromDate(slotDate)),
        where('time', '==', slotTime)
      );
      
      const existingSlotsSnapshot = await getDocs(existingSlotsQuery);
      
      if (existingSlotsSnapshot.empty) {
        const slotData = {
          date: Timestamp.fromDate(slotDate),
          time: slotTime,
          status: 'available',
          duration: parseInt(duration),
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid
        };
        
        await addDoc(collection(db, 'slots'), slotData);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error creating slot:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!date || !startTime || !endTime || !duration) {
      setError('Veuillez remplir tous les champs.');
      return;
    }

    try {
      setLoading(true);
      setCreationResults([]);
      setError(null);

      const baseDate = new Date(date);
      const startDate = getTimeFromString(startTime, baseDate);
      const endDate = getTimeFromString(endTime, baseDate);

      if (!validateTimeRange(startDate, endDate)) {
        setLoading(false);
        return;
      }

      let currentTime = startDate;
      let slotsCreated = 0;
      const results: SlotCreationResult[] = [];
      
      while (isBefore(currentTime, endDate)) {
        const timeString = format(currentTime, 'HH:mm');
        
        try {
          const slotCreated = await createSlot(currentTime, timeString);
          results.push({ time: timeString, success: slotCreated });
          if (slotCreated) slotsCreated++;
          
          setCreationResults([...results]);
          
          // Add duration plus 5 minutes between slots
          currentTime = addMinutes(currentTime, parseInt(duration) + 5);
        } catch (error) {
          console.error('Error creating slot:', error);
          results.push({ time: timeString, success: false });
          currentTime = addMinutes(currentTime, parseInt(duration) + 5);
        }
      }

      if (slotsCreated === 0) {
        setError('Aucun nouveau créneau n\'a pu être créé. Les créneaux existent peut-être déjà.');
      } else {
        onSlotsAdded();
        setOpen(false);
      }
    } catch (error) {
      console.error('Error adding slots:', error);
      setError('Une erreur est survenue lors de l\'ajout des créneaux');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDate(undefined);
    setStartTime('09:00');
    setEndTime('17:00');
    setDuration('30');
    setError(null);
    setCreationResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) handleReset();
    }}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une plage horaire
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Ajouter une plage de créneaux</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
            {error}
          </div>
        )}
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Date</label>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              locale={fr}
              disabled={(date) => isBefore(date, new Date())}
              className="rounded-md border"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Heure de début</label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez une heure" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {timeSlots.map((slot) => {
                    const isPast = isTimeSlotPast(date, slot);
                    return (
                      <SelectItem 
                        key={slot} 
                        value={slot}
                        disabled={isPast}
                        className={isPast ? 'text-gray-400' : ''}
                      >
                        {slot}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Heure de fin</label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez une heure" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {timeSlots.map((slot) => {
                    const isPast = isTimeSlotPast(date, slot);
                    return (
                      <SelectItem 
                        key={slot} 
                        value={slot}
                        disabled={isPast}
                        className={isPast ? 'text-gray-400' : ''}
                      >
                        {slot}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Durée d'un créneau</label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une durée" />
              </SelectTrigger>
              <SelectContent>
                {durations.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !date || !startTime || !endTime || !duration}
            className="bg-primary hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Ajout en cours...
              </>
            ) : (
              'Ajouter'
            )}
          </Button>
        </div>

        {creationResults.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2">Résultats de la création :</h4>
            <div className="max-h-[200px] overflow-y-auto">
              <ul className="space-y-1">
                {creationResults.map((result, index) => (
                  <li key={index} className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                    {result.time} - {result.success ? 'Créé' : 'Déjà existant'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};