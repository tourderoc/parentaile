import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Clock, Users, Radio } from 'lucide-react';
import { useUpcomingGroup } from '../../lib/upcomingGroupContext';
import type { Urgency } from '../../lib/upcomingGroupContext';

const urgencyStyles: Record<Exclude<Urgency, 'none'>, {
  bg: string;
  border: string;
  icon: string;
  title: string;
  button: string;
}> = {
  calm: {
    bg: 'bg-sky-50/90',
    border: 'border-sky-200/60',
    icon: 'text-sky-500',
    title: 'text-sky-800',
    button: 'bg-sky-500 hover:bg-sky-600',
  },
  warm: {
    bg: 'bg-orange-50/90',
    border: 'border-orange-200/60',
    icon: 'text-orange-500',
    title: 'text-orange-800',
    button: 'bg-orange-500 hover:bg-orange-600',
  },
  urgent: {
    bg: 'bg-emerald-50/90',
    border: 'border-emerald-200/60',
    icon: 'text-emerald-500',
    title: 'text-emerald-800',
    button: 'bg-emerald-500 hover:bg-emerald-600',
  },
};

export const UpcomingGroupCard = () => {
  const navigate = useNavigate();
  const { upcomingGroup, minutesLeft, urgency, dismiss } = useUpcomingGroup();

  if (!upcomingGroup || urgency === 'none') return null;

  const styles = urgencyStyles[urgency];
  const participantCount = upcomingGroup.participants.length;

  // Texte adapte au niveau d'urgence
  let statusText: string;
  let subtitleText: string;

  if (minutesLeft <= 0) {
    statusText = 'Votre groupe est en cours !';
    subtitleText = `${participantCount} parent${participantCount > 1 ? 's' : ''} dans la salle`;
  } else if (minutesLeft <= 5) {
    statusText = 'Votre groupe commence !';
    subtitleText = `${participantCount} parent${participantCount > 1 ? 's' : ''} vous attendent`;
  } else if (minutesLeft <= 15) {
    statusText = `La salle est ouverte`;
    subtitleText = `"${upcomingGroup.titre}" dans ${minutesLeft} min`;
  } else {
    statusText = `Votre groupe dans ${minutesLeft} min`;
    subtitleText = `"${upcomingGroup.titre}"`;
  }

  const IconComponent = urgency === 'urgent' ? Radio : urgency === 'warm' ? Mic : Clock;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className="px-4 pt-2 relative z-30"
      >
        <div className={`${styles.bg} ${styles.border} border backdrop-blur-xl rounded-2xl p-3 shadow-sm`}>
          <div className="flex items-center gap-3">
            {/* Icone avec pulse pour urgent */}
            <div className="relative">
              {urgency === 'urgent' && (
                <div className={`absolute inset-0 ${styles.icon} rounded-full animate-ping opacity-30`} />
              )}
              <div className={`w-10 h-10 rounded-xl ${urgency === 'urgent' ? 'bg-emerald-100' : urgency === 'warm' ? 'bg-orange-100' : 'bg-sky-100'} flex items-center justify-center`}>
                <IconComponent size={20} className={styles.icon} />
              </div>
            </div>

            {/* Texte */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${styles.title} truncate`}>{statusText}</p>
              <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                <Users size={12} />
                {subtitleText}
              </p>
            </div>

            {/* Bouton Rejoindre */}
            <button
              onClick={() => navigate(`/espace/groupes/${upcomingGroup.id}/vocal`)}
              className={`${styles.button} text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 whitespace-nowrap`}
            >
              Rejoindre
            </button>

            {/* Bouton dismiss */}
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(); }}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpcomingGroupCard;
