import React, { useState } from 'react';
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Calendar } from "../../../components/ui/calendar";
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from "../../../components/ui/scroll-area";

interface Workshop {
  id: string;
  title: string;
  description?: string;
  date: Date;
  time: string;
  instructor: string;
  maxParticipants: number;
  participants: string[];
}

interface EditWorkshopDialogProps {
  workshop: Workshop;
  onClose: () => void;
  onEdited: () => void;
}

const timeSlots = Array.from({ length: 24 }, (_, i) => {
  const hour = Math.floor(i / 2) + 9;
  const minutes = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
});

export const EditWorkshopDialog: React.FC<EditWorkshopDialogProps> = ({
  workshop,
  onClose,
  onEdited
}) => {
  const [formData, setFormData] = useState({
    title: workshop.title,
    description: workshop.description || '',
    date: workshop.date,
    time: workshop.time,
    instructor: workshop.instructor,
    maxParticipants: workshop.maxParticipants
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);

      await updateDoc(doc(db, 'workshops', workshop.id), {
        ...formData,
        updatedAt: new Date()
      });

      onEdited();
      onClose();
    } catch (error) {
      console.error('Error updating workshop:', error);
      setError('Une erreur est survenue lors de la modification de l\'atelier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Modifier l'atelier</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh] pr-4">
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Titre</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Titre de l'atelier"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description de l'atelier"
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Calendar
                mode="single"
                selected={formData.date}
                onSelect={(date) => date && setFormData(prev => ({ ...prev, date }))}
                locale={fr}
                className="rounded-md border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Heure</label>
              <Select
                value={formData.time}
                onValueChange={(time) => setFormData(prev => ({ ...prev, time }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez une heure" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Intervenant</label>
              <Select
                value={formData.instructor}
                onValueChange={(instructor) => setFormData(prev => ({ ...prev, instructor }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir l'intervenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Moi</SelectItem>
                  <SelectItem value="hanene">Hanene</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre maximum de participants</label>
              <Input
                type="number"
                value={formData.maxParticipants}
                onChange={(e) => setFormData(prev => ({ ...prev, maxParticipants: parseInt(e.target.value) }))}
                min={1}
                max={20}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              'Enregistrer les modifications'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};