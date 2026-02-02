/**
 * SplashScreen - Animation d'accueil Parent'aile
 *
 * - Animation Lottie (arbre + papillon)
 * - Skip automatique après 1ère visite (localStorage)
 * - Durée: ~3 secondes
 */

import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  onComplete: () => void;
  forceShow?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  forceShow = false
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    // Vérifier si c'est la première visite
    const hasSeenSplash = localStorage.getItem('parentaile_splash_seen');

    if (hasSeenSplash && !forceShow) {
      // Skip l'animation
      setIsVisible(false);
      onComplete();
      return;
    }

    // Charger l'animation
    fetch('/animations/tree-splash.json')
      .then(res => res.json())
      .then(data => setAnimationData(data))
      .catch(err => {
        console.error('Erreur chargement animation:', err);
        // En cas d'erreur, continuer sans animation
        setIsVisible(false);
        onComplete();
      });

    // Timer pour terminer l'animation
    const timer = setTimeout(() => {
      localStorage.setItem('parentaile_splash_seen', 'true');
      setIsVisible(false);
      // Petit délai pour la transition de sortie
      setTimeout(onComplete, 500);
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete, forceShow]);

  // Si pas visible ou pas d'animation, ne rien afficher
  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] bg-gradient-to-b from-orange-50 via-white to-orange-100 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            {/* Animation Lottie */}
            <div className="w-64 h-64 md:w-80 md:h-80">
              {animationData ? (
                <Lottie
                  animationData={animationData}
                  loop={false}
                  autoplay={true}
                />
              ) : (
                // Fallback pendant le chargement
                <div className="w-full h-full flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [0.8, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-6xl"
                  >
                    🦋
                  </motion.div>
                </div>
              )}
            </div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              className="text-gray-600 text-lg mt-4 text-center px-4"
            >
              Il faut tout un village pour élever un enfant
            </motion.p>
          </div>

          {/* Skip button (optionnel) */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            onClick={() => {
              localStorage.setItem('parentaile_splash_seen', 'true');
              setIsVisible(false);
              setTimeout(onComplete, 300);
            }}
            className="absolute bottom-8 text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            Passer →
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
