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

  const bgClass = isDanger
    ? 'bg-red-50/95 border border-red-200'
    : 'bg-amber-50/95 border border-amber-200';

  const titleColor = isDanger ? 'text-red-700' : 'text-amber-800';
  const subtitleColor = isDanger ? 'text-red-500' : 'text-amber-600';

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
            {isDanger ? (
              <div className="w-full h-full bg-red-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-red-500" />
              </div>
            ) : (
              <div className="w-full h-full bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-black leading-tight ${titleColor}`}>
              {title}
            </p>
            <p className={`text-xs font-medium truncate ${subtitleColor}`}>
              <span className="font-bold opacity-70">[{suspensionCount}/2]</span> {subtitle}
            </p>
          </div>

          {/* Countdown */}
          {countdownSec > 0 && (
            <div className="bg-white/50 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0 border border-black/5">
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
            className="mt-3 pt-3 border-t border-black/5"
          >
            <button
              onClick={action.onClick}
              disabled={action.loading}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-wait ${btnClass}`}
            >
              <UserCheck size={16} />
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
