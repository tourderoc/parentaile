import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Mic, Clock, Plus, MessageCircle, Filter, Loader2, Heart, Settings, SlidersHorizontal, X, Calendar, Search, Tag } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { auth } from '../../../lib/firebase';
import { onGroupeRating, onPresenceCount } from '../../../lib/groupeParoleService';
import { useUpcomingGroup } from '../../../lib/upcomingGroupContext';
import type { GroupeParole, ThemeGroupe } from '../../../types/groupeParole';
import { THEME_LABELS, THEME_COLORS, THEME_SHORT_LABELS } from '../../../types/groupeParole';
import { CreateGroupeParole } from './CreateGroupeParole';
import { AuthWall } from '../../../components/ui/AuthWall';


// --- Helpers ---
function joursRestants(dateExpiration: Date): number {
  const diff = dateExpiration.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatDateVocal(date: Date, status?: string): string {
  const now = new Date();
  if (status === 'cancelled') return 'Annulé';
  if (status === 'reprogrammed') return 'Reprogrammé';
  const isPassé = date.getTime() < now.getTime() || status === 'completed';

  const jour = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (isPassé) return `Terminé le ${jour}`;
  return `${jour} à ${heure}`;
}

function isVocalPassé(date: Date): boolean {
  return date.getTime() < Date.now();
}

// --- Composants ---

const ThemeChip: React.FC<{
  theme: ThemeGroupe | 'tous';
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ theme, label, active, onClick }) => {
  const colors = theme !== 'tous' ? THEME_COLORS[theme] : null;

  return (
    <button
      onClick={onClick}
      className={`
        flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap
        ${active
          ? theme === 'tous'
            ? 'bg-orange-500 text-white shadow-md'
            : `${colors!.bg} text-white shadow-md`
          : 'bg-white/60 text-gray-500 border border-gray-200/60 hover:bg-white/80'
        }
      `}
    >
      {label}
    </button>
  );
};

const GroupeRatingBadge: React.FC<{ groupeId: string }> = ({ groupeId }) => {
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);

  useEffect(() => {
    const unsub = onGroupeRating(groupeId, setRating);
    return () => unsub();
  }, [groupeId]);

  if (!rating) return null;

  return (
    <span className="flex items-center gap-1 text-[11px] font-bold text-orange-500">
      <Heart size={10} className="text-orange-400 fill-orange-400" />
      {rating.average}/5
      <span className="text-gray-300 font-medium">({rating.count})</span>
    </span>
  );
};

const GroupeCard: React.FC<{
  groupe: GroupeParole;
  index: number;
  total: number;
  onClick?: () => void;
  onJoinVocal?: () => void;
}> = ({ groupe, index, total, onClick, onJoinVocal }) => {
  const navigate = useNavigate();
  const colors = THEME_COLORS[groupe.theme];
  const jours = joursRestants(groupe.dateExpiration);
  const placesRestantes = groupe.participantsMax - groupe.participants.length;
  const estComplet = placesRestantes === 0;
  const vocalPassé = isVocalPassé(groupe.dateVocal);

  // Presence temps reel : ecouter quand la salle est ouverte (15 min avant → 60 min apres)
  const [onlineCount, setOnlineCount] = useState(0);
  const salleOuverte = !vocalPassé && groupe.status !== 'cancelled' && (groupe.dateVocal.getTime() - Date.now()) < 15 * 60000;

  useEffect(() => {
    if (!salleOuverte) return;
    const unsub = onPresenceCount(groupe.id, setOnlineCount);
    return unsub;
  }, [salleOuverte, groupe.id]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.06 }}
      className="w-full h-full cursor-pointer"
      onClick={onClick}
    >
      <div className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden h-full flex flex-col bg-white/40 hover:bg-white/60 transition-colors duration-300">
        {/* Bandeau thème avec image de fond (micro) et effet verre coloré */}
        <div className={`relative px-4 py-3 flex items-center justify-between border-b border-white/30 overflow-hidden ${colors.glass} backdrop-blur-md`}>
          {/* Base image (Microphone) converted to grayscale/luminosity to take the theme color */}
          <div 
            className="absolute inset-0 bg-cover bg-center mix-blend-luminosity opacity-40 scale-125 origin-center"
            style={{ backgroundImage: 'url(/assets/backgrounds/slide_bg_forum.png)' }}
          />
          {/* Inner gradient to ensure text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10" />
          
          <span className="relative z-10 text-[10px] font-extrabold text-white uppercase tracking-[0.15em] drop-shadow-md">
            {THEME_SHORT_LABELS[groupe.theme]}
          </span>
          <div className="relative z-10 flex items-center gap-2">
            {groupe.status === 'cancelled' && (
              <span className="text-[9px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                Annulé
              </span>
            )}
            {groupe.status === 'reprogrammed' && (
              <span className="text-[9px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                Reprogrammé
              </span>
            )}
            <span className="text-[10px] font-extrabold bg-white/25 text-white px-2 py-0.5 rounded-full backdrop-blur-md shadow-sm">
              {index + 1}/{total}
            </span>
            {estComplet && (
              <span className="text-[9px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-md shadow-sm">
                Complet
              </span>
            )}
          </div>
        </div>

        {/* Contenu */}
        <div className="p-4 flex-1 flex flex-col gap-3">
          {/* Titre */}
          <h3 className="text-sm font-extrabold text-gray-800 leading-snug line-clamp-2">
            {groupe.titre}
          </h3>

          {/* Créateur */}
          <p className="text-[10px] text-gray-400 font-semibold">
            Créé par {groupe.createurPseudo}
          </p>

          {/* Infos */}
          <div className="space-y-2 mt-auto">
            {/* Participants */}
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 ${colors.light} rounded-lg flex items-center justify-center`}>
                <Users size={14} className={colors.text} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">
                    {groupe.participants.length} / {groupe.participantsMax}
                  </span>
                  {!estComplet && (
                    <span className="text-[10px] font-semibold text-emerald-600">
                      {placesRestantes} place{placesRestantes > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {/* Jauge */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${estComplet ? 'bg-gray-400' : colors.bg}`}
                    style={{ width: `${(groupe.participants.length / groupe.participantsMax) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Vocal */}
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 ${
                groupe.status === 'cancelled' ? 'bg-red-50' :
                groupe.status === 'reprogrammed' ? 'bg-blue-50' :
                vocalPassé ? 'bg-gray-100' : 'bg-orange-50'
              } rounded-lg flex items-center justify-center`}>
                <Mic size={14} className={
                  groupe.status === 'cancelled' ? 'text-red-400' :
                  groupe.status === 'reprogrammed' ? 'text-blue-400' :
                  vocalPassé ? 'text-gray-400' : 'text-orange-500'
                } />
              </div>
              <span className={`text-xs font-semibold ${
                groupe.status === 'cancelled' ? 'text-red-500' :
                groupe.status === 'reprogrammed' ? 'text-blue-500' :
                vocalPassé ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {formatDateVocal(groupe.dateVocal, groupe.status)}
              </span>
              {vocalPassé && (
                <span className="text-[9px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full ml-auto">
                  Passé
                </span>
              )}
              {!vocalPassé && onlineCount > 0 && (
                <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full ml-auto flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {onlineCount} en ligne
                </span>
              )}
              {!vocalPassé && onlineCount === 0 && (
                <span className="text-[9px] font-bold bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full ml-auto">
                  À venir
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pied : temps restant + rating */}
        {/* Pied : temps restant + rating ou CTA Début imminent */}
        {salleOuverte && groupe.status !== 'cancelled' && (!estComplet || groupe.participants.some(p => p.uid === auth.currentUser?.uid)) ? (
          <div
            className="px-4 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-400 flex items-center justify-center gap-2 mt-auto hover:from-emerald-600 hover:to-emerald-500 transition-colors"
            onClick={(e) => { e.stopPropagation(); onJoinVocal?.(); }}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span className="text-[11px] font-extrabold text-white uppercase tracking-widest">
              Rejoindre · Début imminent
            </span>
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-gray-100/60 flex items-center gap-2 mt-auto">
            <Clock size={12} className="text-orange-400" />
            <span className="text-[11px] font-semibold text-orange-500">
              Encore {jours} jour{jours > 1 ? 's' : ''}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <GroupeRatingBadge groupeId={groupe.id} />
              <span className="text-[10px] text-gray-300 font-medium">
                {groupe.messageCount || 0} msg
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// --- Page principale ---
export const SlideForum = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<any>(undefined);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeGroupe | 'tous'>('tous');
  const [placesDispoOnly, setPlacesDispoOnly] = useState(false);
  const [filterDate, setFilterDate] = useState<'aujourdhui' | 'demain' | '3jours' | 'toutes'>('toutes');
  const [filterCreator, setFilterCreator] = useState('');
  const [filterSort, setFilterSort] = useState<'recents' | 'actifs'>('recents');
  const { allGroupes: groupes, groupesLoading: loading } = useUpcomingGroup();

  // Ouvrir la création avec prefill si on arrive via navigate state (reprogrammer)
  useEffect(() => {
    const state = location.state as any;
    if (state?.openCreate) {
      setCreatePrefill(state.prefill || undefined);
      setShowCreate(true);
      // Nettoyer le state pour éviter de réouvrir au retour
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state]);

  const groupesFiltres = useMemo(() => {
    let result = [...groupes];

    if (selectedTheme !== 'tous') {
      result = result.filter(g => g.theme === selectedTheme);
    }

    if (placesDispoOnly) {
      result = result.filter(g => 
        g.participants.length < g.participantsMax &&
        !isVocalPassé(g.dateVocal)
      );
    }

    // 3. Filtre par créateur
    if (filterCreator.trim() !== '') {
      const search = filterCreator.toLowerCase().trim();
      result = result.filter(g => g.createurPseudo.toLowerCase().includes(search));
    }

    // 4. Filtre par date/moment
    if (filterDate !== 'toutes') {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      result = result.filter(g => {
        const sessionDate = new Date(g.dateVocal);
        sessionDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        // On autorise aussi les sessions "En cours" / passées aujourd'hui si le statut n'est pas terminé
        // Mais isVocalPassé couvre déjà le côté passé pour "placesDispoOnly".
        // Ici on filtre juste par jour.
        if (filterDate === 'aujourdhui') return diffDays <= 0; // Aujourd'hui ou passé récent
        if (filterDate === 'demain') return diffDays === 1;
        if (filterDate === '3jours') return diffDays >= 0 && diffDays <= 3;
        return true;
      });
    }

    // 5. Tri
    if (filterSort === 'actifs') {
      // Trier par activité de chat (messageCount ou longueur du tableau messages)
      result.sort((a, b) => {
        const countA = a.messageCount || (a.messages?.length || 0);
        const countB = b.messageCount || (b.messages?.length || 0);
        return countB - countA; // Le plus de messages en premier
      });
    } else {
      // Tri par défaut (récents) : sessions les plus proches et disponibles en premier
      result.sort((a, b) => {
        const aPast = isVocalPassé(a.dateVocal);
        const bPast = isVocalPassé(b.dateVocal);
        
        const aPlaces = a.participantsMax - a.participants.length;
        const bPlaces = b.participantsMax - b.participants.length;
        
        const aDispo = !aPast && aPlaces > 0;
        const bDispo = !bPast && bPlaces > 0;

        // 1. Priorité aux sessions à venir et avec places dispo
        if (aDispo && !bDispo) return -1;
        if (!aDispo && bDispo) return 1;

        // 2. Priorité aux sessions à venir vs passées
        if (!aPast && bPast) return -1;
        if (aPast && !bPast) return 1;

        // 3. Tri par date temporelle
        if (!aPast && !bPast) {
          // Pour les sessions à venir : la plus proche en premier
          return a.dateVocal.getTime() - b.dateVocal.getTime();
        }

        // Pour les sessions passées : la plus récente en premier
        return b.dateVocal.getTime() - a.dateVocal.getTime();
      });
    }

    return result;
  }, [groupes, selectedTheme, placesDispoOnly, filterDate, filterCreator, filterSort]);

  const themes: Array<{ key: ThemeGroupe | 'tous'; label: string }> = [
    { key: 'tous', label: 'Tous' },
    { key: 'ecole', label: 'École' },
    { key: 'comportement', label: 'Comportement' },
    { key: 'emotions', label: 'Émotions' },
    { key: 'developpement', label: 'Développement' },
    { key: 'autre', label: 'Autre' },
  ];

  if (showCreate) {
    return <CreateGroupeParole onBack={() => { setShowCreate(false); setCreatePrefill(undefined); }} prefill={createPrefill} />;
  }

  return (
    <div className="h-full bg-[#FFFBF0] flex flex-col relative overflow-hidden">
      {/* Enhanced Decorative floating blobs for deep glass effect */}
      <div className="absolute top-[-10%] left-[-20%] w-96 h-96 bg-orange-300/60 rounded-full blur-[90px] animate-float pointer-events-none" />
      <div className="absolute top-[30%] right-[-20%] w-80 h-80 bg-rose-300/50 rounded-full blur-[90px] animate-float pointer-events-none" style={{ animationDelay: '1.5s' }} />
      <div className="absolute bottom-[-10%] left-[10%] w-72 h-72 bg-purple-300/40 rounded-full blur-[90px] animate-float pointer-events-none" style={{ animationDelay: '3s' }} />

      {/* Full-screen Glass Overlay */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[24px] pointer-events-none z-0" />
      
      {/* Scrollable Container Over Glass */}
      <div className="absolute inset-0 z-10 overflow-y-auto pb-32">

      {/* Hero Header sticky - Premium Dark Cartouche Version matching SlideAccueil */}
      <div className="sticky top-0 z-40 px-6 pt-3 pb-2">
        <div className="relative border border-white/20 shadow-premium overflow-hidden bg-gray-900 rounded-[2rem]">
          {/* Background Image - Full color like the Accueil card */}
          <div className="absolute inset-0 opacity-80">
            <img 
              src="/assets/backgrounds/slide_bg_forum.png" 
              alt="Microphone Wallpaper"
              className="w-full h-full object-cover transform -scale-x-100 scale-125 translate-x-1/4 -translate-y-4"
            />
          </div>
          
          {/* Dark Overlay gradient matching SlideAccueil card */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 pointer-events-none" />

          {/* Compact Flex Content */}
          <div className="relative px-5 py-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex flex-shrink-0 items-center justify-center shadow-glass border border-white/20">
              <Mic size={28} className="text-white drop-shadow-md" />
            </div>
            <div className="flex-1">
              <h1 className="text-[20px] font-black text-white tracking-tight drop-shadow-md leading-tight">
                Groupes de parole
              </h1>
              <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5 drop-shadow-sm line-clamp-1">
                Cercles d'échange
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-3 space-y-3">
        {/* Toggle places disponibles et Filtres avancés */}
        <motion.div
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.1 }}
           className="flex items-center gap-3"
        >
          {/* Toggle places disponibles (prend l'espace restant) */}
          <button
            onClick={() => setPlacesDispoOnly(!placesDispoOnly)}
            className={`
              flex-1 flex items-center justify-between px-4 py-3 rounded-2xl transition-all
              ${placesDispoOnly
                ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm'
                : 'bg-white/50 border-2 border-gray-100/60'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <Filter size={14} className={placesDispoOnly ? 'text-emerald-600' : 'text-gray-400'} />
              <span className={`text-[11px] font-bold ${placesDispoOnly ? 'text-emerald-700' : 'text-gray-500'}`}>
                Places dispo.
              </span>
            </div>
            <div className={`
              w-8 h-5 rounded-full relative transition-all flex-shrink-0
              ${placesDispoOnly ? 'bg-emerald-500' : 'bg-gray-300'}
            `}>
              <div className={`
                absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all
                ${placesDispoOnly ? 'left-3.5' : 'left-0.5'}
              `} />
            </div>
          </button>

          {/* Bouton Plus de filtres */}
          <button
            onClick={() => setShowFiltersModal(true)}
            className="flex-shrink-0 px-4 py-3 bg-white/50 border-2 border-gray-100/60 rounded-2xl flex items-center gap-2 hover:bg-white/80 transition-all text-gray-600 font-bold text-[11px]"
          >
            <SlidersHorizontal size={14} className="text-orange-500" />
            <span className="uppercase tracking-widest hidden xs:inline-block">Filtres</span>
            <span className="xs:hidden">Filtres</span>
          </button>
        </motion.div>

        {/* Chips thématiques */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="-mx-6"
          onTouchStart={(e: React.TouchEvent) => e.stopPropagation()}
          onTouchMove={(e: React.TouchEvent) => e.stopPropagation()}
        >
          <Swiper
            nested={true}
            slidesPerView="auto"
            spaceBetween={8}
            slidesOffsetBefore={24}
            slidesOffsetAfter={24}
            className="w-full pb-1"
          >
            {themes.map(t => (
              <SwiperSlide key={t.key} style={{ width: 'auto' }}>
                <ThemeChip
                  theme={t.key}
                  label={t.label}
                  active={selectedTheme === t.key}
                  onClick={() => setSelectedTheme(t.key)}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </motion.div>

        {/* Carrousel de groupes */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {loading ? (
            <div className="glass rounded-3xl border border-white/60 shadow-glass p-8 flex flex-col items-center justify-center">
              <Loader2 size={28} className="text-orange-400 animate-spin mb-3" />
              <p className="text-sm text-gray-500 font-medium">Chargement des groupes...</p>
            </div>
          ) : groupesFiltres.length > 0 ? (
            <div className="-mx-6" onTouchStart={(e: React.TouchEvent) => e.stopPropagation()} onTouchMove={(e: React.TouchEvent) => e.stopPropagation()}>
              <Swiper
                nested={true}
                slidesPerView={1.4}
                spaceBetween={16}
                centeredSlides={true}
                className="w-full py-3"
              >
                {groupesFiltres.map((groupe, i) => (
                  <SwiperSlide key={groupe.id} className="h-auto">
                    {({ isActive }) => (
                      <div
                        className="transition-all duration-500 ease-out h-full"
                        style={{
                          transform: isActive ? 'scale(1)' : 'scale(0.88)',
                          opacity: isActive ? 1 : 0.45,
                          filter: isActive ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.06))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.02))'
                        }}
                      >
                        <GroupeCard groupe={groupe} index={i} total={groupesFiltres.length} onClick={() => navigate(`/espace/groupes/${groupe.id}`)} onJoinVocal={() => navigate(`/espace/groupes/${groupe.id}/vocal`)} />
                      </div>
                    )}
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
          ) : (
            <div className="glass rounded-3xl border border-white/60 shadow-glass p-8 text-center">
              <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Users size={24} className="text-orange-400" />
              </div>
              <p className="text-sm font-bold text-gray-600">Aucun groupe pour le moment</p>
              <p className="text-xs text-gray-400 mt-1">
                {selectedTheme !== 'tous'
                  ? `Pas de groupe dans la catégorie "${THEME_LABELS[selectedTheme]}"`
                  : 'Soyez le premier à créer un groupe !'}
              </p>
            </div>
          )}
        </motion.div>

        {/* Carte créer un groupe */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <button onClick={() => {
            if (!auth.currentUser) {
              setShowAuthModal(true);
            } else {
              setShowCreate(true);
            }
          }} className="w-full glass rounded-3xl border-2 border-dashed border-orange-200/60 shadow-glass p-5 flex items-center gap-4 hover:border-orange-300 hover:bg-white/60 transition-all active:scale-[0.98] group">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow flex-shrink-0">
              <Plus size={24} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-extrabold text-gray-800">Créer un groupe de parole</p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                Choisissez un sujet et invitez d'autres parents
              </p>
            </div>
          </button>
        </motion.div>

        {/* Mention rassurante */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-start gap-3 bg-orange-50/60 rounded-2xl px-4 py-3.5 border border-orange-100/50"
        >
          <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <MessageCircle size={16} className="text-orange-400" />
          </div>
          <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
            Vous pouvez participer à l'écrit <span className="font-bold text-gray-600">avant</span> ou{' '}
            <span className="font-bold text-gray-600">après</span> le groupe vocal.
            Chaque groupe reste actif pendant 7 jours.
          </p>
        </motion.div>
      </main>

      {/* Modal Auth */}
      {showAuthModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowAuthModal(false)}
        >
          <AuthWall 
            fullHeight={false}
            title="Rejoignez la communauté"
            description="Connectez-vous ou inscrivez-vous pour participer aux groupes de parole. D'autres parents vous attendent !"
            icon={Users}
          />
        </div>,
        document.body
      )}

      {/* Modal Plus de Filtres (Bottom Sheet) */}
      {createPortal(
        <AnimatePresence>
          {showFiltersModal && (
            <div
              className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-end justify-center sm:items-center"
              onClick={() => setShowFiltersModal(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 pb-12 sm:pb-6 shadow-2xl relative"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-2xl flex items-center justify-center">
                      <SlidersHorizontal size={20} className="text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-gray-800 tracking-tight">Filtres avancés</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Affiner la recherche</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowFiltersModal(false)}
                    className="p-2.5 bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors border border-gray-100"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Sections de filtres */}
                <div className="space-y-6">
                  
                  {/* 1. Date / Période (Plage révisée pour groupes éphémères) */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={14} className="text-orange-400" /> Moment
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setFilterDate('aujourdhui')}
                        className={`py-3 px-3 rounded-2xl border-2 font-extrabold text-xs transition-colors shadow-sm
                          ${filterDate === 'aujourdhui' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}
                        `}
                      >
                        Aujourd'hui
                      </button>
                      <button 
                        onClick={() => setFilterDate('demain')}
                        className={`py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-colors
                          ${filterDate === 'demain' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}
                        `}
                      >
                        Demain
                      </button>
                      <button 
                        onClick={() => setFilterDate('3jours')}
                        className={`py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-colors
                          ${filterDate === '3jours' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}
                        `}
                      >
                        Dans les 3 jours
                      </button>
                      <button 
                        onClick={() => setFilterDate('toutes')}
                        className={`py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-colors
                          ${filterDate === 'toutes' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}
                        `}
                      >
                        Toutes dates
                      </button>
                    </div>
                  </div>

                  {/* 2. Animateur / Parent */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Search size={14} className="text-violet-400" /> Créateur du groupe
                    </label>
                    <div className="relative group">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-violet-500 transition-colors" />
                      <input 
                        type="text" 
                        value={filterCreator}
                        onChange={(e) => setFilterCreator(e.target.value)}
                        placeholder="Rechercher par pseudo..."
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold text-gray-700 focus:outline-none focus:border-violet-300 focus:bg-white transition-all placeholder:font-medium"
                      />
                    </div>
                  </div>

                  {/* 3. Tri / Activité (Remplace Format) */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Tag size={14} className="text-emerald-400" /> Trier par
                    </label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setFilterSort('recents')}
                        className={`flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-[11px] transition-colors
                          ${filterSort === 'recents' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}
                        `}
                      >
                        Plus récents (Dates)
                      </button>
                      <button 
                        onClick={() => setFilterSort('actifs')}
                        className={`flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-[11px] transition-colors
                          ${filterSort === 'actifs' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}
                        `}
                      >
                        Plus actifs (Chat)
                      </button>
                    </div>
                  </div>

                </div>

                {/* Boutons Actions */}
                <div className="mt-8 pt-4 border-t border-gray-100 space-y-3">
                  <button
                    onClick={() => {
                      setFilterDate('toutes');
                      setFilterCreator('');
                      setFilterSort('recents');
                      setPlacesDispoOnly(false);
                      setSelectedTheme('tous');
                    }}
                    className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest text-center"
                  >
                    Réinitialiser tous les filtres
                  </button>
                  <button
                    onClick={() => setShowFiltersModal(false)}
                    className="w-full py-4 bg-gray-900 border border-gray-800 text-white rounded-[1.25rem] font-extrabold text-[13px] uppercase tracking-wider shadow-xl shadow-gray-900/20 hover:bg-black active:scale-[0.98] transition-all"
                  >
                    Voir {groupesFiltres.length} groupe{groupesFiltres.length !== 1 ? 's' : ''}
                  </button>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
      </div> {/* End scrollable container */}
    </div>
  );
};

export default SlideForum;
