import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, LogIn } from 'lucide-react';

export const Welcome: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col items-center justify-between overflow-hidden relative">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-orange-200/40 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-[-5%] left-[-5%] w-72 h-72 bg-rose-200/30 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

      <div className="flex-1 flex flex-col items-center justify-center px-6 w-full max-w-md z-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, type: 'spring' }}
          className="relative mb-8"
        >
          <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-2xl" />
          <img
            src="/frame-8.png"
            alt="Parent'aile"
            className="w-48 h-48 md:w-56 md:h-56 object-contain relative transition-transform hover:scale-110 duration-500"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-orange-500 mb-4 tracking-tight">
            Parent'aile
          </h1>
          <p className="text-gray-500 text-lg md:text-xl font-medium leading-relaxed">
            Communiquez simplement avec<br />votre cabinet médical
          </p>
        </motion.div>
      </div>

      {/* Action Area */}
      <div className="w-full max-w-md px-6 pb-12 space-y-4 z-10">

        <div className="flex gap-4">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate('/espace?mode=register')}
            className="flex-1 py-4 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-premium transition-all flex items-center justify-center gap-2 text-sm font-bold"
          >
            <UserPlus className="w-4 h-4 text-white" />
            S'inscrire
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate('/espace?mode=login')}
            className="flex-1 py-4 px-4 glass hover:bg-white/80 text-gray-700 rounded-2xl shadow-glass transition-all flex items-center justify-center gap-2 text-sm font-bold"
          >
            <LogIn className="w-4 h-4 text-orange-500" />
            Connexion
          </motion.button>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center pt-2"
        >
          <a
            href="/"
            className="text-gray-400 text-xs font-semibold hover:text-orange-500 transition-colors uppercase tracking-widest"
          >
            Site Internet →
          </a>
        </motion.p>
      </div>

      <div className="pb-4">
        <p className="text-gray-300 text-[10px] uppercase font-bold tracking-[0.2em]">
          © 2024 Parent'aile
        </p>
      </div>
    </div>
  );
};

export default Welcome;

