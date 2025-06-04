import React, { useState } from 'react';
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { format, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Book, Video, Edit, Trash2, Eye } from 'lucide-react';
import { EditWorkshopDialog } from './EditWorkshopDialog';
import { CancelWorkshopDialog } from './CancelWorkshopDialog';
import { WorkshopDetailsDialog } from './WorkshopDetailsDialog';
import { WorkshopDialog } from './WorkshopDialog';

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
}

interface WorkshopSectionProps {
  workshops: Workshop[];
  onWorkshopAdded: () => void;
  onWorkshopEdited: () => void;
  onWorkshopCancelled: () => void;
  onWorkshopStatusChange: () => void;
  onAddWorkshop: (workshop: { title: string; date: Date; time: string; instructor: string; description: string; }) => void;
}

export const WorkshopSection: React.FC<WorkshopSectionProps> = ({
  workshops,
  onWorkshopAdded,
  onWorkshopEdited,
  onWorkshopCancelled,
  onWorkshopStatusChange,
  onAddWorkshop
}) => {
  const [showPastWorkshops, setShowPastWorkshops] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);
  const [cancellingWorkshop, setCancellingWorkshop] = useState<Workshop | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);

  const now = new Date();
  const filteredWorkshops = workshops.filter(workshop => {
    if (workshop.status === 'cancelled') return false;
    
    const workshopDate = new Date(workshop.date);
    workshopDate.setHours(parseInt(workshop.time.split(':')[0]));
    workshopDate.setMinutes(parseInt(workshop.time.split(':')[1]));
    return showPastWorkshops ? isBefore(workshopDate, now) : !isBefore(workshopDate, now);
  });

  return (
    <Card className="p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Book className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-primary">
            Gérer les ateliers
          </h2>
        </div>
        <div className="flex items-center gap-4">
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
          <WorkshopDialog onAddWorkshop={onAddWorkshop} />
        </div>
      </div>

      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-4">
          {filteredWorkshops.map((workshop) => {
            const workshopDate = new Date(workshop.date);
            workshopDate.setHours(parseInt(workshop.time.split(':')[0]));
            workshopDate.setMinutes(parseInt(workshop.time.split(':')[1]));
            const isPast = isBefore(workshopDate, now);

            return (
              <Card key={workshop.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">{workshop.title}</h3>
                    <p className="text-gray-600">
                      {format(workshop.date, 'EEEE d MMMM yyyy', { locale: fr })} à {workshop.time}
                    </p>
                    <p className="text-gray-600">
                      Intervenant : {workshop.instructor === 'admin' ? 'Moi' : workshop.instructor}
                    </p>
                    <p className="text-gray-600">
                      Participants : {workshop.participants.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedWorkshop(workshop)}
                      className="flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Détails
                    </Button>

                    {!isPast && !workshop.status && (
                      <>
                        {workshop.meetingUrl ? (
                          <a
                            href={workshop.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                            >
                              <Video className="w-4 h-4" />
                              Voir le lien
                            </Button>
                          </a>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingWorkshop(workshop)}
                            className="flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Modifier
                          </Button>
                        )}

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setCancellingWorkshop(workshop)}
                          className="flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Annuler
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {filteredWorkshops.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Aucun atelier {showPastWorkshops ? 'passé' : 'à venir'}
            </div>
          )}
        </div>
      </ScrollArea>

      {editingWorkshop && (
        <EditWorkshopDialog
          workshop={editingWorkshop}
          onClose={() => setEditingWorkshop(null)}
          onEdited={onWorkshopEdited}
        />
      )}

      {cancellingWorkshop && (
        <CancelWorkshopDialog
          workshop={cancellingWorkshop}
          onClose={() => setCancellingWorkshop(null)}
          onCancelled={onWorkshopCancelled}
        />
      )}

      {selectedWorkshop && (
        <WorkshopDetailsDialog
          workshop={selectedWorkshop}
          onClose={() => setSelectedWorkshop(null)}
          onStatusChange={onWorkshopStatusChange}
        />
      )}
    </Card>
  );
};