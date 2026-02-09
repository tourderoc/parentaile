/**
 * EnterFamilyCode - Écran pour saisir le code famille
 *
 * Affiché quand un utilisateur connecté n'a pas encore de token associé.
 * Permet de saisir le code reçu en consultation.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { validateToken, markTokenAsUsed } from '../../lib/tokenService';
import { validateNickname } from '../../lib/pseudoFilter';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  Loader2,
  ArrowRight,
  ArrowLeft,
  User,
  AlertCircle,
  QrCode
} from 'lucide-react';

interface EnterFamilyCodeProps {
  onBack?: () => void;
}

type Step = 'code' | 'nickname';

export const EnterFamilyCode: React.FC<EnterFamilyCodeProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('code');
  const [token, setToken] = useState('');
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valider le code famille
  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanToken = token.trim().toLowerCase();
    if (!cleanToken || cleanToken.length < 6) {
      setError('Le code doit contenir au moins 6 caractères');
      return;
    }

    setIsLoading(true);

    try {
      const result = await validateToken(cleanToken);

      if (!result.valid) {
        setError(result.error || 'Ce code ne correspond pas. Vérifiez le document remis en consultation.');
        setIsLoading(false);
        return;
      }

      // Code valide → demander le prénom
      setStep('nickname');

    } catch (err) {
      console.error('Erreur validation code:', err);
      setError('Erreur de connexion. Réessayez.');
    } finally {
      setIsLoading(false);
    }
  };

  // Sauvegarder le prénom et associer le token
  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Valider le prénom
    const validation = validateNickname(nickname);
    if (!validation.valid) {
      setError(validation.error || 'Prénom invalide');
      return;
    }

    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');

      const cleanToken = token.trim().toLowerCase();

      // Ajouter l'enfant au compte
      const childRef = doc(db, 'accounts', user.uid, 'children', cleanToken);
      await setDoc(childRef, {
        nickname: nickname.trim(),
        addedAt: serverTimestamp()
      });

      // Token déjà marqué "used" dans validateToken (single-use)

      // Rediriger vers le dashboard (qui affichera maintenant l'enfant)
      navigate('/espace/dashboard');
      window.location.reload(); // Force refresh pour mettre à jour la liste

    } catch (err) {
      console.error('Erreur association token:', err);
      setError('Impossible d\'associer ce code. Réessayez.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <AnimatePresence mode="wait">
          {step === 'code' ? (
            <motion.div
              key="code"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto bg-orange-100 rounded-full flex items-center justify-center mb-4">
                  <KeyRound className="w-10 h-10 text-orange-500" />
                </div>
                <h1 className="text-2xl font-bold text-gray-800">Accès cabinet</h1>
                <p className="text-gray-600 mt-2">
                  Pour écrire au médecin, veuillez saisir le code famille remis en consultation.
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                {/* Error message */}
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleValidateCode} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code famille
                    </label>
                    <Input
                      type="text"
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value);
                        setError(null);
                      }}
                      placeholder="Ex: abc123xyz"
                      className="text-center text-lg tracking-wider"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Ce code se trouve sur le document QR remis par votre médecin.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600"
                    disabled={isLoading || !token.trim()}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Vérification...
                      </>
                    ) : (
                      <>
                        Valider
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Scan option */}
                <div className="mt-6 pt-6 border-t border-gray-100 text-center">
                  <p className="text-sm text-gray-500 mb-3">Vous avez le QR code ?</p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      // TODO: Implémenter scan QR
                      alert('La fonction scan sera disponible prochainement');
                    }}
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Scanner le QR code
                  </Button>
                </div>
              </div>

              {/* Back button */}
              {onBack && (
                <div className="text-center mt-6">
                  <button
                    onClick={onBack}
                    className="text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Retour
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="nickname"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <User className="w-10 h-10 text-green-500" />
                </div>
                <h1 className="text-2xl font-bold text-gray-800">Code validé !</h1>
                <p className="text-gray-600 mt-2">
                  Comment s'appelle votre enfant ?
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                {/* Error message */}
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                    {error}
                  </div>
                )}

                <p className="text-sm text-gray-600 mb-4">
                  Ce prénom ou surnom sera utilisé pour identifier votre enfant.
                  Vous seul(e) le verrez.
                </p>

                <form onSubmit={handleSaveNickname} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prénom ou surnom
                    </label>
                    <Input
                      type="text"
                      value={nickname}
                      onChange={(e) => {
                        setNickname(e.target.value);
                        setError(null);
                      }}
                      placeholder="Ex: Théo, Loulou, Ma puce..."
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600"
                    disabled={isLoading || !nickname.trim()}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        Terminer
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Back button */}
                <button
                  onClick={() => {
                    setStep('code');
                    setError(null);
                  }}
                  className="mt-4 text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-2 mx-auto w-full justify-center"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EnterFamilyCode;
