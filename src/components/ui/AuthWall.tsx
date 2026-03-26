import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, LucideIcon } from 'lucide-react';

interface AuthWallProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  fullHeight?: boolean;
}

export const AuthWall: React.FC<AuthWallProps> = ({ 
  title = "Rejoignez la communauté", 
  description = "Connectez-vous ou inscrivez-vous pour accéder à cet espace et échanger avec d'autres parents.",
  icon: Icon = Users,
  fullHeight = true
}) => {
  const navigate = useNavigate();

  const content = (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-premium relative overflow-hidden"
    >
      {/* Decorative background gradient */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-orange-400 to-orange-500 opacity-10" />

      <div className="relative text-center space-y-6">
        <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto text-orange-500 shadow-sm border border-orange-200/50">
          <Icon size={40} />
        </div>

        <div>
          <h3 className="text-2xl font-black text-gray-800 tracking-tight leading-tight">
            {title}
          </h3>
          <p className="text-sm text-gray-500 mt-3 font-medium leading-relaxed">
            {description}
          </p>
        </div>

        <div className="pt-4 space-y-3">
          <button
            onClick={() => navigate('/espace?mode=register')}
            className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-premium hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            S'inscrire
          </button>
          <button
            onClick={() => navigate('/espace?mode=login')}
            className="w-full py-4 bg-orange-50 text-orange-600 rounded-2xl font-bold text-sm hover:bg-orange-100 active:scale-[0.98] transition-all"
          >
            Se connecter
          </button>
        </div>
      </div>
    </motion.div>
  );

  if (!fullHeight) return content;

  return (
    <div className="h-full bg-[#FFFBF0] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
      {content}
    </div>
  );
};

export default AuthWall;
