import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Heart, Lock, MessageSquare } from "lucide-react";

export const Introduction = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6 text-primary"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à l'accueil
        </Button>

        <Card className="p-6 md:p-8 space-y-8">
          <h1 className="text-3xl font-bold text-primary text-center mb-8">
            Bienvenue dans l'espace consultation
          </h1>

          <div className="grid gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">Qu'est-ce que la consultation Parent'aile ?</h2>
                <p className="text-gray-600">
                  C'est un espace d'échange bienveillant avec un professionnel qualifié, 
                  permettant de faire le point sur votre situation et d'obtenir des premières 
                  pistes de réflexion.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Heart className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">Un échange ponctuel</h2>
                <p className="text-gray-600">
                  Cette consultation n'est pas un suivi thérapeutique, mais plutôt un moment 
                  pour échanger, être écouté et recevoir des conseils adaptés à votre situation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">Confidentialité garantie</h2>
                <p className="text-gray-600">
                  Vos données sont strictement confidentielles et seront automatiquement 
                  supprimées après votre consultation. Seul le professionnel que vous 
                  rencontrerez y aura accès.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-lg mt-8">
            <h2 className="text-xl font-semibold mb-4">Pourquoi préparer sa consultation ?</h2>
            <p className="text-gray-600">
              Prendre un moment pour réfléchir à votre situation et organiser vos pensées 
              permet de :
            </p>
            <ul className="list-disc list-inside mt-2 space-y-2 text-gray-600">
              <li>Mieux identifier vos besoins et préoccupations</li>
              <li>Optimiser le temps d'échange avec le professionnel</li>
              <li>Garder une trace écrite de vos réflexions</li>
            </ul>
          </div>

          <div className="flex justify-center pt-6">
            <Button
              onClick={() => navigate("/teleconsultation/preparation")}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-lg"
            >
              Je suis d'accord et je commence
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};