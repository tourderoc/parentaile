import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Mic, Clock, Plus, MessageCircle, Filter, Loader2, Heart, Settings } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { auth } from '../../../lib/firebase';
import { onGroupesParole, onGroupeRating, onPresenceCount } from '../../../lib/groupeParoleService';
import type { GroupeParole, ThemeGroupe } from '../../../types/groupeParole';
import { THEME_LABELS, THEME_COLORS, THEME_SHORT_LABELS } from '../../../types/groupeParole';
import { CreateGroupeParole } from './CreateGroupeParole';


// --- Helpers ---
function joursRestants(dateExpiration: Date): number {
  const diff = dateExpiration.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatDateVocal(date: Date): string {
  const now = new Date();
  const isPassé = date.getTime() < now.getTime();

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
  onClick?: () => void;
}> = ({ groupe, index, onClick }) => {
  const navigate = useNavigate();
  const colors = THEME_COLORS[groupe.theme];
  const jours = joursRestants(groupe.dateExpiration);
  const placesRestantes = groupe.participantsMax - groupe.participants.length;
  const estComplet = placesRestantes === 0;
  const vocalPassé = isVocalPassé(groupe.dateVocal);

  // Presence temps reel : ecouter quand la salle est ouverte (15 min avant → 60 min apres)
  const [onlineCount, setOnlineCount] = useState(0);
  const salleOuverte = !vocalPassé && (groupe.dateVocal.getTime() - Date.now()) < 15 * 60000;

  useEffect(() => {
    if (!salleOuverte && !groupe.isTestGroup) return;
    const unsub = onPresenceCount(groupe.id, setOnlineCount);
    return unsub;
  }, [salleOuverte, groupe.id, groupe.isTestGroup]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.06 }}
      className="w-full h-full cursor-pointer"
      onClick={onClick}
    >
      <div className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden h-full flex flex-col bg-white/40 hover:bg-white/60 transition-colors duration-300">
        {/* Bandeau thème avec dégradé subtil */}
        <div className={`${colors.bg} bg-gradient-to-r from-transparent to-black/10 px-4 py-3 flex items-center justify-between border-b border-white/20`}>
          <span className="text-[10px] font-extrabold text-white uppercase tracking-[0.15em] drop-shadow-sm">
            {THEME_SHORT_LABELS[groupe.theme]}
          </span>
          <div className="flex items-center gap-2">
            {groupe.isTestGroup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/espace/test-config');
                }}
                className="w-7 h-7 bg-white/25 backdrop-blur-md rounded-lg flex items-center justify-center hover:bg-white/40 transition-colors"
              >
                <Settings size={14} className="text-white" />
              </button>
            )}
            {estComplet && (
              <span className="text-[9px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-md">
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
              <div className={`w-7 h-7 ${vocalPassé ? 'bg-gray-100' : 'bg-orange-50'} rounded-lg flex items-center justify-center`}>
                <Mic size={14} className={vocalPassé ? 'text-gray-400' : 'text-orange-500'} />
              </div>
              <span className={`text-xs font-semibold ${vocalPassé ? 'text-gray-400' : 'text-gray-600'}`}>
                {formatDateVocal(groupe.dateVocal)}
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
        {salleOuverte && (!estComplet || groupe.participants.some(p => p.uid === auth.currentUser?.uid)) ? (
          <div className="px-4 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-400 flex items-center justify-center gap-2 mt-auto">
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
  const [showCreate, setShowCreate] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeGroupe | 'tous'>('tous');
  const [placesDispoOnly, setPlacesDispoOnly] = useState(false);
  const [groupes, setGroupes] = useState<GroupeParole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onGroupesParole((data) => {
      setGroupes(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

    // Tri personnalisé : sessions les plus proches et disponibles en premier
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

      // 3. Tri par date
      if (!aPast && !bPast) {
        // Pour les sessions à venir : la plus proche en premier
        return a.dateVocal.getTime() - b.dateVocal.getTime();
      }

      // Pour les sessions passées : la plus récente en premier
      return b.dateVocal.getTime() - a.dateVocal.getTime();
    });

    return result;
  }, [groupes, selectedTheme, placesDispoOnly]);

  const themes: Array<{ key: ThemeGroupe | 'tous'; label: string }> = [
    { key: 'tous', label: 'Tous' },
    { key: 'ecole', label: 'École' },
    { key: 'comportement', label: 'Comportement' },
    { key: 'emotions', label: 'Émotions' },
    { key: 'developpement', label: 'Développement' },
    { key: 'autre', label: 'Autre' },
  ];

  if (showCreate) {
    return <CreateGroupeParole onBack={() => setShowCreate(false)} />;
  }

  return (
    <div className="h-full bg-[#FFFBF0] overflow-y-auto pb-32">
      {/* Header sticky */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-4">
          <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">
            Groupes de parole
          </h1>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5">
            Petits cercles d'échange entre parents
          </p>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-5 space-y-5">
        {/* Toggle places disponibles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <button
            onClick={() => setPlacesDispoOnly(!placesDispoOnly)}
            className={`
              flex items-center gap-2.5 w-full px-4 py-3 rounded-2xl transition-all
              ${placesDispoOnly
                ? 'bg-emerald-50 border-2 border-emerald-200 shadow-sm'
                : 'bg-white/50 border-2 border-gray-100/60'
              }
            `}
          >
            <div className={`
              w-8 h-5 rounded-full relative transition-all flex-shrink-0
              ${placesDispoOnly ? 'bg-emerald-500' : 'bg-gray-300'}
            `}>
              <div className={`
                absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all
                ${placesDispoOnly ? 'left-3.5' : 'left-0.5'}
              `} />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className={placesDispoOnly ? 'text-emerald-600' : 'text-gray-400'} />
              <span className={`text-xs font-bold ${placesDispoOnly ? 'text-emerald-700' : 'text-gray-500'}`}>
                Places disponibles uniquement
              </span>
            </div>
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
                slidesPerView={1.25}
                spaceBetween={16}
                centeredSlides={true}
                className="w-full py-6"
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
                        <GroupeCard groupe={groupe} index={i} onClick={() => navigate(`/espace/groupes/${groupe.id}`)} />
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
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="bg-white rounded-[32px] p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-orange-400 to-orange-500 opacity-10" />

            <div className="relative text-center space-y-4">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto text-orange-500">
                <Users size={32} />
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-gray-800 tracking-tight">
                  Rejoignez la communauté
                </h3>
                <p className="text-sm text-gray-500 mt-2 font-medium leading-relaxed">
                  Connectez-vous ou inscrivez-vous pour créer et participer aux groupes de parole. D'autres parents vous attendent !
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

export default SlideForum;
