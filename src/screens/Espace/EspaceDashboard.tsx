/**
 * EspaceDashboard - Dashboard parent après connexion
 *
 * Affiche :
 * - Liste des enfants (tokens liés)
 * - Bouton ajouter enfant
 * - Accès aux messages
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Button } from '../../components/ui/button';
import {
  Home,
  LogOut,
  Loader2,
  Plus,
  MessageSquare,
  User,
  ChevronRight
} from 'lucide-react';

interface Child {
  tokenId: string;
  nickname: string;
  addedAt: Date;
}

export const EspaceDashboard = () => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);

  useEffect(() => {
    const loadChildren = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate('/espace');
        return;
      }

      try {
        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const q = query(childrenRef, orderBy('addedAt', 'desc'));
        const snapshot = await getDocs(q);

        const childrenData: Child[] = snapshot.docs.map(doc => ({
          tokenId: doc.id,
          nickname: doc.data().nickname,
          addedAt: doc.data().addedAt?.toDate?.() || new Date()
        }));

        setChildren(childrenData);

        // Sélectionner le premier enfant par défaut
        if (childrenData.length > 0 && !selectedChild) {
          setSelectedChild(childrenData[0]);
        }
      } catch (error) {
        console.error('Erreur chargement enfants:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadChildren();
  }, [navigate, selectedChild]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/espace');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-500">Parent'aile</h1>
            <p className="text-sm text-gray-500">Espace Patient</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <Home className="w-4 h-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Bonjour !
          </h2>
          <p className="text-gray-600">
            Envoyez un message à votre médecin concernant votre enfant.
          </p>
        </div>

        {/* Children selector */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Mes enfants
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/espace/ajouter-enfant')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un enfant
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {children.map((child) => (
              <button
                key={child.tokenId}
                onClick={() => setSelectedChild(child)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedChild?.tokenId === child.tokenId
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-orange-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selectedChild?.tokenId === child.tokenId
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{child.nickname}</p>
                    <p className="text-xs text-gray-500">
                      Ajouté le {child.addedAt.toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {children.length === 0 && (
              <div className="col-span-2 text-center py-8 text-gray-500">
                Aucun enfant enregistré
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {selectedChild && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Pour {selectedChild.nickname}
            </h3>

            <button
              onClick={() => navigate(`/espace/nouveau-message?child=${selectedChild.tokenId}`)}
              className="w-full p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-orange-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-800">Envoyer un message</p>
                  <p className="text-sm text-gray-500">
                    Écrire au médecin de {selectedChild.nickname}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" />
            </button>

            <button
              onClick={() => navigate(`/espace/messages?child=${selectedChild.tokenId}`)}
              className="w-full p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-gray-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-800">Mes messages</p>
                  <p className="text-sm text-gray-500">
                    Voir l'historique des échanges
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" />
            </button>
          </div>
        )}

        {/* Info note */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          <strong>Note :</strong> Les réponses de votre médecin seront envoyées par email
          à l'adresse {auth.currentUser?.email}
        </div>
      </main>
    </div>
  );
};

export default EspaceDashboard;
