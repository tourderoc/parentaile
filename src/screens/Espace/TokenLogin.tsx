/**
 * TokenLogin - Page d'erreur token ou saisie manuelle
 *
 * Affichée quand :
 * - Le token est invalide/expiré/révoqué
 * - L'utilisateur veut saisir manuellement un token
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { AlertCircle, QrCode, Home, ArrowRight, Loader2 } from 'lucide-react';
import { validateToken } from '../../lib/tokenService';

interface TokenLoginProps {
  error?: string | null;
  onRetry: () => void;
  onManualToken: (token: string) => void;
}

export const TokenLogin: React.FC<TokenLoginProps> = ({
  error,
  onRetry,
  onManualToken
}) => {
  const [manualToken, setManualToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = manualToken.trim().toLowerCase();
    if (!token) {
      setValidationError('Veuillez saisir votre code');
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    const result = await validateToken(token);

    if (result.valid) {
      onManualToken(token);
    } else {
      setValidationError(result.error || 'Code invalide');
    }

    setIsValidating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <QrCode className="w-10 h-10 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Espace Patient</h1>
          <p className="text-gray-600 mt-2">Parent'aile</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Manual token input */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Saisir votre code manuellement
          </h2>

          <p className="text-gray-600 text-sm mb-4">
            Entrez le code qui vous a été remis par votre médecin.
            Il se trouve sous le QR code sur le document.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Ex: abc123xyz789"
                value={manualToken}
                onChange={(e) => {
                  setManualToken(e.target.value);
                  setValidationError(null);
                }}
                className="text-center text-lg tracking-wider"
                autoFocus
              />
              {validationError && (
                <p className="text-red-500 text-sm mt-2">{validationError}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600"
              disabled={isValidating}
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Vérification...
                </>
              ) : (
                <>
                  Continuer
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Separator */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-500">ou</span>
            </div>
          </div>

          {/* Already have account */}
          <Button
            variant="outline"
            className="w-full"
            onClick={onRetry}
          >
            J'ai déjà un compte
          </Button>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link to="/" className="text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-2">
            <Home className="w-4 h-4" />
            Retour à l'accueil
          </Link>
        </div>

        {/* Help text */}
        <div className="text-center mt-6">
          <p className="text-gray-400 text-xs">
            Vous n'avez pas de code ? Demandez-en un à votre médecin.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TokenLogin;
