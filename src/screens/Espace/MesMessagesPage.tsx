import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Inbox } from 'lucide-react';
import { motion } from 'framer-motion';
import { MessageHistory } from './MessageHistory';

export const MesMessagesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/espace/mon-espace')}
            className="w-10 h-10 glass rounded-xl flex items-center justify-center shadow-glass active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <Inbox size={18} className="text-blue-500" />
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Mes Messages</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <MessageHistory />
      </div>
    </div>
  );
};

export default MesMessagesPage;
