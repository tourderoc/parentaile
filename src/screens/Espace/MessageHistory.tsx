import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
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
  Stethoscope,
  Send,
  AlertCircle,
  X,
  Mail,
  Trash2,
  ExternalLink,
  Bell,
  Zap
} from 'lucide-react';
import {
  DoctorNotification,
  getNotificationsForMessage,
  getNotificationIcon,
  markNotificationAsRead
} from '../../lib/doctorNotifications';
import { clearAppBadge } from '../../lib/pushNotifications';

interface Child {
  tokenId: string;
  nickname: string;
}

interface Message {
  id: string;
  content: string;
  status: 'pending' | 'replied' | 'treated';
  createdAt: Date;
  // Réponse du médecin
  replyContent?: string;
  replyDate?: Date;
  replyAuthor?: string;
}

// Configuration des statuts
const statusConfig = {
  pending: {
    label: 'En attente',
    color: 'bg-orange-100 text-orange-600',
    icon: Clock,
    description: 'Réponse attendue sous 48h'
  },
  replied: {
    label: 'Réponse reçue',
    color: 'bg-blue-100 text-blue-600',
    icon: CheckCheck,
    description: 'Le médecin a répondu'
  },
  treated: {
    label: 'Traité',
    color: 'bg-green-100 text-green-600',
    icon: Check,
    description: 'Demande traitée'
  }
};

export const MessageHistory = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [showChildSelector, setShowChildSelector] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [messageNotifications, setMessageNotifications] = useState<DoctorNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Effacer le badge de l'icône quand on consulte les messages
  useEffect(() => {
    clearAppBadge();
  }, []);

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
        console.log('🔍 Recherche messages pour tokenId:', selectedChild.tokenId);

        const messagesRef = collection(db, 'messages');
        const q = query(
          messagesRef,
          where('tokenId', '==', selectedChild.tokenId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        console.log('📨 Messages trouvés:', snapshot.docs.length);

        const messagesData: Message[] = snapshot.docs.map(doc => {
          const data = doc.data();
          // Convertir les anciens statuts vers les nouveaux
          let status: Message['status'] = 'pending';
          if (data.status === 'treated' || data.status === 'read') {
            status = 'treated';
          } else if (data.replyContent) {
            status = 'replied';
          } else if (data.status === 'replied') {
            status = 'replied';
          }

          return {
            id: doc.id,
            content: data.content,
            status,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            replyContent: data.replyContent,
            replyDate: data.replyDate?.toDate?.(),
            replyAuthor: data.replyAuthor || 'Dr.'
          };
        });

        setMessages(messagesData);
      } catch (err) {
        console.error('Erreur chargement messages:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [selectedChild, childrenLoaded]);

  // Charger les notifications quand un message est sélectionné
  useEffect(() => {
    const loadNotifications = async () => {
      if (!selectedMessage) {
        setMessageNotifications([]);
        return;
      }

      setLoadingNotifications(true);
      try {
        const notifications = await getNotificationsForMessage(selectedMessage.id);
        setMessageNotifications(notifications);

        // Marquer comme lues
        for (const notif of notifications.filter(n => !n.read)) {
          await markNotificationAsRead(notif.id);
        }
      } catch (error) {
        console.error('Erreur chargement notifications:', error);
      } finally {
        setLoadingNotifications(false);
      }
    };

    loadNotifications();
  }, [selectedMessage]);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Aujourd'hui à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days === 1) {
      return `Hier à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const formatShortDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // Supprimer un message de Firebase
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    
    setIsDeleting(true);
    try {
      // Supprimer le message de la collection 'messages'
      await deleteDoc(doc(db, 'messages', selectedMessage.id));
      
      // Mettre à jour la liste locale
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
      
      // Fermer les modals
      setShowDeleteConfirm(false);
      setSelectedMessage(null);
      
      console.log('✅ Message supprimé:', selectedMessage.id);
    } catch (error) {
      console.error('❌ Erreur suppression message:', error);
    } finally {
      setIsDeleting(false);
    }
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
          <div className="space-y-3">
             {/* Liste compacte des messages (inbox style) */}
             {messages.map((msg, idx) => {
               const config = statusConfig[msg.status];
               const StatusIcon = config.icon;
               const hasReply = !!msg.replyContent;

               return (
                 <motion.button
                   key={msg.id}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: idx * 0.03 }}
                   onClick={() => setSelectedMessage(msg)}
                   className="w-full bg-white rounded-2xl p-4 border-2 border-gray-100 shadow-sm hover:border-orange-200 hover:shadow-md transition-all text-left"
                 >
                   <div className="flex items-start gap-3">
                     {/* Indicateur statut */}
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                       hasReply ? 'bg-blue-100 text-blue-500' : 'bg-orange-100 text-orange-500'
                     }`}>
                       {hasReply ? <Stethoscope size={18} /> : <Send size={16} />}
                     </div>

                     {/* Contenu */}
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between mb-1">
                         <span className="text-[10px] text-gray-400 font-medium">
                           {formatShortDate(msg.createdAt)}
                         </span>
                         <div className={`px-2 py-0.5 rounded-full flex items-center gap-1 ${config.color}`}>
                           <StatusIcon size={10} />
                           <span className="text-[8px] font-bold uppercase">
                             {config.label}
                           </span>
                         </div>
                       </div>

                       {/* Aperçu du message */}
                       <p className="text-gray-700 font-medium text-sm line-clamp-2">
                         {msg.content}
                       </p>

                       {/* Indicateur réponse */}
                       {hasReply && (
                         <div className="flex items-center gap-1.5 mt-2 text-blue-500">
                           <CheckCheck size={12} />
                           <span className="text-[10px] font-bold">Réponse du médecin</span>
                         </div>
                       )}

                       {/* Badge notification (visible sur les messages avec statut replied mais sans contenu de réponse) */}
                       {msg.status === 'replied' && !hasReply && (
                         <div className="flex items-center gap-1.5 mt-2 text-green-600">
                           <Bell size={12} />
                           <span className="text-[10px] font-bold">Notification reçue - Voir détails</span>
                         </div>
                       )}
                     </div>

                     {/* Chevron */}
                     <ChevronDown size={16} className="text-gray-300 -rotate-90 flex-shrink-0 mt-2" />
                   </div>
                 </motion.button>
               );
             })}
          </div>
        )}

        {/* Modal détail message */}
        <AnimatePresence>
          {selectedMessage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
              onClick={() => setSelectedMessage(null)}
            >
              <motion.div
                initial={{ y: 100, scale: 0.95 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 100, scale: 0.95 }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-md max-h-[85vh] overflow-y-auto pb-24 sm:pb-0"
              >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                  <h3 className="font-bold text-gray-800">Détail du message</h3>
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-2 bg-gray-100 rounded-xl text-gray-400"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Réponse du médecin (si existe et ce n'est pas juste un marqueur email) */}
                  {selectedMessage.replyContent &&
                   !selectedMessage.replyContent.includes('[Réponse envoyée par email]') && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500">
                          <Stethoscope size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                            {selectedMessage.replyAuthor || 'Réponse du médecin'}
                          </p>
                          {selectedMessage.replyDate && (
                            <p className="text-[10px] text-gray-400">
                              {formatDate(selectedMessage.replyDate)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                        <p className="text-blue-800 font-medium leading-relaxed">
                          {selectedMessage.replyContent}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Notifications du médecin liées à ce message */}
                  {loadingNotifications ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : messageNotifications.length > 0 && (
                    <div className="space-y-3">
                      {messageNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`rounded-2xl p-4 border-2 ${
                            notif.type === 'EmailReply'
                              ? 'bg-green-50 border-green-200'
                              : notif.type === 'Quick'
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-blue-50 border-blue-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icône type */}
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                              notif.type === 'EmailReply'
                                ? 'bg-green-100'
                                : notif.type === 'Quick'
                                ? 'bg-orange-100'
                                : 'bg-blue-100'
                            }`}>
                              {getNotificationIcon(notif.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                                  notif.type === 'EmailReply'
                                    ? 'text-green-600'
                                    : notif.type === 'Quick'
                                    ? 'text-orange-600'
                                    : 'text-blue-600'
                                }`}>
                                  {notif.type === 'EmailReply' ? 'Réponse reçue' : notif.senderName}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {formatDate(notif.createdAt)}
                                </span>
                              </div>

                              <p className={`font-bold text-sm ${
                                notif.type === 'EmailReply'
                                  ? 'text-green-800'
                                  : notif.type === 'Quick'
                                  ? 'text-orange-800'
                                  : 'text-blue-800'
                              }`}>
                                {notif.title}
                              </p>

                              <p className={`text-sm mt-1 ${
                                notif.type === 'EmailReply'
                                  ? 'text-green-700'
                                  : notif.type === 'Quick'
                                  ? 'text-orange-700'
                                  : 'text-blue-700'
                              }`}>
                                {notif.body}
                              </p>

                              {/* Info supplémentaire pour EmailReply */}
                              {notif.type === 'EmailReply' && (
                                <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-green-100 rounded-xl">
                                  <Mail size={16} className="text-green-600" />
                                  <span className="text-green-700 text-xs font-medium">
                                    Consultez votre boîte mail pour lire la réponse complète
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message du parent */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-500">
                          <Send size={14} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">
                            Votre message
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {formatDate(selectedMessage.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-full flex items-center gap-1 ${statusConfig[selectedMessage.status].color}`}>
                        {(() => {
                          const StatusIcon = statusConfig[selectedMessage.status].icon;
                          return <StatusIcon size={12} />;
                        })()}
                        <span className="text-[9px] font-bold uppercase">
                          {statusConfig[selectedMessage.status].label}
                        </span>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <p className="text-gray-700 font-medium leading-relaxed">
                        {selectedMessage.content}
                      </p>
                    </div>
                  </div>

                  {/* Info statut */}
                  {selectedMessage.status === 'pending' && (
                    <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                      <AlertCircle size={20} className="text-orange-500 flex-shrink-0" />
                      <div>
                        <p className="text-orange-700 font-bold text-sm">En attente de réponse</p>
                        <p className="text-orange-600 text-xs">Le médecin répondra sous 48h</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 space-y-2">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full h-12 bg-red-50 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={18} />
                    Supprimer ce message
                  </button>
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="w-full h-12 bg-gray-100 text-gray-600 rounded-2xl font-bold"
                  >
                    Fermer
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-12 px-8">
           Les réponses de votre médecin sont transmises par email.
        </p>
      </main>

      {/* Modal de confirmation de suppression */}
      <AnimatePresence>
        {showDeleteConfirm && selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[200] flex items-center justify-center px-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-red-100 rounded-2xl flex items-center justify-center mb-4">
                  <Trash2 size={32} className="text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Supprimer ce message ?</h3>
                <p className="text-gray-500 text-sm mb-6">
                  {selectedMessage.replyContent 
                    ? "Ce message et la réponse du médecin seront supprimés définitivement."
                    : "Ce message sera supprimé définitivement."}
                </p>
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={handleDeleteMessage}
                  disabled={isDeleting}
                  className="w-full h-12 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={18} />
                      Supprimer
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="w-full h-12 bg-gray-100 text-gray-600 rounded-2xl font-bold disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

