import { motion } from 'framer-motion';
import { Mic, Users, MessageCircle } from 'lucide-react';

export const SlideForum = () => {
  return (
    <div className="h-full bg-[#FFFBF0] overflow-y-auto pb-32">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-4">
          <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Forum Vocal</h1>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-12 flex flex-col items-center text-center space-y-8">
        {/* Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-32 h-32 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[2.5rem] flex items-center justify-center shadow-premium transform rotate-6"
        >
          <Mic size={64} className="text-white" />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">
            Forum Vocal
          </h2>
          <p className="text-orange-500 font-bold text-sm uppercase tracking-widest">
            Bientot disponible
          </p>
        </motion.div>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-gray-500 font-medium leading-relaxed max-w-xs"
        >
          Un espace d'echange vocal entre parents.
          Partagez vos experiences, posez vos questions et soutenez-vous mutuellement.
        </motion.p>

        {/* Features preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-xs space-y-3 pt-4"
        >
          <div className="glass rounded-2xl p-4 flex items-center gap-4 border-2 border-white shadow-glass">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-500">
              <Mic size={20} />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-800 text-sm">Messages vocaux</p>
              <p className="text-[10px] text-gray-400">Parlez au lieu d'ecrire</p>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 flex items-center gap-4 border-2 border-white shadow-glass">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-500">
              <Users size={20} />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-800 text-sm">Communaute de parents</p>
              <p className="text-[10px] text-gray-400">Echangez entre familles</p>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 flex items-center gap-4 border-2 border-white shadow-glass">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-500">
              <MessageCircle size={20} />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-800 text-sm">Discussions thematiques</p>
              <p className="text-[10px] text-gray-400">Scolarite, sommeil, quotidien...</p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default SlideForum;
