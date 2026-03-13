import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Mic, Clock, Plus, MessageCircle, Filter } from 'lucide-react';
import type { GroupeParole, ThemeGroupe } from '../../../types/groupeParole';
import { THEME_LABELS, THEME_COLORS, THEME_SHORT_LABELS } from '../../../types/groupeParole';

// --- Mock data (à remplacer par Firestore) ---
const MOCK_GROUPES: GroupeParole[] = [
  {
    id: '1',
    titre: 'Mon enfant refuse d\'aller à l\'école',
    theme: 'ecole',
    createurUid: 'u1',
    createurPseudo: 'Marie',
    dateCreation: new Date(Date.now() - 2 * 86400000),
    dateVocal: new Date(Date.now() + 1 * 86400000),
    dateExpiration: new Date(Date.now() + 5 * 86400000),
    participantsMax: 5,
    participants: [
      { uid: 'u1', pseudo: 'Marie', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u2', pseudo: 'Sophie', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u3', pseudo: 'Thomas', inscritVocal: false, dateInscription: new Date() },
    ],
    messages: [],
  },
  {
    id: '2',
    titre: 'Gérer les crises de colère à la maison',
    theme: 'comportement',
    createurUid: 'u4',
    createurPseudo: 'Laura',
    dateCreation: new Date(Date.now() - 1 * 86400000),
    dateVocal: new Date(Date.now() + 2 * 86400000),
    dateExpiration: new Date(Date.now() + 6 * 86400000),
    participantsMax: 5,
    participants: [
      { uid: 'u4', pseudo: 'Laura', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u5', pseudo: 'Pierre', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u6', pseudo: 'Camille', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u7', pseudo: 'Julie', inscritVocal: false, dateInscription: new Date() },
      { uid: 'u8', pseudo: 'Marc', inscritVocal: false, dateInscription: new Date() },
    ],
    messages: [],
  },
  {
    id: '3',
    titre: 'Aider son enfant à exprimer ses émotions',
    theme: 'emotions',
    createurUid: 'u9',
    createurPseudo: 'Claire',
    dateCreation: new Date(Date.now() - 3 * 86400000),
    dateVocal: new Date(Date.now() + 3 * 86400000),
    dateExpiration: new Date(Date.now() + 4 * 86400000),
    participantsMax: 5,
    participants: [
      { uid: 'u9', pseudo: 'Claire', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u10', pseudo: 'David', inscritVocal: true, dateInscription: new Date() },
    ],
    messages: [],
  },
  {
    id: '4',
    titre: 'Retard de langage : partage d\'expériences',
    theme: 'developpement',
    createurUid: 'u11',
    createurPseudo: 'Nathalie',
    dateCreation: new Date(Date.now() - 4 * 86400000),
    dateVocal: new Date(Date.now() - 1 * 86400000),
    dateExpiration: new Date(Date.now() + 3 * 86400000),
    participantsMax: 5,
    participants: [
      { uid: 'u11', pseudo: 'Nathalie', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u12', pseudo: 'Antoine', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u13', pseudo: 'Sarah', inscritVocal: true, dateInscription: new Date() },
      { uid: 'u14', pseudo: 'Éric', inscritVocal: false, dateInscription: new Date() },
    ],
    messages: [],
  },
  {
    id: '5',
    titre: 'Les devoirs du soir : comment s\'organiser ?',
    theme: 'ecole',
    createurUid: 'u15',
    createurPseudo: 'Isabelle',
    dateCreation: new Date(Date.now() - 1 * 86400000),
    dateVocal: new Date(Date.now() + 4 * 86400000),
    dateExpiration: new Date(Date.now() + 6 * 86400000),
    participantsMax: 5,
    participants: [
      { uid: 'u15', pseudo: 'Isabelle', inscritVocal: true, dateInscription: new Date() },
    ],
    messages: [],
  },
];

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

const GroupeCard: React.FC<{
  groupe: GroupeParole;
  index: number;
}> = ({ groupe, index }) => {
  const colors = THEME_COLORS[groupe.theme];
  const jours = joursRestants(groupe.dateExpiration);
  const placesRestantes = groupe.participantsMax - groupe.participants.length;
  const estComplet = placesRestantes === 0;
  const vocalPassé = isVocalPassé(groupe.dateVocal);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.06 }}
      className="flex-shrink-0 w-[280px] snap-center"
    >
      <div className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden h-full flex flex-col">
        {/* Bandeau thème */}
        <div className={`${colors.bg} px-4 py-2.5 flex items-center justify-between`}>
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">
            {THEME_SHORT_LABELS[groupe.theme]}
          </span>
          {estComplet && (
            <span className="text-[9px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
              Complet
            </span>
          )}
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
              {!vocalPassé && (
                <span className="text-[9px] font-bold bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full ml-auto">
                  À venir
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pied : temps restant */}
        <div className="px-4 py-3 border-t border-gray-100/60 flex items-center gap-2">
          <Clock size={12} className="text-orange-400" />
          <span className="text-[11px] font-semibold text-orange-500">
            Encore {jours} jour{jours > 1 ? 's' : ''}
          </span>
          <span className="text-[10px] text-gray-300 ml-auto font-medium">
            {groupe.messages.length} message{groupe.messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

// --- Page principale ---
export const SlideForum = () => {
  const [selectedTheme, setSelectedTheme] = useState<ThemeGroupe | 'tous'>('tous');
  const [placesDispoOnly, setPlacesDispoOnly] = useState(false);

  const groupesFiltres = useMemo(() => {
    let result = [...MOCK_GROUPES];

    if (selectedTheme !== 'tous') {
      result = result.filter(g => g.theme === selectedTheme);
    }

    if (placesDispoOnly) {
      result = result.filter(g => g.participants.length < g.participantsMax);
    }

    return result;
  }, [selectedTheme, placesDispoOnly]);

  const themes: Array<{ key: ThemeGroupe | 'tous'; label: string }> = [
    { key: 'tous', label: 'Tous' },
    { key: 'ecole', label: 'École' },
    { key: 'comportement', label: 'Comportement' },
    { key: 'emotions', label: 'Émotions' },
    { key: 'developpement', label: 'Développement' },
  ];

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
          className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
        >
          {themes.map(t => (
            <ThemeChip
              key={t.key}
              theme={t.key}
              label={t.label}
              active={selectedTheme === t.key}
              onClick={() => setSelectedTheme(t.key)}
            />
          ))}
        </motion.div>

        {/* Carrousel de groupes */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {groupesFiltres.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-6 px-6">
              {groupesFiltres.map((groupe, i) => (
                <GroupeCard key={groupe.id} groupe={groupe} index={i} />
              ))}
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

        {/* Mention rassurante */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
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

        {/* Carte créer un groupe */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <button className="w-full glass rounded-3xl border-2 border-dashed border-orange-200/60 shadow-glass p-5 flex items-center gap-4 hover:border-orange-300 hover:bg-white/60 transition-all active:scale-[0.98] group">
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
      </main>
    </div>
  );
};

export default SlideForum;
