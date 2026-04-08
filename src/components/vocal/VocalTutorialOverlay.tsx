import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Hand, MicOff, Crown, SkipForward, Clock, X, ChevronRight, CheckCircle2 } from 'lucide-react';

interface VocalTutorialOverlayProps {
  isAnimateur: boolean;
  onClose: () => void;
  lightMode?: boolean;
}

export const VocalTutorialOverlay: React.FC<VocalTutorialOverlayProps> = ({
  isAnimateur,
  onClose,
  lightMode = false
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const participantSlides = [
    {
      id: "discover",
      title: "Découvrez l'Espace",
      description: "Bienvenue dans l'espace vocal ! Vous retrouverez ici les autres parents sous forme de bulles interactives. C'est un espace d'échange sécurisé où la bienveillance est de mise.",
      icon: <Users className="w-12 h-12 text-blue-500" />,
      color: "bg-blue-500/10 border-blue-500/30"
    },
    {
      id: "talk",
      title: "Prendre la Parole",
      description: "Envie de réagir ? Utilisez le bouton « Lever la main » ✋ pour signaler à l'animateur que vous souhaitez intervenir, sans risquer de couper la parole au groupe.",
      icon: <Hand className="w-12 h-12 text-amber-500" />,
      color: "bg-amber-500/10 border-amber-500/30"
    },
    {
      id: "mic",
      title: "Gérer son Micro",
      description: "Pour garantir une bonne écoute commune, pensez à couper votre micro lorsque vous ne vous exprimez pas. Vous éviterez ainsi les bruits parasites.",
      icon: <MicOff className="w-12 h-12 text-orange-500" />,
      color: "bg-orange-500/10 border-orange-500/30"
    }
  ];

  const animateurSlides = [
    {
      id: "manage",
      title: "Gérer les Interventions",
      description: "Vos outils d'animation sont intégrés au centre du groupe. Cliquez sur la bulle d'un participant pour ouvrir le menu : lui donner la parole, le muter ou gérer les avertissements.",
      icon: <Crown className="w-12 h-12 text-amber-500" />,
      color: "bg-amber-500/10 border-amber-500/30"
    },
    {
      id: "structure",
      title: "Suivre la Structure",
      description: "En haut de votre écran, utilisez la flèche violette pour valider une étape et passer à la suivante. Les suggestions de modération s'adapteront automatiquement pour vous guider.",
      icon: <SkipForward className="w-12 h-12 text-violet-500" />,
      color: "bg-violet-500/10 border-violet-500/30"
    },
    {
      id: "close",
      title: "Clôture Bienveillante",
      description: "Gardez un œil sur le chronomètre. C'est vous qui êtes le gardien du temps : à la fin de la séance, vous devrez annoncer la clôture et mettre fin proprement à la session.",
      icon: <Clock className="w-12 h-12 text-emerald-500" />,
      color: "bg-emerald-500/10 border-emerald-500/30"
    }
  ];

  const slides = isAnimateur ? animateurSlides : participantSlides;
  const isLastSlide = currentSlide === slides.length - 1;

  const handleNext = () => {
    if (isLastSlide) {
      onClose();
    } else {
      setCurrentSlide(s => s + 1);
    }
  };

  const currentContent = slides[currentSlide];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className={`absolute inset-0 backdrop-blur-sm ${lightMode ? 'bg-black/30' : 'bg-black/60'}`}
      />
      
      {/* Modal */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`relative w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl ${
          lightMode ? 'bg-white text-gray-800' : 'bg-[#151833] text-white border border-white/10'
        }`}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${
            lightMode ? 'hover:bg-gray-200 text-gray-500' : 'hover:bg-white/10 text-white/50'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 pb-6 flex flex-col items-center text-center">
          {/* Icon Stage */}
          <div className="h-44 flex items-center justify-center w-full">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={currentContent.id}
                initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`w-28 h-28 rounded-[2rem] border-[3px] flex items-center justify-center ${currentContent.color}`}
              >
                {currentContent.icon}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Text Content */}
          <div className="min-h-[130px] w-full flex flex-col justify-start mt-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentContent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <h3 className="text-2xl font-extrabold">{currentContent.title}</h3>
                <p className={`text-[13px] font-medium leading-relaxed ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>
                  {currentContent.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          
        </div>

        {/* Footer & Controls */}
        <div className={`px-8 py-5 relative ${lightMode ? 'bg-gray-50' : 'bg-black/20'}`}>
          <div className="flex items-center justify-between">
            {/* Dots */}
            <div className="flex gap-2">
              {slides.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentSlide 
                      ? `w-6 ${lightMode ? 'bg-orange-500' : 'bg-orange-400'}` 
                      : `w-2 ${lightMode ? 'bg-gray-300' : 'bg-white/20'}`
                  }`}
                />
              ))}
            </div>

            {/* Next / Finish Button */}
            <button
              onClick={handleNext}
              className={`flex items-center gap-2 px-6 py-3 rounded-[20px] font-bold transition-all active:scale-95 shadow-lg ${
                isLastSlide 
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/25' 
                  : lightMode 
                    ? 'bg-gray-900 hover:bg-black text-white shadow-gray-900/25'
                    : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              {isLastSlide ? (
                <>
                  J'ai compris
                  <CheckCircle2 className="w-5 h-5" />
                </>
              ) : (
                <>
                  Suivant
                  <ChevronRight className="w-5 h-5 -mr-1" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
