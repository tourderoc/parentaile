import React from 'react';
import { motion } from 'framer-motion';
import { Clock, AlertCircle, UserCheck, Users } from 'lucide-react';

interface Props {
  title: string;
  subtitle: string;
  countdownSec: number;
  suspensionCount: number;
  variant: 'warning' | 'danger';
  action?: { label: string; onClick: () => void; loading?: boolean };
  secondaryAction?: { label: string; onClick: () => void };
}

export const SuspensionOverlay: React.FC<Props> = ({
  title,
  subtitle,
  countdownSec,
  suspensionCount,
  variant,
  action,
  secondaryAction,
}) => {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isDanger = variant === 'danger';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
    >
      <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] space-y-6">
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ring-4 ${
          isDanger ? 'bg-red-100 ring-red-50' : 'bg-orange-100 ring-orange-50'
        }`}>
          {isDanger
            ? <Users className="w-8 h-8 text-red-500" />
            : <AlertCircle className="w-8 h-8 text-orange-500" />
          }
        </div>

        <h3 className="text-2xl font-black text-gray-800 tracking-tight">
          {title}
        </h3>

        <p className="text-gray-500 font-medium leading-relaxed">
          {subtitle}
        </p>

        <div className={`py-3 rounded-2xl flex items-center justify-center space-x-3 text-3xl font-black font-mono tracking-widest shadow-inner ${
          isDanger ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-orange-500'
        }`}>
          <Clock className={`w-7 h-7 ${isDanger ? 'text-red-400' : 'text-orange-400'}`} />
          <span>{formatTime(countdownSec)}</span>
        </div>

        <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">
          Suspension {suspensionCount}/2 avant annulation
        </div>

        {action && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="pt-4 border-t border-gray-100 space-y-4"
          >
            <p className="text-sm text-gray-500 font-medium">
              L'animateur tarde à revenir ? L'un de vous peut reprendre le flambeau temporairement !
            </p>
            <button
              onClick={action.onClick}
              disabled={action.loading}
              className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-4 rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-wait"
            >
              <UserCheck size={20} />
              {action.loading ? 'En cours...' : action.label}
            </button>
            
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className="w-full mt-2 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
              >
                {secondaryAction.label}
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
