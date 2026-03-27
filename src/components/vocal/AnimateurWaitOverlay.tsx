import React from 'react';
import { motion } from 'framer-motion';
import { Clock, UserCheck, Mic2, AlertTriangle, Users } from 'lucide-react';

interface Props {
  title: string;
  subtitle: string;
  countdownSec: number;
  variant: 'info' | 'warning' | 'danger';
  action?: { label: string; onClick: () => void; loading?: boolean };
}

export const CountdownOverlay: React.FC<Props> = ({
  title,
  subtitle,
  countdownSec,
  variant,
  action,
}) => {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const bgClass = variant === 'danger'
    ? 'bg-red-50/95 border border-red-200'
    : variant === 'warning'
      ? 'bg-amber-50/95 border border-amber-200'
      : 'bg-white/95';

  const titleColor = variant === 'danger'
    ? 'text-red-700'
    : variant === 'warning'
      ? 'text-amber-800'
      : 'text-gray-800';

  const subtitleColor = variant === 'danger'
    ? 'text-red-500'
    : variant === 'warning'
      ? 'text-amber-600'
      : 'text-gray-500';

  const btnClass = variant === 'warning'
    ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20'
    : 'bg-gray-900 text-white hover:bg-gray-800 shadow-gray-900/20';

  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="absolute top-3 left-3 right-3 z-[60] pointer-events-none"
    >
      <div className={`backdrop-blur-xl rounded-2xl px-5 py-4 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.3)] pointer-events-auto ${bgClass}`}>
        {/* Main banner */}
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-11 h-11 relative shrink-0">
            {variant === 'danger' ? (
              <div className="w-full h-full bg-red-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-red-500" />
              </div>
            ) : variant === 'warning' ? (
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
            <p className={`text-sm font-black leading-tight ${titleColor}`}>
              {title}
            </p>
            <p className={`text-xs font-medium truncate ${subtitleColor}`}>
              {subtitle}
            </p>
          </div>

          {/* Countdown */}
          {countdownSec > 0 && (
            <div className="bg-gray-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-lg font-black text-gray-700 font-mono tracking-wider">
                {formatTime(countdownSec)}
              </span>
            </div>
          )}
        </div>

        {/* Action button */}
        {action && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-gray-100"
          >
            <button
              onClick={action.onClick}
              disabled={action.loading}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-wait ${btnClass}`}
            >
              <UserCheck size={16} />
              {action.loading ? 'En cours...' : action.label}
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// Keep backward compatibility export
export { CountdownOverlay as AnimateurWaitOverlay };
