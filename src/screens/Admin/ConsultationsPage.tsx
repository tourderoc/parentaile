import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Calendar } from 'lucide-react';
import { WeeklyCalendar } from './components/WeeklyCalendar';
import { SlotDialog } from './components/SlotDialog';
import { BatchSlotDialog } from './components/BatchSlotDialog';
import { CancelSlotDialog } from './components/CancelSlotDialog';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';

export const ConsultationsPage = () => {
  const handleAddSlot = async (date: Date, time: string) => {
    try {
      const slotData = {
        date: serverTimestamp(),
        time,
        status: 'available',
        duration: 30,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      };

      await addDoc(collection(db, 'slots'), slotData);
    } catch (error) {
      console.error('Error adding slot:', error);
    }
  };

  const handleSlotsAdded = () => {
    // Refresh the calendar view
    window.location.reload();
  };

  const handleConsultationClick = (consultationId: string) => {
    window.location.href = `/admin/consultation/${consultationId}`;
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Retour au tableau de bord
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-primary">
              Gérer les consultations
            </h1>
          </div>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold text-primary">
                Calendrier des consultations
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <SlotDialog onAddSlot={handleAddSlot} />
              <BatchSlotDialog onSlotsAdded={handleSlotsAdded} />
              <CancelSlotDialog onSlotsDeleted={handleSlotsAdded} />
            </div>
          </div>

          <WeeklyCalendar onConsultationClick={handleConsultationClick} />
        </Card>
      </div>
    </div>
  );
};