import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "../../components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { PromptsSection } from './components/PromptsSection';

export const PromptsPage = () => {
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
              Gérer les prompts IA
            </h1>
          </div>
        </div>

        <PromptsSection />
      </div>
    </div>
  );
};