import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { BottomNav } from '../../components/ui/BottomNav';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  MessageSquare,
  Check,
  CheckCheck,
  Clock,
  Plus,
  User,
  ChevronDown,
  Baby,
  Calendar
} from 'lucide-react';

interface Child {
  tokenId: string;
  nickname: string;
}

interface Message {
  id: string;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: Date;
}

export const MessageHistory = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [showChildSelector, setShowChildSelector] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [childrenLoaded, setChildrenLoaded] = useState(false);

  useEffect(() => {
    const loadChildren = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate('/espace');
        return;
      }

      try {
        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const q = query(childrenRef, orderBy('addedAt', 'desc'));
        const snapshot = await getDocs(q);

        const childrenData: Child[] = snapshot.docs.map(doc => ({
          tokenId: doc.id,
          nickname: doc.data().nickname
        }));

        // Redirect to settings if no children (tokens) - keep loading state during redirect
        if (childrenData.length === 0) {
          navigate('/espace/parametres', { replace: true });
          return; // Keep isLoading true to avoid flash
        }

        setChildren(childrenData);
        setChildrenLoaded(true);

        const childFromUrl = searchParams.get('childId');
        if (childFromUrl) {
          const found = childrenData.find(c => c.tokenId === childFromUrl);
          if (found) setSelectedChild(found);
        } else if (childrenData.length > 0) {
          setSelectedChild(childrenData[0]);
        }
      } catch (err) {
        console.error('Erreur chargement enfants:', err);
        // On error, redirect to settings as well
        navigate('/espace/parametres', { replace: true });
        return;
      }
    };

    loadChildren();
  }, [navigate, searchParams]);

  useEffect(() => {
    const loadMessages = async () => {
      // Only proceed if children have been loaded
      if (!childrenLoaded) return;

      if (!selectedChild) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const messagesRef = collection(db, 'messages');
        const q = query(
          messagesRef,
          where('tokenId', '==', selectedChild.tokenId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        const messagesData: Message[] = snapshot.docs.map(doc => ({
          id: doc.id,
          content: doc.data().content,
          status: doc.data().status || 'sent',
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));

        setMessages(messagesData);
      } catch (err) {
        console.error('Erreur chargement messages:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [selectedChild, childrenLoaded]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'read':
        return <CheckCheck className="w-4 h-4 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-gray-400" />;
      default:
        return <Check className="w-4 h-4 text-orange-500" />;
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] pb-32">
      {/* Premium Header */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/espace/dashboard')}
              className="p-2 hover:bg-orange-50 rounded-xl transition-colors text-gray-400"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Mes Messages</h1>
          </div>
          <button
             onClick={() => navigate(`/espace/nouveau-message${selectedChild ? `?childId=${selectedChild.tokenId}` : ''}`)}
             className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200"
          >
             <Plus size={20} />
          </button>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-8">
        {/* Child Selector */}
        {children.length > 1 && (
          <div className="mb-8 space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Voir les messages de</label>
            <div className="relative">
              <button
                onClick={() => setShowChildSelector(!showChildSelector)}
                className="w-full h-14 bg-white rounded-2xl border-2 border-gray-100 px-4 flex items-center justify-between shadow-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                    <Baby size={18} />
                  </div>
                  <span className="font-bold text-gray-700">
                    {selectedChild?.nickname || '...'}
                  </span>
                </div>
                <ChevronDown size={18} className={`text-gray-400 transition-transform ${showChildSelector ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showChildSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-premium z-50 overflow-hidden"
                  >
                    {children.map((child) => (
                      <button
                        key={child.tokenId}
                        onClick={() => {
                          setSelectedChild(child);
                          setShowChildSelector(false);
                        }}
                        className={`w-full p-4 flex items-center gap-3 hover:bg-orange-50 transition-colors ${
                          selectedChild?.tokenId === child.tokenId ? 'bg-orange-50' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          selectedChild?.tokenId === child.tokenId ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                          <User size={16} />
                        </div>
                        <span className="font-bold text-gray-700">{child.nickname}</span>
                        {selectedChild?.tokenId === child.tokenId && <Check size={16} className="text-orange-500 ml-auto" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
             <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chargement de l'historique...</p>
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center space-y-6"
          >
             <div className="w-24 h-24 bg-gray-100 rounded-[2.5rem] flex items-center justify-center text-gray-300">
                <MessageSquare size={48} />
             </div>
             <div>
                <h3 className="text-xl font-bold text-gray-800">Aucun message</h3>
                <p className="text-gray-400 text-sm mt-1">Échangez avec votre médecin <br/>pour commencer le suivi de {selectedChild?.nickname}.</p>
             </div>
             <button
                onClick={() => navigate(`/espace/nouveau-message${selectedChild ? `?childId=${selectedChild.tokenId}` : ''}`)}
                className="px-8 h-14 bg-orange-500 text-white rounded-2xl font-bold shadow-premium hover:bg-orange-600 transition-all"
             >
                Envoyer un message
             </button>
          </motion.div>
        ) : (
          <div className="space-y-4">
             {messages.map((msg, idx) => (
               <motion.div
                 key={msg.id}
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: idx * 0.1 }}
                 className="glass rounded-3xl p-6 border-2 border-white shadow-glass hover:shadow-premium transition-all space-y-4"
               >
                 <div className="flex items-center justify-between pb-3 border-b border-black/5">
                    <div className="flex items-center gap-2 text-gray-400">
                       <Calendar size={14} />
                       <span className="text-[10px] font-bold uppercase tracking-widest">{formatDate(msg.createdAt)}</span>
                    </div>
                    <div className="bg-orange-100 px-3 py-1 rounded-full flex items-center gap-1.5">
                       {getStatusIcon(msg.status)}
                       <span className="text-[9px] font-extrabold text-orange-600 uppercase tracking-tight">
                         {msg.status === 'read' ? 'Lu' : 'Envoyé'}
                       </span>
                    </div>
                 </div>
                 <p className="text-gray-700 font-medium leading-relaxed">{msg.content}</p>
                 <div className="flex items-center gap-2 pt-2">
                    <div className="w-6 h-6 bg-orange-50 rounded-lg flex items-center justify-center text-orange-400">
                       <Clock size={12} />
                    </div>
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">
                      Réponse attendue sous 48h
                    </span>
                 </div>
               </motion.div>
             ))}
          </div>
        )}

        <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-12 px-8">
           Les réponses de votre médecin sont transmises par email.
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default MessageHistory;

