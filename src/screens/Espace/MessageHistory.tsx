import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, orderBy, limit, deleteDoc, doc, onSnapshot } from 'firebase/firestore'; // @FIREBASE_LEGACY
import { useUser } from '../../lib/userContext';

const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;
const USE_FIREBASE = import.meta.env.VITE_FIREBASE_BRIDGE !== 'false'; // @FIREBASE_LEGACY
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Clock,
  Plus,
  Stethoscope,
  Send,
  AlertCircle,
  X,
  Mail,
  Trash2,
  Bell,
  Loader2,
} from 'lucide-react';
import {
  DoctorNotification,
  getNotificationsForMessage,
  getNotificationIcon,
  markNotificationAsRead
} from '../../lib/doctorNotifications';
import { clearAppBadge } from '../../lib/pushNotifications';

interface Message {
  id: string;
  content: string;
  status: 'pending' | 'replied' | 'treated';
  createdAt: Date;
  childNickname: string;
  tokenId: string;
  replyContent?: string;
  replyDate?: Date;
  replyAuthor?: string;
}

const statusConfig = {
  pending: {
    label: 'En attente',
    color: 'bg-orange-100 text-orange-600',
    icon: Clock,
  },
  replied: {
    label: 'Reponse recue',
    color: 'bg-blue-100 text-blue-600',
    icon: CheckCheck,
  },
  treated: {
    label: 'Traite',
    color: 'bg-green-100 text-green-600',
    icon: Check,
  }
};

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "A l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const formatShortDate = (date: Date) =>
  date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/**
 * MessageHistory — composant épuré qui affiche tous les messages médecin
 * de tous les enfants liés. Pas de header, pas de nav, pas de sélecteur.
 */
export const MessageHistory = () => {
  const navigate = useNavigate();
  const { children: contextChildren, tokenIds, loading: userLoading } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [messageNotifications, setMessageNotifications] = useState<DoctorNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Charger les messages — VPS bridge ou Firebase listener
  useEffect(() => {
    if (userLoading) return;
    if (tokenIds.length === 0) { setIsLoading(false); return; }

    const childrenMap = new Map<string, string>();
    contextChildren.forEach(c => childrenMap.set(c.tokenId, c.nickname || 'Enfant'));

    // @FIREBASE_LEGACY — utiliser Firebase listener pendant la transition
    if (USE_FIREBASE) {
      let unsubscribes: (() => void)[] = [];
      const chunks: string[][] = [];
      for (let i = 0; i < tokenIds.length; i += 10) chunks.push(tokenIds.slice(i, i + 10));

      for (const chunk of chunks) {
        const q = query(
          collection(db, 'messages'),
          where('tokenId', 'in', chunk),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const unsub = onSnapshot(q, (snapshot) => {
          const msgs: Message[] = snapshot.docs.map(d => {
            const data = d.data();
            let status: Message['status'] = 'pending';
            if (data.status === 'treated' || data.status === 'read') status = 'treated';
            else if (data.replyContent || data.status === 'replied') status = 'replied';
            return {
              id: d.id, content: data.content, status,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              childNickname: childrenMap.get(data.tokenId) || 'Enfant',
              tokenId: data.tokenId, replyContent: data.replyContent,
              replyDate: data.replyDate?.toDate?.(), replyAuthor: data.replyAuthor || 'Dr.',
            };
          });
          setMessages(prev => {
            const other = prev.filter(m => !chunk.includes(m.tokenId));
            return [...other, ...msgs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          });
          setIsLoading(false);
        }, () => setIsLoading(false));
        unsubscribes.push(unsub);
      }
      return () => unsubscribes.forEach(u => u());
    }

    // VPS polling
    const poll = async () => {
      try {
        const allMsgs: Message[] = [];
        for (const tokenId of tokenIds) {
          const res = await fetch(`${VPS_URL}/bridge/messages/token/${encodeURIComponent(tokenId)}?limit=50`, {
            headers: { 'X-Api-Key': VPS_KEY },
          });
          if (!res.ok) continue;
          const items = await res.json();
          for (const data of items) {
            let status: Message['status'] = 'pending';
            if (data.status === 'archived' || data.status === 'read') status = 'treated';
            else if (data.reply_content || data.status === 'replied') status = 'replied';
            allMsgs.push({
              id: data.id, content: data.content, status,
              createdAt: new Date(data.created_at),
              childNickname: childrenMap.get(data.token_id) || data.child_nickname || 'Enfant',
              tokenId: data.token_id, replyContent: data.reply_content,
              replyDate: data.replied_at ? new Date(data.replied_at) : undefined,
              replyAuthor: 'Dr.',
            });
          }
        }
        setMessages(allMsgs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      } catch (err) {
        console.error('[MessageHistory] Erreur polling VPS:', err);
      }
      setIsLoading(false);
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [tokenIds, userLoading, contextChildren]);

  // Clear badge
  useEffect(() => { clearAppBadge(); }, []);

  // Notifications pour le message sélectionné
  useEffect(() => {
    if (!selectedMessage) { setMessageNotifications([]); return; }
    setLoadingNotifications(true);
    getNotificationsForMessage(selectedMessage.id).then(notifs => {
      setMessageNotifications(notifs);
      notifs.filter(n => !n.read).forEach(n => markNotificationAsRead(n.id));
      if (notifs.some(n => !n.read)) clearAppBadge();
    }).catch(() => {}).finally(() => setLoadingNotifications(false));
  }, [selectedMessage]);

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    setIsDeleting(true);
    try {
      // VPS bridge
      await fetch(`${VPS_URL}/bridge/messages/${encodeURIComponent(selectedMessage.id)}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': VPS_KEY },
      });

      // @FIREBASE_LEGACY — aussi supprimer sur Firestore
      if (USE_FIREBASE) {
        try {
          await deleteDoc(doc(db, 'messages', selectedMessage.id));
        } catch { /* ignore */ }
      }

      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
      setShowDeleteConfirm(false);
      setSelectedMessage(null);
    } catch (err) {
      console.error('Erreur suppression:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chargement...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
            <Stethoscope size={24} className="text-blue-300" />
          </div>
          <p className="text-sm font-bold text-gray-500">Aucun message medecin</p>
          <p className="text-xs text-gray-400 mt-1">Vos echanges avec le medecin apparaitront ici</p>
          <button
            onClick={() => navigate('/espace/nouveau-message', { replace: true })}
            className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/20 flex items-center gap-2 active:scale-95 transition-transform"
          >
            <Plus size={16} />
            Envoyer un message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pb-4">
      {/* Bouton nouveau message */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => navigate('/espace/nouveau-message', { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-xl font-bold text-[11px] shadow-sm active:scale-95 transition-transform"
        >
          <Plus size={14} />
          Nouveau message
        </button>
      </div>

      {/* Liste des messages */}
      <div className="space-y-2">
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
              className="w-full bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-blue-200 transition-all text-left active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  hasReply ? 'bg-blue-100 text-blue-500' : 'bg-orange-100 text-orange-500'
                }`}>
                  {hasReply ? <Stethoscope size={18} /> : <Send size={16} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-medium">
                        {formatShortDate(msg.createdAt)}
                      </span>
                      <span className="text-[9px] font-bold text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded-md">
                        {msg.childNickname}
                      </span>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full flex items-center gap-1 ${config.color}`}>
                      <StatusIcon size={10} />
                      <span className="text-[8px] font-bold uppercase">{config.label}</span>
                    </div>
                  </div>

                  <p className="text-gray-700 font-medium text-sm line-clamp-2">{msg.content}</p>

                  {hasReply && (
                    <div className="flex items-center gap-1.5 mt-2 text-blue-500">
                      <CheckCheck size={12} />
                      <span className="text-[10px] font-bold">Reponse du medecin</span>
                    </div>
                  )}

                  {msg.status === 'replied' && !hasReply && (
                    <div className="flex items-center gap-1.5 mt-2 text-green-600">
                      <Bell size={12} />
                      <span className="text-[10px] font-bold">Notification recue</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-8 px-8">
        Les reponses de votre medecin sont transmises par email.
      </p>

      {/* Modal détail message */}
      {selectedMessage && createPortal(
        <AnimatePresence>
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
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-[2rem]">
                <div>
                  <h3 className="font-bold text-gray-800">Detail du message</h3>
                  <span className="text-[10px] font-bold text-blue-400">{selectedMessage.childNickname}</span>
                </div>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="p-2 bg-gray-100 rounded-xl text-gray-400"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Réponse du médecin */}
                {selectedMessage.replyContent &&
                 !selectedMessage.replyContent.includes('[Réponse envoyée par email]') && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500">
                        <Stethoscope size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                          {selectedMessage.replyAuthor || 'Reponse du medecin'}
                        </p>
                        {selectedMessage.replyDate && (
                          <p className="text-[10px] text-gray-400">{formatDate(selectedMessage.replyDate)}</p>
                        )}
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                      <p className="text-blue-800 font-medium leading-relaxed">{selectedMessage.replyContent}</p>
                    </div>
                  </div>
                )}

                {/* Notifications du médecin */}
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
                          notif.type === 'EmailReply' ? 'bg-green-50 border-green-200'
                          : notif.type === 'Quick' ? 'bg-orange-50 border-orange-200'
                          : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                            notif.type === 'EmailReply' ? 'bg-green-100'
                            : notif.type === 'Quick' ? 'bg-orange-100'
                            : 'bg-blue-100'
                          }`}>
                            {getNotificationIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold uppercase tracking-widest ${
                                notif.type === 'EmailReply' ? 'text-green-600'
                                : notif.type === 'Quick' ? 'text-orange-600'
                                : 'text-blue-600'
                              }`}>
                                {notif.type === 'EmailReply' ? 'Reponse recue' : notif.senderName}
                              </span>
                              <span className="text-[10px] text-gray-400">{formatDate(notif.createdAt)}</span>
                            </div>
                            <p className={`font-bold text-sm ${
                              notif.type === 'EmailReply' ? 'text-green-800'
                              : notif.type === 'Quick' ? 'text-orange-800'
                              : 'text-blue-800'
                            }`}>{notif.title}</p>
                            <p className={`text-sm mt-1 ${
                              notif.type === 'EmailReply' ? 'text-green-700'
                              : notif.type === 'Quick' ? 'text-orange-700'
                              : 'text-blue-700'
                            }`}>{notif.body}</p>
                            {notif.type === 'EmailReply' && (
                              <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-green-100 rounded-xl">
                                <Mail size={16} className="text-green-600" />
                                <span className="text-green-700 text-xs font-medium">
                                  Consultez votre boite mail pour lire la reponse complete
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
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Votre message</p>
                        <p className="text-[10px] text-gray-400">{formatDate(selectedMessage.createdAt)}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-full flex items-center gap-1 ${statusConfig[selectedMessage.status].color}`}>
                      {(() => { const SI = statusConfig[selectedMessage.status].icon; return <SI size={12} />; })()}
                      <span className="text-[9px] font-bold uppercase">{statusConfig[selectedMessage.status].label}</span>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-gray-700 font-medium leading-relaxed">{selectedMessage.content}</p>
                  </div>
                </div>

                {selectedMessage.status === 'pending' && (
                  <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                    <AlertCircle size={20} className="text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-orange-700 font-bold text-sm">En attente de reponse</p>
                      <p className="text-orange-600 text-xs">Le medecin repondra sous 48h</p>
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
        </AnimatePresence>,
        document.body
      )}

      {/* Modal confirmation suppression */}
      {showDeleteConfirm && selectedMessage && createPortal(
        <AnimatePresence>
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
                    ? "Ce message et la reponse du medecin seront supprimes definitivement."
                    : "Ce message sera supprime definitivement."}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleDeleteMessage}
                  disabled={isDeleting}
                  className="w-full h-12 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Trash2 size={18} /> Supprimer</>}
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
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default MessageHistory;
