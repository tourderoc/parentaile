import React from 'react';
import { motion } from 'framer-motion';
import { OctagonAlert, CalendarClock, MessageCircle, Users } from 'lucide-react';
import { BottomNav } from '../ui/BottomNav';

interface Props {
  reason: string;
  theme?: string;
  onGoHome: () => void;
  onDiscussForum: () => void;
  onReschedule?: () => void;
  onBrowseGroups?: () => void;
  isCreator: boolean;
}

export const CancellationScreen: React.FC<Props> = ({
  reason,
  onGoHome,
  onDiscussForum,
  onReschedule,
  onBrowseGroups,
  isCreator
}) => {
  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-100 rounded-full blur-3xl opacity-50 border-white" />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="max-w-sm w-full z-10 space-y-8"
      >
        <div className="w-24 h-24 bg-white/60 backdrop-blur-sm text-red-500 rounded-full flex items-center justify-center mx-auto shadow-sm ring-4 ring-white">
          <OctagonAlert size={40} strokeWidth={2.5} />
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">
            Session Annulée
          </h1>
          <p className="text-gray-600 font-medium text-lg leading-relaxed px-4">
            {reason}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-6 rounded-[2rem] shadow-xl shadow-orange-100/50 border border-white space-y-4">
          <h3 className="font-extrabold text-gray-800 text-lg mb-2">Alternatives</h3>
          
          <button onClick={onDiscussForum} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-orange-50/50 hover:bg-orange-100/80 transition-all text-left group border border-orange-100/60">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-orange-500 shadow-sm group-hover:scale-110 group-active:scale-95 transition-transform">
              <MessageCircle size={22} strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-bold text-gray-800 leading-tight">En discuter sur le Forum</div>
              <div className="text-sm text-gray-500 font-medium mt-0.5">Continuer l'échange à l'écrit</div>
            </div>
          </button>

          {!isCreator && onBrowseGroups && (
            <button onClick={onBrowseGroups} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-emerald-50/50 hover:bg-emerald-100/80 transition-all text-left group border border-emerald-100/60">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-emerald-500 shadow-sm group-hover:scale-110 group-active:scale-95 transition-transform">
                <Users size={22} strokeWidth={2.5} />
              </div>
              <div>
                <div className="font-bold text-gray-800 leading-tight">Rejoindre un autre groupe</div>
                <div className="text-sm text-gray-500 font-medium mt-0.5">Voir les prochains groupes disponibles</div>
              </div>
            </button>
          )}

          {isCreator && onReschedule && (
            <button onClick={onReschedule} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-blue-50/50 hover:bg-blue-100/80 transition-all text-left group border border-blue-100/60">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-blue-500 shadow-sm group-hover:scale-110 group-active:scale-95 transition-transform">
                <CalendarClock size={22} strokeWidth={2.5} />
              </div>
              <div>
                <div className="font-bold text-gray-800 leading-tight">Reprogrammer</div>
                <div className="text-sm text-gray-500 font-medium mt-0.5">Créer une nouvelle date</div>
              </div>
            </button>
          )}

        </div>

        <div className="text-center pt-4">
          <button
            onClick={onGoHome}
            className="font-bold text-gray-400 hover:text-gray-600 transition-colors px-6 py-2"
          >
            Retour à l'accueil
          </button>
        </div>
      </motion.div>
      <div className="absolute bottom-0 inset-x-0">
        <BottomNav />
      </div>
    </div>
  );
};
