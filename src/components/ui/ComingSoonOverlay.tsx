import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';

interface ComingSoonOverlayProps {
  title?: string;
  message?: string;
  showBackButton?: boolean;
}

/**
 * Overlay "Bientôt disponible" pour les fonctionnalités grisées en V0
 * Utilisé pour : Forum, Ateliers, Boutique, Teleconsultation
 */
export const ComingSoonOverlay: React.FC<ComingSoonOverlayProps> = ({
  title = "Bientôt disponible",
  message = "Cette fonctionnalité sera disponible prochainement. Merci de votre patience !",
  showBackButton = true
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto bg-orange-100 rounded-full flex items-center justify-center">
            <Clock className="w-12 h-12 text-orange-500" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          {title}
        </h1>

        {/* Message */}
        <p className="text-gray-600 mb-8 leading-relaxed">
          {message}
        </p>

        {/* Decorative element */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-2 h-2 bg-orange-300 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>

        {/* Back button */}
        {showBackButton && (
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </button>
        )}

        {/* Footer note */}
        <p className="mt-8 text-sm text-gray-400">
          Parent'aile - Votre espace de soutien parental
        </p>
      </div>
    </div>
  );
};

/**
 * Wrapper pour protéger une route avec l'overlay "Bientôt disponible"
 */
interface ComingSoonRouteProps {
  children: React.ReactNode;
  enabled?: boolean;
  title?: string;
  message?: string;
}

export const ComingSoonRoute: React.FC<ComingSoonRouteProps> = ({
  children,
  enabled = false,
  title,
  message
}) => {
  if (!enabled) {
    return <ComingSoonOverlay title={title} message={message} />;
  }
  return <>{children}</>;
};

export default ComingSoonOverlay;
