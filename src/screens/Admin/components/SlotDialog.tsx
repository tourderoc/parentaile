import React from 'react';
import { format, isBefore } from 'date-fns';
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
import { Plus } from 'lucide-react';

interface SlotDialogProps {
  onAddSlot: (date: Date, time: string) => void;
}

// Generate time slots from 9:00 to 19:30 with 15-minute intervals
const timeSlots = Array.from({ length: 43 }, (_, i) => {
  const hour = Math.floor(i / 4) + 9;
  const minutes = (i % 4) * 15;
  return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
});

export const SlotDialog: React.FC<SlotDialogProps> = ({ onAddSlot }) => {
  const [date, setDate] = React.useState<Date>();
  const [time, setTime] = React.useState<string>();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isTimeSlotPast = (selectedDate: Date | undefined, slotTime: string): boolean => {
    if (!selectedDate) return false;
    
    const now = new Date();
    const [hours, minutes] = slotTime.split(':').map(Number);
    const slotDate = new Date(selectedDate);
    slotDate.setHours(hours, minutes, 0, 0);
    
    return isBefore(slotDate, now);
  };

  const validateSlot = (selectedDate: Date, selectedTime: string): boolean => {
    const now = new Date();
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const slotDate = new Date(selectedDate);
    slotDate.setHours(hours, minutes, 0, 0);

    if (isBefore(slotDate, now)) {
      setError('Le créneau sélectionné est déjà passé.');
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (date && time) {
      if (validateSlot(date, time)) {
        onAddSlot(date, time);
        setOpen(false);
        setDate(undefined);
        setTime(undefined);
        setError(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un créneau
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Ajouter un créneau de consultation</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <label className="text-sm font-medium">Date</label>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(newDate) => {
                setDate(newDate);
                setError(null);
              }}
              locale={fr}
              disabled={(date) => isBefore(date, new Date())}
              className="rounded-md border"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Heure</label>
            <Select 
              value={time} 
              onValueChange={(newTime) => {
                setTime(newTime);
                setError(null);
              }}
            >
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
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!date || !time}
            className="bg-primary hover:bg-primary/90"
          >
            Ajouter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};