import React from 'react';
import { motion } from 'framer-motion';
import { Clock, UserCheck, Mic2, AlertTriangle, Users } from 'lucide-react';

interface Props {
  countdownSec: number;
  canPropose: boolean;
  onPropose: () => void;
  message?: string;
  forceReplacement?: boolean;
  belowMinimum?: boolean;
}

export const AnimateurWaitOverlay: React.FC<Props> = ({
  countdownSec,
  canPropose,
  onPropose,
  message = "En attendant, vous pouvez discuter entre vous !",
  forceReplacement = false,
  belowMinimum = false,
}) => {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const title = belowMinimum
    ? 'Pas assez de participants'
    : forceReplacement
      ? "L'animateur s'est déconnecté plusieurs fois"
      : canPropose
        ? "L'animateur n'est pas là"
        : 'En attente de l\'animateur';

  const subtitle = belowMinimum
    ? countdownSec > 0
      ? 'En attente de plus de participants...'
      : 'La session va être annulée'
    : forceReplacement
      ? 'Un volontaire doit prendre le relais pour continuer'
      : canPropose
        ? 'Quelqu\'un peut prendre le relais !'
        : message;

  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="absolute top-3 left-3 right-3 z-[60] pointer-events-none"
    >
      <div className={`backdrop-blur-xl rounded-2xl px-5 py-4 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.3)] pointer-events-auto ${
        belowMinimum ? 'bg-red-50/95 border border-red-200'
        : forceReplacement ? 'bg-amber-50/95 border border-amber-200'
        : 'bg-white/95'
      }`}>
        {/* Main banner */}
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-11 h-11 relative shrink-0">
            {belowMinimum ? (
              <div className="w-full h-full bg-red-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-red-500" />
              </div>
            ) : forceReplacement ? (
              <div className="w-full h-full bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
            ) : (
              <>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute inset-0 bg-emerald-200 rounded-full"
                />
                <div className="absolute inset-1 bg-emerald-100 rounded-full flex items-center justify-center shadow-inner z-10">
                  <Mic2 className="w-5 h-5 text-emerald-600" />
                </div>
              </>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-black leading-tight ${belowMinimum ? 'text-red-700' : forceReplacement ? 'text-amber-800' : 'text-gray-800'}`}>
              {title}
            </p>
            <p className={`text-xs font-medium truncate ${belowMinimum ? 'text-red-500' : forceReplacement ? 'text-amber-600' : 'text-gray-500'}`}>
              {subtitle}
            </p>
          </div>

          {/* Countdown - only show while counting */}
          {countdownSec > 0 && (
            <div className="bg-gray-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-lg font-black text-gray-700 font-mono tracking-wider">
                {formatTime(countdownSec)}
              </span>
            </div>
          )}
        </div>

        {/* Propose button */}
        {canPropose && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-gray-100"
          >
            <button
              onClick={onPropose}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-lg ${
                forceReplacement
                  ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20'
                  : 'bg-gray-900 text-white hover:bg-gray-800 shadow-gray-900/20'
              }`}
            >
              <UserCheck size={16} />
              Je prends le relais
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
