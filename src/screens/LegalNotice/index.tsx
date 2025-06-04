import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pen } from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export const LegalNotice = () => {
  const navigate = useNavigate();

  const handlePenClick = async () => {
    if (!auth.currentUser) return;

    try {
      const userDoc = await getDocs(query(
        collection(db, 'users'),
        where('uid', '==', auth.currentUser.uid),
        where('role', '==', 'hanene')
      ));

      if (!userDoc.empty) {
        navigate('/mes-ateliers');
      } else {
        navigate('/admin');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-8">
      <div className="max-w-3xl mx-auto relative">
        <Link to="/" className="text-[var(--color-sage)] hover:underline mb-8 inline-block">
          ← Retour à l'accueil
        </Link>
        
        <h1 className="text-4xl font-bold mb-8">Mentions légales</h1>
        
        <div className="prose">
          <h2 className="text-2xl mb-4">Éditeur du site</h2>
          <p>Parent'aile<br />
          [Adresse]<br />
          Email : contact@parentaile.fr</p>

          <h2 className="text-2xl mt-8 mb-4">Hébergement</h2>
          <p>[Informations sur l'hébergeur]</p>

          <h2 className="text-2xl mt-8 mb-4">Protection des données</h2>
          <p>Les informations recueillies sur ce site sont traitées selon la politique de confidentialité disponible sur demande.</p>
        </div>

        {auth.currentUser && (
          <button 
            onClick={handlePenClick}
            className="absolute bottom-4 right-4 w-8 h-8 flex items-center justify-center text-primary/50 hover:text-primary transition-colors"
            title="Administration"
          >
            <Pen className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};