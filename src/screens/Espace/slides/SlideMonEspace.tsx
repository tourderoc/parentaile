import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { MessageSquare, Users, ChevronRight, Sparkles, LayoutGrid, Loader2, Heart, Feather, Wind, Home, X, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { onGroupesParole, onPendingEvaluations, onUserProgression } from '../../../lib/groupeParoleService';
import type { GroupeParole, EvaluationPendante, UserProgression, BadgeLevel } from '../../../types/groupeParole';
import { getNextBadge, BADGE_THRESHOLDS, THEME_COLORS, THEME_LABELS } from '../../../types/groupeParole';

export const SlideMonEspace = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [myGroupsCount, setMyGroupsCount] = useState(0);
  const [pendingEvals, setPendingEvals] = useState<EvaluationPendante[]>([]);
  const [progression, setProgression] = useState<UserProgression | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEvalsModal, setShowEvalsModal] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Unread notifications count (same logic as BottomNavSwiper)
  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }

    let unsubscribes: (() => void)[] = [];

    const setup = async () => {
      try {
        const childrenRef = collection(db, 'accounts', currentUser.uid, 'children');
        const childrenSnap = await getDocs(query(childrenRef, orderBy('addedAt', 'desc')));
        const tokenIds = childrenSnap.docs.map((d) => d.id);

        if (tokenIds.length === 0) {
          setUnreadCount(0);
          return;
        }

        const chunks: string[][] = [];
        for (let i = 0; i < tokenIds.length; i += 10) {
          chunks.push(tokenIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const notifRef = collection(db, 'notifications');
          const q = query(notifRef, where('tokenId', 'in', chunk), where('read', '==', false));
          const unsub = onSnapshot(
            q,
            (snapshot) => setUnreadCount(snapshot.docs.length),
            () => {}
          );
          unsubscribes.push(unsub);
        }
      } catch {
        // Silently ignore
      }
    };

    setup();
    return () => unsubscribes.forEach((u) => u());
  }, [currentUser]);

  // My groups count
  useEffect(() => {
    if (!currentUser) {
      setMyGroupsCount(0);
      setIsLoading(false);
      return;
    }

    const unsub = onGroupesParole((groupes: GroupeParole[]) => {
      const uid = currentUser.uid;
      const mine = groupes.filter(
        (g) =>
          g.createurUid === uid ||
          g.participants.some((p) => p.uid === uid)
      );
      setMyGroupsCount(mine.length);
      setIsLoading(false);
    });

    return () => unsub();
  }, [currentUser]);

  // User progression (points & badges)
  useEffect(() => {
    if (!currentUser) {
      setProgression(null);
      return;
    }
    const unsub = onUserProgression(currentUser.uid, (prog) => {
      setProgression(prog);
    });
    return () => unsub();
  }, [currentUser]);

  // Pending evaluations
  useEffect(() => {
    if (!currentUser) {
      setPendingEvals([]);
      return;
    }
    const unsub = onPendingEvaluations(currentUser.uid, (pending) => {
      setPendingEvals(pending);
    });
    return () => unsub();
  }, [currentUser]);

  const handleCardClick = (path: string) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    navigate(path);
  };

  if (isLoading) {
    return (
      <div className="h-full bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="h-full bg-[#FFFBF0] overflow-y-auto pb-32">
      {/* Header */}
      <div className="pt-10 pb-6 px-6 max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Mon Espace</h1>
            <p className="text-xs text-gray-400 font-medium">Votre espace personnel</p>
          </div>
        </motion.div>
      </div>

      {/* Cards */}
      <div className="px-6 max-w-md mx-auto space-y-4">
        {/* Card: Mes Messages */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => handleCardClick('/espace/mes-messages')}
          className="w-full glass rounded-3xl p-5 flex items-center gap-4 shadow-glass text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
            <MessageSquare size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Mes Messages</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Échanges avec le médecin</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <span className="min-w-[24px] h-[24px] bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5 shadow-sm animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </motion.button>

        {/* Card: Mes Groupes de Parole */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => handleCardClick('/espace/mes-groupes')}
          className="w-full glass rounded-3xl p-5 flex items-center gap-4 shadow-glass text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
            <Users size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Mes Groupes de Parole</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {myGroupsCount > 0
                ? `${myGroupsCount} groupe${myGroupsCount > 1 ? 's' : ''} actif${myGroupsCount > 1 ? 's' : ''}`
                : 'Aucun groupe pour le moment'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {myGroupsCount > 0 && (
              <span className="min-w-[24px] h-[24px] bg-orange-100 text-orange-600 text-[11px] font-bold rounded-full flex items-center justify-center px-1.5">
                {myGroupsCount}
              </span>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </motion.button>

        {/* Card: Evaluations en attente */}
        {pendingEvals.length > 0 ? (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => setShowEvalsModal(true)}
            className="w-full glass rounded-3xl p-5 flex items-center gap-4 shadow-glass text-left active:scale-[0.98] transition-transform border-2 border-orange-200/50"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-pink-400 to-orange-400 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-500/20">
              <Heart size={24} className="text-white fill-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Donner mon avis</h3>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                {pendingEvals.length === 1
                  ? `"${pendingEvals[0].groupeTitre}"`
                  : `${pendingEvals.length} groupes en attente`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="min-w-[24px] h-[24px] bg-orange-100 text-orange-600 text-[11px] font-bold rounded-full flex items-center justify-center px-1.5 animate-pulse">
                {pendingEvals.length}
              </span>
              <ChevronRight size={18} className="text-gray-300" />
            </div>
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full glass rounded-3xl p-5 flex items-center gap-4 opacity-50 cursor-default"
          >
            <div className="w-14 h-14 bg-gray-200 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Sparkles size={24} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-extrabold text-gray-400 tracking-tight">Bientot disponible</h3>
              <p className="text-xs text-gray-300 font-medium mt-0.5">De nouvelles fonctionnalites arrivent</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Ma progression */}
      {currentUser && progression && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="px-6 max-w-md mx-auto mt-6"
        >
          <div className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-extrabold text-gray-800 tracking-tight">Ma progression</h3>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">Votre engagement dans la communaute</p>
            </div>

            {/* Badge + Points */}
            <div className="px-5 pb-4 flex items-center gap-4">
              {/* Badge icon */}
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: progression.badge === 'nid'
                    ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                    : progression.badge === 'envol'
                    ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)'
                    : progression.badge === 'plume'
                    ? 'linear-gradient(135deg, #F9A826, #FB923C)'
                    : 'linear-gradient(135deg, #E5E7EB, #D1D5DB)',
                }}
              >
                {progression.badge === 'nid' ? (
                  <Home size={28} className="text-white" />
                ) : progression.badge === 'envol' ? (
                  <Wind size={28} className="text-white" />
                ) : progression.badge === 'plume' ? (
                  <Feather size={28} className="text-white" />
                ) : (
                  <Feather size={28} className="text-gray-400" />
                )}
              </div>

              <div className="flex-1">
                <p className="text-lg font-extrabold text-gray-800">
                  {progression.points} <span className="text-sm font-bold text-gray-400">points</span>
                </p>
                {progression.badge !== 'none' ? (
                  <p className="text-sm font-bold" style={{
                    color: progression.badge === 'nid' ? '#D97706'
                      : progression.badge === 'envol' ? '#7C3AED'
                      : '#F9A826',
                  }}>
                    Badge {BADGE_THRESHOLDS.find((b) => b.level === progression.badge)?.label}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 font-medium">Pas encore de badge</p>
                )}

                {/* Next badge progress */}
                {(() => {
                  const next = getNextBadge(progression.points);
                  if (!next) return <p className="text-[11px] text-amber-500 font-bold mt-1">Niveau maximum atteint !</p>;
                  const threshold = next.label === 'Plume' ? 50 : next.label === 'Envol' ? 150 : 300;
                  const prevThreshold = next.label === 'Plume' ? 0 : next.label === 'Envol' ? 50 : 150;
                  const progressPct = ((progression.points - prevThreshold) / (threshold - prevThreshold)) * 100;
                  return (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400 font-medium">
                          Encore {next.pointsNeeded} pts pour {next.label}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: next.label === 'Envol' ? '#8B5CF6'
                              : next.label === 'Nid' ? '#F59E0B'
                              : '#F9A826',
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, progressPct)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Historique (dernières 5 entrées) */}
            {progression.history.length > 0 && (
              <div className="border-t border-gray-100/60 px-5 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Historique recent</p>
                <div className="space-y-1.5">
                  {progression.history
                    .slice()
                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                    .slice(0, 5)
                    .map((entry, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            entry.type === 'creation' ? 'bg-orange-400' : 'bg-blue-400'
                          }`} />
                          <p className="text-[11px] text-gray-600 font-medium truncate">
                            {entry.type === 'creation' ? 'Cree' : 'Participe'} — {entry.groupeTitre}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-500 shrink-0 ml-2">
                          +{entry.points}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Pending Evaluations Bottom Sheet */}
      {showEvalsModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999]"
            onClick={() => setShowEvalsModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="absolute bottom-0 inset-x-0 bg-white rounded-t-[32px] max-h-[70vh] flex flex-col shadow-2xl"
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Heart size={18} className="text-pink-500 fill-pink-500" />
                  <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Donner mon avis</h3>
                </div>
                <button
                  onClick={() => setShowEvalsModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>

              {/* Subtitle */}
              <p className="px-6 pt-3 pb-1 text-xs text-gray-400 font-medium">
                {pendingEvals.length} evaluation{pendingEvals.length > 1 ? 's' : ''} en attente — choisissez un groupe
              </p>

              {/* Cards list */}
              <div className="flex-1 overflow-y-auto px-6 pb-8 pt-2 space-y-3">
                {pendingEvals.map((ev, i) => {
                  const colors = THEME_COLORS[ev.groupeTheme] || THEME_COLORS.autre;
                  const themeLabel = THEME_LABELS[ev.groupeTheme] || 'Autre';
                  return (
                    <motion.button
                      key={ev.groupeId}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => {
                        setShowEvalsModal(false);
                        navigate(`/espace/groupes/${ev.groupeId}/vocal`);
                      }}
                      className="w-full rounded-2xl p-4 flex items-center gap-4 text-left active:scale-[0.97] transition-transform border border-gray-100 shadow-sm bg-white hover:bg-gray-50"
                    >
                      {/* Theme color icon */}
                      <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md`}>
                        <Star size={20} className="text-white fill-white" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-extrabold text-gray-800 truncate">{ev.groupeTitre}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-bold ${colors.text} px-1.5 py-0.5 rounded-md ${colors.light}`}>
                            {themeLabel}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {ev.dateVocal.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">
                          +5 pts
                        </span>
                        <ChevronRight size={16} className="text-gray-300" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* Auth Modal */}
      {showAuthModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-[32px] p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-orange-400 to-orange-500 opacity-10" />

              <div className="relative text-center space-y-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto text-orange-500">
                  <LayoutGrid size={32} />
                </div>

                <div>
                  <h3 className="text-xl font-extrabold text-gray-800 tracking-tight">
                    Accédez à votre espace
                  </h3>
                  <p className="text-sm text-gray-500 mt-2 font-medium leading-relaxed">
                    Connectez-vous ou inscrivez-vous pour accéder à vos messages et groupes de parole.
                  </p>
                </div>

                <div className="pt-4 space-y-3">
                  <button
                    onClick={() => navigate('/espace?mode=register')}
                    className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-colors"
                  >
                    S'inscrire
                  </button>
                  <button
                    onClick={() => navigate('/espace?mode=login')}
                    className="w-full py-3.5 bg-orange-50 text-orange-600 rounded-2xl font-bold text-sm hover:bg-orange-100 transition-colors"
                  >
                    Se connecter
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SlideMonEspace;
