import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Mic, Clock, Crown, Calendar, Inbox, Radio, Lock, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { onGroupesParole, onGroupeRating } from '../../lib/groupeParoleService';
import type { GroupeParole } from '../../types/groupeParole';
import { THEME_COLORS, THEME_SHORT_LABELS } from '../../types/groupeParole';

// --- Helpers ---
function formatDateVocal(date: Date): string {
  const now = new Date();
  const isPassé = date.getTime() < now.getTime();
  const jour = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isPassé) return `Terminé le ${jour}`;
  return `${jour} à ${heure}`;
}

function joursRestants(dateExpiration: Date): number {
  const diff = dateExpiration.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

/** Calcule le statut vocal par rapport à maintenant */
function getVocalStatus(dateVocal: Date): {
  status: 'passed' | 'open' | 'soon' | 'waiting';
  minutesLeft?: number;
} {
  const now = Date.now();
  const vocalTime = dateVocal.getTime();
  const diff = vocalTime - now;
  const minutesLeft = Math.ceil(diff / 60000);

  if (diff < 0) return { status: 'passed' };
  // Salle ouverte 15 min avant et pendant 45 min après le début
  if (minutesLeft <= 15) return { status: 'open' };
  if (minutesLeft <= 60) return { status: 'soon', minutesLeft };
  return { status: 'waiting', minutesLeft };
}

// --- Vocal Cartouche ---
const VocalCartouche: React.FC<{
  groupe: GroupeParole;
  isParticipant: boolean;
  onRejoindre: () => void;
}> = ({ groupe, isParticipant, onRejoindre }) => {
  // Groupe test → toujours ouvert
  const rawStatus = getVocalStatus(groupe.dateVocal);
  const { status, minutesLeft } = groupe.isTestGroup
    ? { status: 'open' as const, minutesLeft: undefined }
    : rawStatus;
  const [, setTick] = useState(0);

  // Re-render every 30s to update countdown
  useEffect(() => {
    if (status === 'passed') return;
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'passed') return null;
  if (!isParticipant) return null;

  if (status === 'open') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-3.5 flex items-center gap-3 shadow-lg shadow-emerald-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Radio size={20} className="text-white animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-white">La salle est ouverte !</p>
          <p className="text-[10px] text-white/80 font-medium mt-0.5">Cliquez pour rejoindre le vocal</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRejoindre();
          }}
          className="px-4 py-2 bg-white text-emerald-600 rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-transform"
        >
          Rejoindre
        </button>
      </motion.div>
    );
  }

  if (status === 'soon') {
    return (
      <div className="mt-2 bg-orange-50 border border-orange-200/60 rounded-2xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Mic size={16} className="text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-orange-700">
            Vocal dans {minutesLeft} min
          </p>
          <p className="text-[10px] text-orange-500/80 font-medium">
            Salle ouverte 15 min avant le début
          </p>
        </div>
      </div>
    );
  }

  // waiting
  return (
    <div className="mt-2 bg-gray-50 border border-gray-200/60 rounded-2xl p-3 flex items-center gap-3">
      <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Lock size={14} className="text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-500">
          Salle ouverte 15 min avant le vocal
        </p>
        <p className="text-[10px] text-gray-400 font-medium">
          {formatDateVocal(groupe.dateVocal)}
        </p>
      </div>
    </div>
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
    <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500">
      <Heart size={9} className="text-orange-400 fill-orange-400" />
      {rating.average}/5
    </span>
  );
};

// --- Mini Group Card ---
const MiniGroupeCard: React.FC<{
  groupe: GroupeParole;
  isCreateur: boolean;
  isParticipant: boolean;
  onClick: () => void;
  onRejoindreVocal: () => void;
}> = ({ groupe, isCreateur, isParticipant, onClick, onRejoindreVocal }) => {
  const colors = THEME_COLORS[groupe.theme];
  const vocalPassé = groupe.dateVocal.getTime() < Date.now();
  const jours = joursRestants(groupe.dateExpiration);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      {/* Clickable card */}
      <button
        onClick={onClick}
        className="w-full glass rounded-2xl border border-white/60 shadow-glass overflow-hidden text-left active:scale-[0.98] transition-transform"
      >
        {/* Theme banner */}
        <div className={`${colors.bg} px-4 py-2 flex items-center justify-between`}>
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">
            {THEME_SHORT_LABELS[groupe.theme]}
          </span>
          {isCreateur && (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full">
              <Crown size={10} /> Créateur
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-2.5">
          <h3 className="text-sm font-extrabold text-gray-800 leading-snug line-clamp-2">
            {groupe.titre}
          </h3>

          {!isCreateur && (
            <p className="text-[10px] text-gray-400 font-semibold">
              Créé par {groupe.createurPseudo}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs">
            {/* Participants */}
            <div className="flex items-center gap-1.5">
              <Users size={13} className={colors.text} />
              <span className="font-bold text-gray-600">
                {groupe.participants.length}/{groupe.participantsMax}
              </span>
            </div>

            {/* Vocal */}
            <div className="flex items-center gap-1.5">
              <Mic size={13} className={vocalPassé ? 'text-gray-400' : 'text-orange-500'} />
              <span className={`font-semibold ${vocalPassé ? 'text-gray-400' : 'text-gray-600'}`}>
                {formatDateVocal(groupe.dateVocal)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100/60">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-orange-400" />
              <span className="text-[10px] font-semibold text-orange-500">
                {jours}j restant{jours > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <GroupeRatingBadge groupeId={groupe.id} />
              <span className="text-[10px] text-gray-300 font-medium">
                {groupe.messageCount || 0} msg
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Vocal cartouche — separate from the clickable card */}
      <VocalCartouche groupe={groupe} isParticipant={isParticipant} onRejoindre={onRejoindreVocal} />
    </motion.div>
  );
};

// --- Section ---
const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}> = ({ title, icon, count, children }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-extrabold text-gray-700 tracking-tight">{title}</h2>
      <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
        {count}
      </span>
    </div>
    {children}
  </div>
);

// --- Page principale ---
export const MesGroupesPage = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [allGroupes, setAllGroupes] = useState<GroupeParole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) setIsLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setAllGroupes([]);
      setIsLoading(false);
      return;
    }

    const unsub = onGroupesParole((groupes: GroupeParole[]) => {
      setAllGroupes(groupes);
      setIsLoading(false);
    });

    return () => unsub();
  }, [currentUser]);

  const uid = currentUser?.uid || '';
  const now = new Date();

  // Filter: groups I created
  const groupesCrees = allGroupes.filter((g) => g.createurUid === uid);

  // Filter: groups I joined (not creator), upcoming vocal
  const inscriptionsAvenir = allGroupes.filter(
    (g) =>
      g.createurUid !== uid &&
      g.participants.some((p) => p.uid === uid) &&
      g.dateVocal.getTime() > now.getTime()
  );

  // Filter: groups I joined (not creator), vocal passed
  const participationsPassees = allGroupes.filter(
    (g) =>
      g.createurUid !== uid &&
      g.participants.some((p) => p.uid === uid) &&
      g.dateVocal.getTime() <= now.getTime()
  );

  const totalCount = groupesCrees.length + inscriptionsAvenir.length + participationsPassees.length;

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
            <Users size={18} className="text-orange-500" />
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Mes Groupes</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-10">
        <div className="max-w-md mx-auto px-6 py-6 space-y-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            /* Empty state */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16 space-y-4"
            >
              <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto">
                <Inbox size={36} className="text-orange-300" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-700">Aucun groupe</h3>
                <p className="text-sm text-gray-400 font-medium mt-1">
                  Vous n'avez encore rejoint ou créé aucun groupe de parole.
                </p>
              </div>
              <button
                onClick={() => navigate('/espace/groupes')}
                className="mt-4 px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-colors"
              >
                Découvrir les groupes
              </button>
            </motion.div>
          ) : (
            <>
              {/* Section: Groupes créés */}
              {groupesCrees.length > 0 && (
                <Section
                  title="Groupes que j'ai créés"
                  icon={<Crown size={16} className="text-orange-500" />}
                  count={groupesCrees.length}
                >
                  <div className="space-y-3">
                    {groupesCrees.map((g) => (
                      <MiniGroupeCard
                        key={g.id}
                        groupe={g}
                        isCreateur={true}
                        isParticipant={true}
                        onClick={() => navigate(`/espace/groupes/${g.id}`)}
                        onRejoindreVocal={() => navigate(`/espace/groupes/${g.id}/vocal`)}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Section: Inscriptions à venir */}
              {inscriptionsAvenir.length > 0 && (
                <Section
                  title="Inscriptions à venir"
                  icon={<Calendar size={16} className="text-blue-500" />}
                  count={inscriptionsAvenir.length}
                >
                  <div className="space-y-3">
                    {inscriptionsAvenir.map((g) => (
                      <MiniGroupeCard
                        key={g.id}
                        groupe={g}
                        isCreateur={false}
                        isParticipant={true}
                        onClick={() => navigate(`/espace/groupes/${g.id}`)}
                        onRejoindreVocal={() => navigate(`/espace/groupes/${g.id}/vocal`)}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Section: Participations passées */}
              {participationsPassees.length > 0 && (
                <Section
                  title="Participations passées"
                  icon={<Clock size={16} className="text-gray-400" />}
                  count={participationsPassees.length}
                >
                  <div className="space-y-3">
                    {participationsPassees.map((g) => (
                      <MiniGroupeCard
                        key={g.id}
                        groupe={g}
                        isCreateur={false}
                        isParticipant={true}
                        onClick={() => navigate(`/espace/groupes/${g.id}`)}
                        onRejoindreVocal={() => navigate(`/espace/groupes/${g.id}/vocal`)}
                      />
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MesGroupesPage;
