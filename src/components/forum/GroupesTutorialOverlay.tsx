import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Crown, ChevronRight, X } from 'lucide-react';

interface GroupesTutorialOverlayProps {
  onClose: () => void;
}

export const GroupesTutorialOverlay: React.FC<GroupesTutorialOverlayProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      icon: Heart,
      title: "Le village des parents",
      text: "Bienvenue dans l'espace Groupes. Ici, pas de jugement : c'est un lieu d’écoute et d'entraide entre parents vivant les mêmes défis.",
      color: "text-rose-400",
      bgClass: "bg-rose-500/10"
    },
    {
      icon: MessageCircle,
      title: "Vocal & Chat (7 jours)",
      text: "Trouvez un groupe qui vous parle ! Chaque groupe reste ouvert pendant 7 jours. Vous pouvez ainsi échanger à l'écrit avec les autres inscrits aussi bien avant qu'après la session vocale (qui ouvre 15 minutes avant l'heure).",
      color: "text-emerald-400",
      bgClass: "bg-emerald-500/10"
    },
    {
      icon: Crown,
      title: "Créez votre Session",
      text: "Vous ne trouvez pas votre bonheur ? Créez le vôtre ! C'est simple, et la plateforme vous fournira des trames guidées pour animer les échanges pas à pas.",
      color: "text-amber-400",
      bgClass: "bg-amber-500/10"
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const currentData = steps[currentStep];
  const Icon = currentData.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] flex flex-col justify-end bg-gray-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="relative bg-white w-full rounded-t-[32px] p-6 pb-12 shadow-2xl overflow-hidden"
      >
        {/* Background Decorative Blob */}
        <div className={`absolute -top-20 -right-20 w-48 h-48 rounded-full blur-3xl opacity-50 pointer-events-none transition-colors duration-700 ${currentData.bgClass}`} />
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-20 shadow-sm border border-gray-100"
          aria-label="Fermer"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center mt-6">
          {/* Progress dots */}
          <div className="flex gap-2 mb-8 z-10">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`transition-all duration-300 rounded-full h-1.5 ${
                  currentStep >= i 
                    ? `w-6 bg-orange-500` 
                    : `w-1.5 bg-gray-200`
                }`}
              />
            ))}
          </div>

          <div className="relative w-full h-[280px] flex items-center justify-center z-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -50, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 flex flex-col items-center text-center px-4"
              >
                <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl relative overflow-hidden backdrop-blur-md bg-white border border-gray-100`}>
                  <div className={`absolute inset-0 opacity-20 ${currentData.bgClass}`} />
                  <Icon size={46} className={`relative z-10 ${currentData.color}`} />
                </div>
                
                <h3 className="text-2xl font-black text-gray-800 mb-4 tracking-tight leading-tight">
                  {currentData.title}
                </h3>
                
                <p className="text-sm text-gray-500 font-medium leading-relaxed max-w-[280px]">
                  {currentData.text}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={nextStep}
            className="w-full max-w-[280px] bg-gray-900 border border-gray-800 hover:bg-black text-white px-8 py-4 rounded-[1.25rem] font-extrabold text-[13px] uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-gray-900/20 active:scale-95 transition-all z-10 mt-2"
          >
            {currentStep < steps.length - 1 ? (
              <>Suivant <ChevronRight size={18} /></>
            ) : (
              'J\'ai compris'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
