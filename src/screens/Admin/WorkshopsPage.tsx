import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { WorkshopSection } from './components/WorkshopSection';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Workshop {
  id: string;
  title: string;
  date: Date;
  time: string;
  instructor: string;
  participants: string[];
  description?: string;
  meetingUrl?: string;
}

export const WorkshopsPage = () => {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkshops = async () => {
      try {
        const workshopsQuery = query(
          collection(db, 'workshops'),
          orderBy('date', 'desc')
        );

        const workshopsSnapshot = await getDocs(workshopsQuery);
        const workshopsData = workshopsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date.toDate(),
          participants: doc.data().participants || []
        })) as Workshop[];

        setWorkshops(workshopsData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching workshops:', error);
        setLoading(false);
      }
    };

    fetchWorkshops();
  }, []);

  const handleWorkshopAdded = () => {
    // Refresh workshops list
    window.location.reload();
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
              Gérer les ateliers
            </h1>
          </div>
        </div>

        <WorkshopSection 
          workshops={workshops}
          onWorkshopAdded={handleWorkshopAdded}
          onWorkshopEdited={handleWorkshopAdded}
          onWorkshopCancelled={handleWorkshopAdded}
          onWorkshopStatusChange={handleWorkshopAdded}
          onAddWorkshop={handleWorkshopAdded}
        />
      </div>
    </div>
  );
};