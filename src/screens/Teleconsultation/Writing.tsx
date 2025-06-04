import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft } from "lucide-react";
import { TeleconsultationForm } from "./components/TeleconsultationForm";
import { auth, db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export const Writing = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: any) => {
    if (!auth.currentUser) {
      setError("Vous devez être connecté pour envoyer une demande");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Create the consultation request
      await addDoc(collection(db, 'messages'), {
        texte: formData.situation,
        categorie: formData.theme || 'autre',
        pseudo: formData.pseudo,
        date: serverTimestamp(),
        userId: auth.currentUser.uid,
        status: 'en_attente',
        email: formData.email,
        phone: formData.wantsPhoneContact === 'yes' ? formData.phone : null,
        childAge: formData.childAge,
        themeDetails: formData.themeDetails
      });

      navigate('/teleconsultation/confirmation');
    } catch (error) {
      console.error('Error submitting consultation:', error);
      setError("Une erreur est survenue lors de l'envoi de votre demande. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/teleconsultation/preparation")}
          className="mb-6 text-primary"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à la préparation
        </Button>

        <Card className="p-6 md:p-8">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}
          
          <TeleconsultationForm 
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </Card>
      </div>
    </div>
  );
};