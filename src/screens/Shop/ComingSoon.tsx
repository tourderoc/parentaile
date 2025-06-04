import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Clock } from 'lucide-react';

export const ComingSoon = () => {
  const { section } = useParams();

  const sectionTitle = section === 'parents' ? 'Livres parents' : 'Applications';

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/boutique">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à la boutique
            </Button>
          </Link>
        </div>

        <Card className="p-8 text-center">
          <div className="flex justify-center mb-6">
            <Clock className="w-16 h-16 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-4">
            {sectionTitle} - Bientôt disponible !
          </h1>
          <p className="text-gray-600 mb-8">
            Cette section est en cours de développement. Revenez bientôt pour découvrir notre sélection !
          </p>
          <Link to="/boutique">
            <Button className="bg-primary hover:bg-primary/90">
              Retourner à la boutique
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
};