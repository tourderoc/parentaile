import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { CheckCircle, Home, Loader2 } from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { collection, query, where, getDocs, deleteDoc, orderBy, limit } from "firebase/firestore";

export const Confirmation = () => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDecline = async () => {
    if (!auth.currentUser) {
      navigate('/');
      return;
    }

    try {
      setIsDeleting(true);

      // Query only the most recent message for the current user
      const messagesRef = collection(db, 'messages');
      const q = query(
        messagesRef,
        where('userId', '==', auth.currentUser.uid),
        where('status', '==', 'en_attente'),
        orderBy('date', 'desc'),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      
      // Delete only the most recent message
      if (!querySnapshot.empty) {
        await deleteDoc(querySnapshot.docs[0].ref);
      }

      // Navigate back to home
      navigate('/');
    } catch (error) {
      console.error('Error deleting message:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleContinue = () => {
    navigate('/teleconsultation/schedule');
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Card className="p-6 md:p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-primary mb-4">
            Merci pour votre message
          </h1>

          <p className="text-gray-600 mb-8">
            Votre demande a bien été enregistrée. Je la lirai attentivement et je
            reviendrai vers vous très prochainement pour fixer un créneau d'échange.
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <Button
              onClick={handleContinue}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-lg"
            >
              Choisir un créneau
            </Button>

            <Button
              onClick={handleDecline}
              variant="outline"
              disabled={isDeleting}
              className="px-8 py-6 text-lg flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Suppression en cours...
                </>
              ) : (
                <>
                  Annuler ma demande
                  <Home className="w-5 h-5" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};