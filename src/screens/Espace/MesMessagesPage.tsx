import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Stethoscope, CheckCheck, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../lib/firebase';
import { useUser } from '../../lib/userContext';
import { onParentNotifications, markParentNotifAsRead, markAllParentNotifsAsRead, deleteParentNotification, deleteAllParentNotifs, NOTIF_CONFIG } from '../../lib/parentNotificationService';
import type { ParentNotification } from '../../lib/parentNotificationService';
import { MessageHistory } from './MessageHistory';

type Tab = 'all' | 'groups' | 'medecin';

export const MesMessagesPage = () => {
  const navigate = useNavigate();
  const { currentUser: user, tokenIds, loading } = useUser();
  const [tab, setTab] = useState<Tab>('all');
  const [parentNotifs, setParentNotifs] = useState<ParentNotification[]>([]);
  const hasToken = tokenIds.length > 0;

  // Écouter les notifications parentales
  useEffect(() => {
    if (!user) return;
    return onParentNotifications(user.uid, (notifs) => {
      setParentNotifs(notifs);
    });
  }, [user]);

  const unreadCount = parentNotifs.filter(n => !n.read).length;

  const handleNotifClick = (notif: ParentNotification) => {
    if (!notif.read) markParentNotifAsRead(notif.id);
    if (notif.groupeId) {
      navigate(`/espace/groupes/${notif.groupeId}`);
    }
  };

  const handleMarkAllRead = () => {
    if (user) markAllParentNotifsAsRead(user.uid);
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

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'all', label: 'Tout', show: true },
    { key: 'groups', label: 'Groupes', show: true },
    { key: 'medecin', label: 'Medecin', show: hasToken },
  ];

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/espace/mon-espace')}
              className="w-10 h-10 glass rounded-xl flex items-center justify-center shadow-glass active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-orange-500" />
              <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Notifications</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {parentNotifs.length > 0 && (
              <button
                onClick={() => { if (user) deleteAllParentNotifs(user.uid); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 rounded-xl active:scale-95 transition-transform"
              >
                <Trash2 size={12} className="text-red-400" />
                <span className="text-[10px] font-bold text-red-500">Effacer</span>
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 rounded-xl active:scale-95 transition-transform"
              >
                <CheckCheck size={14} className="text-orange-500" />
                <span className="text-[10px] font-bold text-orange-600">Tout lire</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-md mx-auto px-4 pb-2 flex gap-2">
          {tabs.filter(t => t.show).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-extrabold transition-all ${
                tab === t.key
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-white/60 text-gray-400 hover:bg-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Notifications parentales (Groupes) */}
        {(tab === 'all' || tab === 'groups') && (
          <div className="max-w-md mx-auto px-4 pt-4">
            {parentNotifs.length > 0 && (
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 ml-1">
                Activite
              </p>
            )}
            <div className="space-y-2">
              <AnimatePresence>
                {parentNotifs.map((notif, i) => {
                  const config = NOTIF_CONFIG[notif.type] ?? { icon: '🔔', color: 'text-gray-600', bg: 'bg-gray-50' };
                  return (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100, height: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`w-full rounded-2xl p-4 flex items-start gap-3 text-left transition-all relative ${
                        notif.read
                          ? 'bg-white/60 border border-gray-100/60'
                          : 'bg-white border-2 border-orange-100 shadow-sm'
                      }`}
                    >
                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteParentNotification(notif.id); }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>

                      {/* Clickable area */}
                      <button onClick={() => handleNotifClick(notif)} className="flex items-start gap-3 w-full text-left">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${config.bg}`}>
                          {config.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center justify-between mb-0.5">
                            <h4 className={`text-sm font-extrabold truncate ${notif.read ? 'text-gray-500' : 'text-gray-800'}`}>
                              {notif.title}
                            </h4>
                            {!notif.read && (
                              <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 ml-2" />
                            )}
                          </div>
                          <p className={`text-xs font-medium line-clamp-2 ${notif.read ? 'text-gray-400' : 'text-gray-600'}`}>
                            {notif.body}
                          </p>
                          <span className="text-[10px] text-gray-400 font-medium mt-1 block">
                            {formatDate(notif.createdAt)}
                          </span>
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {parentNotifs.length === 0 && tab === 'groups' && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                    <Bell size={28} className="text-orange-300" />
                  </div>
                  <p className="text-sm font-bold text-gray-500">Aucune notification</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Vos notifications de groupes apparaitront ici
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Séparateur si les deux sections sont visibles */}
        {tab === 'all' && hasToken && parentNotifs.length > 0 && (
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <div className="flex items-center gap-1.5">
                <Stethoscope size={12} className="text-blue-400" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Messages medecin</span>
              </div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </div>
        )}

        {/* Messages médecin (via token) */}
        {(tab === 'all' || tab === 'medecin') && hasToken && (
          <MessageHistory />
        )}

        {/* Pas de token et onglet all sans notifs */}
        {tab === 'all' && !hasToken && parentNotifs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-20 h-20 bg-orange-50 rounded-3xl flex items-center justify-center mb-4">
              <Bell size={36} className="text-orange-300" />
            </div>
            <h3 className="text-lg font-extrabold text-gray-700">Aucune notification</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Rejoignez un groupe de parole pour commencer a recevoir des notifications.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MesMessagesPage;
