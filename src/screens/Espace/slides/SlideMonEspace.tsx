import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { auth, db } from '../../../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { Bell, Users, ChevronRight, LayoutGrid, Loader2, Heart, X, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { onPendingEvaluations, dismissEvaluation, isParticipantBanned } from '../../../lib/groupeParoleService';
import { useUpcomingGroup } from '../../../lib/upcomingGroupContext';
import { useUser } from '../../../lib/userContext';
import { AuthWall } from '../../../components/ui/AuthWall';
import type { GroupeParole, EvaluationPendante } from '../../../types/groupeParole';
import { getNextBadge, BADGE_THRESHOLDS, THEME_COLORS, THEME_LABELS } from '../../../types/groupeParole';

const SquareCard = ({ icon: Icon, label, description, count, bgImage, onClick, colorClasses, isBadge }: any) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="relative aspect-square rounded-[2rem] overflow-hidden shadow-premium group"
  >
    {/* Background Image Layer */}
    {bgImage && (
      <img 
        src={bgImage} 
        alt={label}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
    )}
    
    {/* Color Overlay / Gradient */}
    <div className={`absolute inset-0 ${colorClasses} opacity-60 mix-blend-overlay`} />
    
    {/* Dark Overlay (Less opaque for badges to see the icon better) */}
    <div className={`absolute inset-0 bg-gradient-to-t ${isBadge ? 'from-black/60 to-transparent' : 'from-black/80 via-black/20 to-transparent'} pointer-events-none`} />

    {/* Content */}
    <div className="absolute inset-0 p-5 flex flex-col justify-between items-start z-10 text-left">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-glass overflow-hidden">
        {Icon ? (
           <Icon size={24} className="text-white drop-shadow-md" />
        ) : isBadge ? (
           <img src={bgImage} className="w-full h-full object-cover p-2 scale-150 rotate-6" />
        ) : (
           <Star size={24} className="text-white drop-shadow-md" />
        )}
      </div>
      
      <div>
        <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-white tracking-tight drop-shadow-md leading-tight">{label}</h3>
            {count > 0 && (
                <span className="min-w-[20px] h-5 bg-white text-orange-600 text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-sm">
                    {count > 9 ? '9+' : count}
                </span>
            )}
        </div>
        <p className="text-[10px] text-white/80 font-bold uppercase tracking-widest mt-0.5 line-clamp-1">{description}</p>
      </div>
    </div>
  </motion.button>
);

export const SlideMonEspace = ({ unreadParentCount = 0 }: { unreadParentCount?: number }) => {
  const navigate = useNavigate();
  const { allGroupes } = useUpcomingGroup();
  const { currentUser, tokenIds, points, badge, participationHistory } = useUser();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [unreadDoctorCount, setUnreadDoctorCount] = useState(0);
  const unreadCount = unreadDoctorCount + unreadParentCount;
  const [myGroupsCount, setMyGroupsCount] = useState(0);
  const [pendingEvals, setPendingEvals] = useState<EvaluationPendante[]>([]);
  const [filteredPendingEvals, setFilteredPendingEvals] = useState<EvaluationPendante[]>([]);
  const progression = currentUser ? { points, badge, history: participationHistory } : null;
  const [isLoading, setIsLoading] = useState(true);
  const [showEvalsModal, setShowEvalsModal] = useState(false);

  // Unread doctor notifications count (via token) — tokenIds from UserContext
  useEffect(() => {
    if (!currentUser || tokenIds.length === 0) {
      setUnreadDoctorCount(0);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < tokenIds.length; i += 10) chunks.push(tokenIds.slice(i, i + 10));

    for (const chunk of chunks) {
      const q = query(collection(db, 'notifications'), where('tokenId', 'in', chunk), where('read', '==', false));
      const unsub = onSnapshot(q, (snapshot) => setUnreadDoctorCount(snapshot.docs.length), () => {});
      unsubscribes.push(unsub);
    }

    return () => unsubscribes.forEach((u) => u());
  }, [currentUser, tokenIds]);

  // My groups count — dérivé du contexte global, pas de listener dédié
  useEffect(() => {
    if (!currentUser) {
      setMyGroupsCount(0);
      setIsLoading(false);
      return;
    }
    const uid = currentUser.uid;
    const mine = allGroupes.filter(
      (g) => g.createurUid === uid || g.participants.some((p) => p.uid === uid)
    );
    setMyGroupsCount(mine.length);
    setIsLoading(false);
  }, [currentUser, allGroupes]);


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

  // Filter out pending evaluations for groups where the user is banned
  useEffect(() => {
    if (!currentUser || pendingEvals.length === 0) {
      setFilteredPendingEvals([]);
      return;
    }
    Promise.all(
      pendingEvals.map(async (ev) => {
        const banned = await isParticipantBanned(ev.groupeId, currentUser.uid).catch(() => false);
        return banned ? null : ev;
      })
    ).then((results) => {
      setFilteredPendingEvals(results.filter(Boolean) as EvaluationPendante[]);
    }).catch(() => {
      setFilteredPendingEvals(pendingEvals);
    });
  }, [pendingEvals, currentUser]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

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
    <div className="h-full bg-[#FFFBF0] overflow-y-auto pb-32 no-scrollbar">
      {/* Hero Header sticky - Premium Dark Cartouche Version matching SlideAccueil */}
      <div className="sticky top-0 z-40 px-6 pt-3 pb-2">
        <div className="relative border border-white/20 shadow-premium overflow-hidden bg-gray-900 rounded-[2rem]">
          {/* Background Image - Full color like the Accueil card */}
          <div className="absolute inset-0 opacity-80">
            <img 
              src="/assets/backgrounds/slide_bg_messages.png" 
              alt="Messages Wallpaper"
              className="w-full h-full object-cover transform translate-y-[-10%] scale-110"
            />
          </div>
          
          {/* Dark Overlay gradient matching SlideAccueil card */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 pointer-events-none" />

          {/* Compact Flex Content */}
          <div className="relative px-5 py-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex flex-shrink-0 items-center justify-center shadow-glass border border-white/20">
              <LayoutGrid size={28} className="text-white drop-shadow-md" />
            </div>
            <div className="flex-1">
              <h1 className="text-[20px] font-black text-white tracking-tight drop-shadow-md leading-tight">
                Mon Espace
              </h1>
              <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5 drop-shadow-sm line-clamp-1">
                Votre espace personnel
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="px-6 max-w-md mx-auto pt-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Card: Notifications */}
          <SquareCard
            icon={Bell}
            label="Messages"
            description="Activités"
            count={unreadCount}
            bgImage="/assets/backgrounds/slide_bg_messages.png"
            colorClasses="bg-gradient-to-br from-white/90 via-white/50 to-blue-200/30"
            onClick={() => handleCardClick('/espace/mes-messages')}
          />

          {/* Card: Mes Groupes */}
          <SquareCard
            icon={Users}
            label="Groupes"
            description="Mes cercles"
            count={myGroupsCount}
            bgImage="/assets/backgrounds/slide_bg_forum.png"
            colorClasses="bg-gradient-to-br from-orange-500 to-rose-600"
            onClick={() => handleCardClick('/espace/mes-groupes')}
          />

          {/* Card: Badge Interactif */}
          {currentUser && progression && (
             <SquareCard
                isBadge
                label={`Badge ${BADGE_THRESHOLDS.find(b => b.level === progression.badge)?.label || 'Nid'}`}
                description={`${progression.points} points • Détails`}
                bgImage={
                  progression.badge === 'nid' ? '/assets/badges/badge_nid.png' :
                  progression.badge === 'envol' ? '/assets/badges/badge_envol.png' :
                  '/assets/badges/badge_plume.png'
                }
                colorClasses={
                  progression.badge === 'nid' ? 'bg-orange-400' :
                  progression.badge === 'envol' ? 'bg-indigo-500' :
                  'bg-yellow-400'
                }
                onClick={() => setShowBadgeModal(true)}
             />
          )}

          {/* Card: Donner mon avis OR (Empty) */}
          {filteredPendingEvals.length > 0 && (
            <SquareCard
              icon={Heart}
              label="Avis"
              description="A donner"
              count={filteredPendingEvals.length}
              bgImage="/assets/backgrounds/profile_bg.png"
              colorClasses="bg-gradient-to-br from-pink-500 to-rose-600"
              onClick={() => setShowEvalsModal(true)}
            />
          )}
        </div>
      </div>

      {/* Badge Detail Modal */}
      <AnimatePresence>
        {showBadgeModal && currentUser && progression && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBadgeModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] overflow-hidden shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              {/* Header with Background */}
              <div className={`h-40 relative flex flex-col items-center justify-center flex-shrink-0 ${
                progression.badge === 'nid' ? 'bg-gradient-to-br from-amber-400 to-orange-600' :
                progression.badge === 'envol' ? 'bg-gradient-to-br from-purple-500 to-indigo-700' :
                'bg-gradient-to-br from-yellow-300 to-orange-500'
              }`}>
                <div className="absolute inset-0 opacity-20 mix-blend-overlay">
                    <img src="/assets/backgrounds/profile_bg.png" className="w-full h-full object-cover" />
                </div>
                <div className="relative z-10 w-24 h-24 bg-white/20 backdrop-blur-xl rounded-[2.5rem] flex items-center justify-center border border-white/30 shadow-glass transform rotate-3 overflow-hidden">
                   <img 
                      src={
                        progression.badge === 'nid' ? '/assets/badges/badge_nid.png' :
                        progression.badge === 'envol' ? '/assets/badges/badge_envol.png' :
                        '/assets/badges/badge_plume.png'
                      } 
                      className="w-full h-full object-cover"
                   />
                </div>
                <button 
                  onClick={() => setShowBadgeModal(false)}
                  className="absolute top-4 right-4 w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 text-center">
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">
                  Badge {BADGE_THRESHOLDS.find(b => b.level === progression.badge)?.label}
                </h3>
                <p className="text-gray-500 font-bold mt-2 px-4 leading-relaxed">
                  {progression.badge === 'nid' ? "Vous avez posé les bases de votre engagement !" :
                   progression.badge === 'envol' ? "Votre implication s'envole, merci pour votre aide !" :
                   "Un membre pilier de la communauté Parent'aile."}
                </p>

                <div className="mt-8 bg-gray-50 rounded-3xl p-6">
                   <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-black text-orange-500">{progression.points}</span>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">points cumulés</span>
                   </div>
                   
                   {/* Progress to next */}
                   {(() => {
                      const next = getNextBadge(progression.points);
                      if (!next) return <p className="text-sm font-bold text-amber-600 mt-4">Félicitations, vous êtes au maximum !</p>;
                      const threshold = next.label === 'Plume' ? 50 : next.label === 'Envol' ? 150 : 300;
                      const prevThreshold = next.label === 'Plume' ? 0 : next.label === 'Envol' ? 50 : 150;
                      const progressPct = ((progression.points - prevThreshold) / (threshold - prevThreshold)) * 100;
                      return (
                        <div className="mt-6">
                          <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Objectif : {next.label}</span>
                             <span className="text-[10px] font-black text-orange-500">+{next.pointsNeeded} pts</span>
                          </div>
                          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                             <motion.div 
                               initial={{ width: 0 }}
                               animate={{ width: `${progressPct}%` }}
                               className={`h-full rounded-full ${
                                  next.label === 'Envol' ? 'bg-indigo-500' : 'bg-orange-500'
                               }`} 
                             />
                          </div>
                        </div>
                      );
                   })()}
                </div>

                {/* Historique INTEGRATED HERE */}
                {progression.history.length > 0 && (
                  <div className="mt-8 text-left">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-4">Activités récentes</h4>
                    <div className="space-y-3">
                      {progression.history
                        .slice()
                        .sort((a, b) => b.date.getTime() - a.date.getTime())
                        .slice(0, 5)
                        .map((entry, i) => (
                          <div key={i} className="flex items-center justify-between border-b border-gray-100 pb-3">
                             <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${entry.type === 'creation' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                                <span className="text-xs font-bold text-gray-700 truncate max-w-[140px]">{entry.groupeTitre}</span>
                             </div>
                             <span className="text-[10px] font-black text-emerald-600">+{entry.points} pts</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <button 
                   onClick={() => setShowBadgeModal(false)}
                   className="w-full mt-8 h-14 bg-gray-900 text-white rounded-2xl font-bold active:scale-95 transition-transform"
                >
                   Continuer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                {filteredPendingEvals.length} evaluation{filteredPendingEvals.length > 1 ? 's' : ''} en attente — choisissez un groupe
              </p>

              {/* Cards list */}
              <div className="flex-1 overflow-y-auto px-6 pb-8 pt-2 space-y-3">
                {filteredPendingEvals.map((ev, i) => {
                  const colors = THEME_COLORS[ev.groupeTheme] || THEME_COLORS.autre;
                  const themeLabel = THEME_LABELS[ev.groupeTheme] || 'Autre';
                  return (
                    <motion.div
                      key={ev.groupeId}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100, height: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="w-full rounded-2xl p-4 flex items-center gap-4 text-left border border-gray-100 shadow-sm bg-white relative"
                    >
                      {/* Evaluer */}
                      <button
                        onClick={() => {
                          setShowEvalsModal(false);
                          navigate(`/espace/groupes/${ev.groupeId}/vocal?eval=true`);
                        }}
                        className="flex items-center gap-4 flex-1 min-w-0 active:scale-[0.97] transition-transform"
                      >
                        <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md`}>
                          <Star size={20} className="text-white fill-white" />
                        </div>
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
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">
                            +5 pts
                          </span>
                          <ChevronRight size={16} className="text-gray-300" />
                        </div>
                      </button>

                      {/* Ignorer */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Optimistic: remove from local list immediately
                          const remaining = filteredPendingEvals.filter(p => p.groupeId !== ev.groupeId);
                          setFilteredPendingEvals(remaining);
                          if (remaining.length === 0) setShowEvalsModal(false);
                          dismissEvaluation(ev.groupeId, auth.currentUser?.uid || '');
                        }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* Auth Modal */}
        {showAuthModal && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAuthModal(false)}
          >
            <AuthWall 
              fullHeight={false}
              title="Accédez à votre espace"
              description="Connectez-vous ou inscrivez-vous pour accéder à vos messages, groupes de parole et suivre votre progression."
              icon={LayoutGrid}
            />
          </div>,
          document.body
        )}
    </div>
  );
};

export default SlideMonEspace;
