import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Pencil, Mic, Bot } from "lucide-react";

export const Preparation = () => {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'writing' | 'ai' | null>(null);

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/teleconsultation")}
          className="mb-6 text-primary"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à l'introduction
        </Button>

        <Card className="p-6 md:p-8">
          <h1 className="text-3xl font-bold text-primary text-center mb-8">
            Préparez votre consultation
          </h1>

          <div className="bg-primary/5 p-6 rounded-lg mb-8">
            <h2 className="text-xl font-semibold mb-4">Comment ça marche ?</h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm">1</span>
                Vous disposez de 10 minutes pour vous exprimer librement
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm">2</span>
                Choisissez le mode qui vous convient le mieux : écrit ou oral
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm">3</span>
                Notre assistant reformule vos propos de manière claire et structurée
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm">4</span>
                Vous pouvez relire et ajuster la reformulation si nécessaire
              </li>
            </ul>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card 
              className={`p-6 cursor-pointer transition-all ${
                selectedOption === 'writing' ? 'ring-2 ring-primary' : 'hover:shadow-md'
              }`}
              onClick={() => setSelectedOption('writing')}
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Pencil className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Rédiger à l'écrit</h3>
                <p className="text-gray-600">
                  Prenez le temps d'écrire et d'organiser vos pensées dans un 
                  éditeur de texte confortable
                </p>
              </div>
            </Card>

            <Card 
              className={`p-6 cursor-pointer transition-all ${
                selectedOption === 'ai' ? 'ring-2 ring-primary' : 'hover:shadow-md'
              }`}
              onClick={() => setSelectedOption('ai')}
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Assistant IA guidé</h3>
                <p className="text-gray-600">
                  Laissez-vous guider par notre assistant qui vous pose des 
                  questions et reformule vos réponses
                </p>
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Mic className="w-4 h-4" />
                  Possibilité de répondre à l'oral
                </div>
              </div>
            </Card>
          </div>

          <div className="flex justify-center mt-8">
            <Button
              onClick={() => {
                if (selectedOption) {
                  navigate(`/teleconsultation/${selectedOption}`);
                }
              }}
              disabled={!selectedOption}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-lg"
            >
              Continuer avec l'option sélectionnée
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};