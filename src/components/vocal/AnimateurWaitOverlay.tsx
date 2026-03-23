import React from 'react';
import { motion } from 'framer-motion';
import { Clock, UserCheck, Mic2 } from 'lucide-react';

interface Props {
  countdownSec: number;
  canPropose: boolean;
  onPropose: () => void;
  message?: string;
}

export const AnimateurWaitOverlay: React.FC<Props> = ({
  countdownSec,
  canPropose,
  onPropose,
  message = "La session commencera dès qu'il nous rejoindra. Préparez un endroit calme !"
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
        <div className="w-20 h-20 relative mx-auto">
          {/* Animated rings */}
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="absolute inset-0 bg-emerald-200 rounded-full"
          />
          <div className="absolute inset-2 bg-emerald-100 rounded-full flex items-center justify-center shadow-inner z-10">
            <Mic2 className="w-8 h-8 text-emerald-600" />
          </div>
        </div>

        <h3 className="text-2xl font-black text-gray-800 tracking-tight">
          En attente de l'animateur
        </h3>
        
        <p className="text-gray-500 font-medium leading-relaxed">
          {message}
        </p>

        <div className="bg-gray-50 py-3 rounded-2xl flex items-center justify-center space-x-3 text-3xl font-black text-gray-700 font-mono tracking-widest shadow-inner">
          <Clock className="w-7 h-7 text-gray-400" />
          <span>{formatTime(countdownSec)}</span>
        </div>

        {canPropose && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4 border-t border-gray-100"
          >
            <p className="text-sm font-medium text-gray-500 mb-4 px-2">
              L'animateur semble bloqué. L'un de vous souhaite-t-il lancer l'échange pour ne pas annuler ce groupe ?
            </p>
            <button
              onClick={onPropose}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-gray-900/20"
            >
              <UserCheck size={20} />
              Je lance la discussion
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
