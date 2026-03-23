import React from 'react';
import { motion } from 'framer-motion';
import { Clock, AlertCircle, UserCheck } from 'lucide-react';

interface Props {
  reason?: 'animateur_left' | 'below_minimum';
  countdownSec: number;
  canPropose: boolean;
  onPropose: () => void;
  suspensionCount: number; // max 2
}

export const SuspensionOverlay: React.FC<Props> = ({
  reason,
  countdownSec,
  canPropose,
  onPropose,
  suspensionCount
}) => {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
    >
      <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] space-y-6">
        <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center ring-4 ring-orange-50">
          <AlertCircle className="w-8 h-8 text-orange-500" />
        </div>
        
        <h3 className="text-2xl font-black text-gray-800 tracking-tight">
          Session suspendue
        </h3>
        
        <p className="text-gray-500 font-medium leading-relaxed">
          {reason === 'animateur_left'
            ? "L'animateur a quitté la salle. Les connexions peuvent parfois couper, attendons son retour."
            : "Il n'y a pas assez de participants pour continuer l'échange de façon fluide."}
        </p>

        <div className="bg-gray-50 py-3 rounded-2xl flex items-center justify-center space-x-3 text-3xl font-black text-orange-500 font-mono tracking-widest shadow-inner">
          <Clock className="w-7 h-7 text-orange-400" />
          <span>{formatTime(countdownSec)}</span>
        </div>
        
        <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">
          Suspension {suspensionCount}/2 avant annulation
        </div>

        {canPropose && reason === 'animateur_left' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="pt-4 border-t border-gray-100 space-y-4"
          >
            <p className="text-sm text-gray-500 font-medium">
              L'animateur tarde à revenir ? L'un de vous peut reprendre le flambeau temporairement !
            </p>
            <button
              onClick={onPropose}
              className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-4 rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-orange-500/25"
            >
              <UserCheck size={20} />
              Rejoindre en tant qu'animateur
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
