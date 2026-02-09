/**
 * Composant d'affichage des notifications du médecin
 *
 * Affiche les notifications envoyées par le médecin via MedCompanion:
 * - Réponses par email
 * - Notifications rapides (RDV, Doctolib, etc.)
 * - Informations
 * - Broadcasts (messages à tous les parents)
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DoctorNotification,
  getNotificationsForTokens,
  markNotificationAsRead,
  getNotificationIcon,
  getNotificationColor
} from '../../lib/doctorNotifications';
import { areNotificationsEnabled, playNotificationSound } from '../../lib/userPreferences';

interface DoctorNotificationsProps {
  tokenIds: string[];
  maxVisible?: number;
}

export const DoctorNotifications = ({ tokenIds, maxVisible = 3 }: DoctorNotificationsProps) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<DoctorNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const previousUnreadCountRef = useRef<number | null>(null);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    const loadNotifications = async () => {
      // Vérifier si les notifications sont activées
      if (!areNotificationsEnabled()) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      if (tokenIds.length === 0) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const data = await getNotificationsForTokens(tokenIds);
      const unreadCount = data.filter(n => !n.read).length;

      // Jouer un son si nouvelles notifications (après le premier chargement)
      if (!isFirstLoadRef.current &&
          previousUnreadCountRef.current !== null &&
          unreadCount > previousUnreadCountRef.current) {
        playNotificationSound();
      }

      previousUnreadCountRef.current = unreadCount;
      isFirstLoadRef.current = false;

      setNotifications(data);
      setIsLoading(false);
    };

    loadNotifications();

    // Recharger toutes les 30 secondes
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [tokenIds]);

  const handleMarkAsRead = async (notification: DoctorNotification) => {
    const success = await markNotificationAsRead(notification.id);
    if (success) {
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
      );
    }
  };

  // Clic sur ✓ ou sur la carte : marquer comme lu + ouvrir le message lié
  const handleOpenNotification = async (notification: DoctorNotification) => {
    await markNotificationAsRead(notification.id);
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );

    // Naviguer vers les messages avec le bon enfant et message
    const params = new URLSearchParams();
    params.set('childId', notification.tokenId);
    if (notification.replyToMessageId) {
      params.set('messageId', notification.replyToMessageId);
    }
    navigate(`/espace/messages?${params.toString()}`);
  };

  const handleDismiss = async (notification: DoctorNotification, e: React.MouseEvent) => {
    e.stopPropagation(); // Ne pas déclencher le clic sur la carte
    await handleMarkAsRead(notification);
    // Animation de suppression
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
  };

  const unreadNotifications = notifications.filter(n => !n.read);
  const visibleNotifications = showAll
    ? unreadNotifications
    : unreadNotifications.slice(0, maxVisible);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-20 bg-gray-100 rounded-2xl"></div>
      </div>
    );
  }

  if (unreadNotifications.length === 0) {
    return null; // Ne rien afficher s'il n'y a pas de notifications
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-bold text-gray-700">
            Notifications du cabinet
          </h3>
          {unreadNotifications.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {unreadNotifications.length}
            </span>
          )}
        </div>
      </div>

      {/* Liste des notifications */}
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notification) => (
          <motion.div
            key={notification.id}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, x: -100 }}
            onClick={() => handleOpenNotification(notification)}
            className={`relative p-4 rounded-2xl border-2 ${getNotificationColor(notification.type)} shadow-sm cursor-pointer hover:shadow-md transition-shadow`}
          >
            {/* Badge type */}
            <div className="absolute -top-2 -left-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md text-lg">
              {getNotificationIcon(notification.type)}
            </div>

            {/* Contenu */}
            <div className="ml-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-bold text-sm">{notification.title}</p>
                  <p className="text-xs mt-1 opacity-80">{notification.body}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] opacity-60">
                      {notification.senderName}
                    </span>
                    <span className="text-[10px] opacity-40">•</span>
                    <span className="text-[10px] opacity-60">
                      {formatDate(notification.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenNotification(notification); }}
                    className="p-1.5 rounded-full hover:bg-white/50 transition-colors"
                    title="Voir le message"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleDismiss(notification, e)}
                    className="p-1.5 rounded-full hover:bg-white/50 transition-colors"
                    title="Fermer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Bouton voir plus/moins */}
      {unreadNotifications.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2 text-xs font-bold text-gray-500 hover:text-orange-500 flex items-center justify-center gap-1 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Voir moins
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Voir {unreadNotifications.length - maxVisible} notification(s) de plus
            </>
          )}
        </button>
      )}
    </motion.div>
  );
};

export default DoctorNotifications;
