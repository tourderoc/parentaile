import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useIsSpeaking,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react';
import {
  Track,
  RoomEvent,
  RemoteParticipant,
  ConnectionState,
} from 'livekit-client';
import {
  Mic,
  MicOff,
  Crown,
  Loader2,
  AlertCircle,
  Volume2,
  UserX,
  MessageCircle,
  Hand,
  LogOut,
  KeyRound,
  Send,
  X,
  CheckCircle2,
  Users,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Lightbulb,
  Heart,
  ChevronDown,
  Lock,
  SkipForward,
  Plus,
  Square,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getLiveKitToken } from '../../lib/liveKitService';
import { 
  submitEvaluation, markEvaluationPending, getEvaluationStatus, addPoints, 
  getUserBadge, setPresence, removePresence, advancePhase, 
  extendSession, endSession, submitBanFeedback,
  initSessionStateV2, suspendSession, resumeSession, proposeAsAnimateur, onPresenceList,
  cancelGroup, incrementAnimateurDisconnect
} from '../../lib/groupeParoleService';
import type { MessageGroupe, ParticipantGroupe, StructureEtape, BadgeLevel, SessionState, MicPolicy } from '../../types/groupeParole';
import { STRUCTURE_DEFAUT, getBadgeInfo, PHASE_MIC_POLICY, DEFAULT_MIC_POLICY } from '../../types/groupeParole';
import { useVocalMachine } from '../../vocal/hooks/useVocalMachine';
import { SuspensionOverlay } from '../../components/vocal/SuspensionOverlay';
import { AnimateurWaitOverlay } from '../../components/vocal/AnimateurWaitOverlay';
import { CancellationScreen } from '../../components/vocal/CancellationScreen';

// ========== Timer Component ==========
const VocalTimer: React.FC<{ dateVocal: Date; durationMin: number; extendedMinutes?: number }> = ({
  dateVocal,
  durationMin,
  extendedMinutes = 0,
}) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    const endTime = dateVocal.getTime() + (durationMin + extendedMinutes) * 60000;

    const update = () => {
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        setIsOvertime(true);
        return;
      }

      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);

      if (min < 5) setIsOvertime(true);
      else setIsOvertime(false);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [dateVocal, durationMin, extendedMinutes]);

  return (
    <span
      className={`font-mono font-extrabold ${
        isOvertime ? 'text-red-400 animate-pulse' : 'text-white/70'
      }`}
    >
      {timeLeft}
    </span>
  );
};

// ========== Chat Panel ==========
interface VocalChatMessage {
  id: string;
  auteurUid: string;
  auteurPseudo: string;
  contenu: string;
  timestamp: number;
}

const ChatPanel: React.FC<{
  messages: VocalChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
}> = ({ messages, onSend, onClose }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute inset-x-0 bottom-0 z-50 flex flex-col bg-[#12152a]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10"
      style={{ height: '55%' }}
    >
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
          <MessageCircle size={16} className="text-blue-400" />
          Chat de la session
          <span className="text-[9px] text-white/30 font-medium">(ephemere)</span>
        </h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90">
          <X size={16} className="text-white/60" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-white/30 text-xs font-medium mt-8">Aucun message pour le moment</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.auteurUid === currentUser?.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                  isMe
                    ? 'bg-orange-500/80 rounded-br-sm'
                    : 'bg-white/10 rounded-bl-sm'
                }`}
              >
                {!isMe && (
                  <p className="text-[10px] font-bold text-blue-300 mb-0.5">{msg.auteurPseudo}</p>
                )}
                <p className="text-xs text-white font-medium">{msg.contenu}</p>
                <p className="text-[9px] text-white/40 mt-0.5 text-right">
                  {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-2 border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            spellCheck={true}
            lang="fr-FR"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Votre message..."
            className="flex-1 px-4 py-2.5 bg-white/10 border border-white/10 rounded-2xl text-sm text-white font-medium outline-none focus:border-orange-400/50 placeholder:text-white/30"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-lg disabled:opacity-40 active:scale-90 transition-all"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ========== Moderator Bottom Sheet ==========
interface ModTarget {
  identity: string;
  name: string;
  color: string;
  isMuted: boolean;
  hasHandRaised: boolean;
  warningCount: number;
}

const ModeratorSheet: React.FC<{
  target: ModTarget;
  onClose: () => void;
  onGiveWord: (identity: string) => void;
  onMute: (identity: string) => void;
  onWarn: (identity: string) => void;
  onKick: (identity: string) => void;
}> = ({ target, onClose, onGiveWord, onMute, onWarn, onKick }) => {
  const actions = [
    {
      label: 'Donner la parole',
      icon: <Mic size={20} className="text-emerald-400" />,
      bg: 'bg-emerald-500/15',
      description: target.isMuted ? 'Activer son micro' : 'Micro deja actif',
      disabled: !target.isMuted,
      onClick: () => { onGiveWord(target.identity); onClose(); },
    },
    {
      label: 'Couper le micro',
      icon: <MicOff size={20} className="text-orange-400" />,
      bg: 'bg-orange-500/15',
      description: 'Muter ce participant',
      disabled: target.isMuted,
      onClick: () => { onMute(target.identity); onClose(); },
    },
    {
      label: 'Avertissement',
      icon: <AlertTriangle size={20} className="text-amber-400" />,
      bg: 'bg-amber-500/15',
      description: 'Rappeler les regles de bienveillance',
      disabled: false,
      onClick: () => { onWarn(target.identity); onClose(); },
    },
    {
      label: 'Bannir de la salle',
      icon: <ShieldAlert size={20} className={target.warningCount >= 2 ? 'text-red-300' : 'text-red-400'} />,
      bg: target.warningCount >= 2 ? 'bg-red-500/30 border border-red-500/40' : 'bg-red-500/15',
      description: target.warningCount >= 2
        ? `${target.warningCount} avertissements — exclusion recommandee`
        : 'Exclure definitivement de la session',
      disabled: false,
      onClick: () => { onKick(target.identity); onClose(); },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute inset-x-0 bottom-0 z-50 bg-[#1e2245]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 pb-8"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Target participant info */}
        <div className="flex items-center gap-3 px-6 pb-4 border-b border-white/10">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: target.color }}
          >
            <span className="text-lg font-extrabold text-white">
              {target.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-base font-extrabold text-white">{target.name}</p>
            <p className="text-xs text-white/40 font-medium">
              {target.isMuted ? 'Micro coupe' : 'Micro actif'}
              {target.hasHandRaised ? ' · Main levee' : ''}
              {target.warningCount > 0 && (
                <span className={`ml-1 ${target.warningCount >= 2 ? 'text-red-400' : 'text-amber-400'}`}>
                  · {target.warningCount} avertissement{target.warningCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90"
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>

        {/* Actions */}
        <div className="px-4 pt-3 space-y-1">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] ${
                action.disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${action.bg}`}>
                {action.icon}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-white">{action.label}</p>
                <p className="text-[11px] text-white/40 font-medium">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
};

// ========== Circular Participant ==========
const BADGE_RING_COLORS: Record<BadgeLevel, string> = {
  none: 'rgba(255,255,255,0.15)',
  plume: '#F9A826',
  envol: '#8B5CF6',
  nid: '#F59E0B',
};

const CircleParticipant: React.FC<{
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isAnimateur: boolean;
  isLocal: boolean;
  hasHandRaised: boolean;
  warningCount?: number;
  showWarningBadge?: boolean;
  angle: number;
  radius: number;
  color: string;
  avatarUrl?: string;
  onTap?: () => void;
  badge?: BadgeLevel;
}> = ({ name, isSpeaking, isMuted, isAnimateur, isLocal, hasHandRaised, warningCount = 0, showWarningBadge = false, angle, radius, color, avatarUrl, onTap, badge = 'none' }) => {
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="absolute flex flex-col items-center"
      style={{
        left: `calc(50% + ${x}px - 36px)`,
        top: `calc(50% + ${y}px - 36px)`,
      }}
    >
      {/* Avatar — tappable for moderator actions */}
      <div className="relative cursor-pointer" onClick={onTap}>
        {/* Speaking glow ring */}
        {isSpeaking && (
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-[-6px] rounded-full"
            style={{ background: `${color}40`, border: `2px solid ${color}` }}
          />
        )}

        <div
          className={`relative w-[76px] h-[76px] rounded-full flex items-center justify-center transition-all duration-300 ${
            isSpeaking ? 'scale-110 z-10' : 'hover:scale-105'
          }`}
          style={{
            background: avatarUrl ? 'transparent' : `linear-gradient(135deg, ${color}, ${color}cc)`,
            border: isSpeaking ? `3px solid ${color}` : `3px solid ${BADGE_RING_COLORS[badge]}`,
            boxShadow: isSpeaking ? `0 0 25px ${color}80, 0 8px 32px rgba(0,0,0,0.5)` : '0 8px 32px rgba(0,0,0,0.4)'
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-2xl font-extrabold text-white">
              {name.charAt(0).toUpperCase()}
            </span>
          )}

          {/* Mic indicator */}
          {isSpeaking && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: color }}
            >
              <Volume2 size={11} className="text-white" />
            </motion.div>
          )}

          {isMuted && !isSpeaking && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center shadow-lg">
              <MicOff size={11} className="text-white" />
            </div>
          )}

          {/* Animateur crown */}
          {isAnimateur && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-[#1a1f3a]">
              <Crown size={11} className="text-white" />
            </div>
          )}

          {/* Hand raised */}
          {hasHandRaised && (
            <motion.div
              initial={{ scale: 0, y: 5 }}
              animate={{ scale: 1, y: 0 }}
              className="absolute -top-2 -left-2 w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center shadow-lg border-2 border-[#1a1f3a]"
            >
              <span className="text-sm">✋</span>
            </motion.div>
          )}

          {/* Warning badge (visible to warned participant + animateur) */}
          {showWarningBadge && warningCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-[#1a1f3a] ${
                warningCount >= 2 ? 'bg-red-500' : 'bg-amber-500'
              }`}
            >
              <AlertTriangle size={10} className="text-white" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Name label */}
      <div className="mt-2 text-center">
        <p className="text-[11px] font-bold text-white/90 max-w-[80px] truncate">
          {isLocal ? 'Vous' : isAnimateur ? 'Anim' : name}
        </p>
        {isSpeaking ? (
          <p className="text-[9px] font-medium text-emerald-400">
            {isLocal ? 'Vous parlez' : `${name} parle`}
          </p>
        ) : badge !== 'none' ? (
          <p className="text-[8px] font-bold" style={{ color: BADGE_RING_COLORS[badge] }}>
            {getBadgeInfo(badge).label}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
};

// ========== Avatar colors for participants ==========
const AVATAR_COLORS = [
  '#F59E0B', // amber
  '#3B82F6', // blue
  '#EC4899', // pink
  '#10B981', // emerald
  '#8B5CF6', // violet
  '#EF4444', // red
  '#06B6D4', // cyan
  '#F97316', // orange
];

// ========== Phase Suggestions ==========
const PHASE_SUGGESTIONS: Record<string, string[]> = {
  'Presentations': [
    'Invitez chacun a se presenter brievement',
    'Rappelez les regles de bienveillance',
    'Creez un climat de confiance des le depart',
  ],
  'Partage du vecu': [
    'Encouragez les temoignages personnels',
    'Reformulez pour montrer votre ecoute',
    'Veillez a la repartition du temps de parole',
  ],
  'Tour de parole': [
    'Donnez la parole a ceux qui ne se sont pas exprimes',
    'Posez des questions ouvertes pour relancer',
    'Valorisez chaque contribution',
  ],
  'Discussion libre': [
    'Laissez les echanges se faire naturellement',
    'Recadrez si la discussion devie du theme',
    'Preparez une conclusion bienveillante',
  ],
};
const DEFAULT_SUGGESTIONS = [
  'Soyez a l\'ecoute active',
  'Reformulez les propos pour valider la comprehension',
  'Gardez un oeil sur le temps',
];

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getSuggestionsForPhase(
  phaseLabel: string,
  phaseIndex: number,
  animateurNotes: AnimateurNotes | null
): { tips: string[]; question?: string } {
  if (animateurNotes) {
    const tips: string[] = [];
    if (phaseIndex === 0 && animateurNotes.introduction) {
      tips.push(animateurNotes.introduction);
    }
    if (animateurNotes.structure[phaseIndex]) {
      tips.push(animateurNotes.structure[phaseIndex]);
    }
    const question = animateurNotes.questions.length > 0
      ? animateurNotes.questions[phaseIndex % animateurNotes.questions.length]
      : undefined;
    return { tips: tips.length > 0 ? tips : DEFAULT_SUGGESTIONS, question };
  }
  const normalized = normalize(phaseLabel);
  const matched = PHASE_SUGGESTIONS[normalized] || DEFAULT_SUGGESTIONS;
  return { tips: matched };
}

// ========== useSessionPhase Hook ==========
type PhaseTimeStatus = 'ok' | 'warning' | 'danger';

interface SessionPhase {
  currentIndex: number;
  currentLabel: string;
  overallProgress: number;
  phaseProgress: number;
  totalDurationMin: number;
  elapsedMin: number;
  isComplete: boolean;
  phaseTimeStatus: PhaseTimeStatus;
  phaseElapsedMin: number;
}

function useSessionPhase(
  dateVocal: Date,
  structureType: 'libre' | 'structuree',
  structure: StructureEtape[],
  firestoreSession: SessionState | null,
  defaultDurationMin: number = 45
): SessionPhase {
  const [phase, setPhase] = useState<SessionPhase>({
    currentIndex: 0,
    currentLabel: '',
    overallProgress: 0,
    phaseProgress: 0,
    totalDurationMin: defaultDurationMin,
    elapsedMin: 0,
    isComplete: false,
    phaseTimeStatus: 'ok',
    phaseElapsedMin: 0,
  });

  useEffect(() => {
    const extendedMin = firestoreSession?.extendedMinutes ?? 0;
    const baseDuration = structureType === 'structuree' && structure.length > 0
      ? structure.reduce((sum, s) => sum + s.dureeMinutes, 0)
      : defaultDurationMin;
    const totalMin = baseDuration + extendedMin;

    // If session ended by animateur
    if (firestoreSession && !firestoreSession.sessionActive) {
      setPhase(prev => ({ ...prev, isComplete: true, totalDurationMin: totalMin }));
      return;
    }

    const update = () => {
      const elapsed = (Date.now() - dateVocal.getTime()) / 60000;
      const clampedElapsed = Math.max(0, elapsed);
      const overall = Math.min(1, clampedElapsed / totalMin);
      const isComplete = clampedElapsed >= totalMin;

      if (structureType === 'structuree' && structure.length > 0) {
        // Phase index comes from Firestore (manual control) or fallback to time-based
        const idx = firestoreSession
          ? Math.min(firestoreSession.currentPhaseIndex, structure.length - 1)
          : (() => {
              let accumulated = 0;
              for (let i = 0; i < structure.length; i++) {
                if (clampedElapsed < accumulated + structure[i].dureeMinutes) return i;
                accumulated += structure[i].dureeMinutes;
              }
              return structure.length - 1;
            })();

        // Phase elapsed from Firestore phaseStartedAt or calculated
        const phaseElapsedMin = firestoreSession?.phaseStartedAt
          ? Math.max(0, (Date.now() - firestoreSession.phaseStartedAt.getTime()) / 60000)
          : (() => {
              const phaseStart = structure.slice(0, idx).reduce((s, e) => s + e.dureeMinutes, 0);
              return Math.max(0, clampedElapsed - phaseStart);
            })();

        const phaseDur = structure[idx].dureeMinutes;
        const inPhase = Math.min(1, phaseElapsedMin / phaseDur);

        // Determine time status based on phase elapsed vs indicative duration
        let phaseTimeStatus: PhaseTimeStatus = 'ok';
        if (phaseElapsedMin > phaseDur * 1.5) {
          phaseTimeStatus = 'danger';
        } else if (phaseElapsedMin > phaseDur) {
          phaseTimeStatus = 'warning';
        }

        setPhase({
          currentIndex: idx,
          currentLabel: structure[idx].label,
          overallProgress: overall,
          phaseProgress: inPhase,
          totalDurationMin: totalMin,
          elapsedMin: clampedElapsed,
          isComplete,
          phaseTimeStatus,
          phaseElapsedMin,
        });
      } else {
        setPhase({
          currentIndex: 0,
          currentLabel: '',
          overallProgress: overall,
          phaseProgress: overall,
          totalDurationMin: totalMin,
          elapsedMin: clampedElapsed,
          isComplete,
          phaseTimeStatus: 'ok',
          phaseElapsedMin: clampedElapsed,
        });
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [dateVocal, structureType, structure, defaultDurationMin, firestoreSession]);

  return phase;
}

// ========== Session Progress Bar ==========
const SessionProgressBar: React.FC<{
  structureType: 'libre' | 'structuree';
  structure: StructureEtape[];
  phase: SessionPhase;
}> = ({ structureType, structure, phase }) => {
  if (structureType === 'structuree' && structure.length > 0) {
    return (
      <div className="px-6 mt-2 mb-1">
        {/* Segmented bar */}
        <div className="flex gap-[2px] h-1.5 rounded-full overflow-hidden border border-white/5">
          {structure.map((etape, i) => {
            const widthPct = (etape.dureeMinutes / phase.totalDurationMin) * 100;
            const isPast = i < phase.currentIndex;
            const isCurrent = i === phase.currentIndex;
            return (
              <div
                key={i}
                className="relative overflow-hidden"
                style={{ width: `${widthPct}%`, background: 'rgba(255,255,255,0.07)' }}
              >
                {isPast && (
                  <div className="absolute inset-0 bg-violet-500" />
                )}
                {isCurrent && (
                  <motion.div
                    className={`absolute inset-y-0 left-0 ${
                      phase.phaseTimeStatus === 'danger' ? 'bg-red-500' :
                      phase.phaseTimeStatus === 'warning' ? 'bg-orange-500' :
                      'bg-violet-500'
                    }`}
                    animate={{ width: `${Math.min(phase.phaseProgress, 1) * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* Phase labels */}
        <div className="flex mt-1">
          {structure.map((etape, i) => {
            const widthPct = (etape.dureeMinutes / phase.totalDurationMin) * 100;
            const isCurrent = i === phase.currentIndex;
            return (
              <p
                key={i}
                className={`text-[9px] font-medium truncate ${
                  isCurrent
                    ? phase.phaseTimeStatus === 'danger' ? 'text-red-300 font-bold'
                    : phase.phaseTimeStatus === 'warning' ? 'text-orange-300 font-bold'
                    : 'text-violet-300 font-bold'
                    : 'text-white/25'
                }`}
                style={{ width: `${widthPct}%` }}
              >
                {etape.label}
              </p>
            );
          })}
        </div>
      </div>
    );
  }

  // Libre mode: single continuous bar
  return (
    <div className="px-6 mt-2 mb-1">
      <div className="h-1.5 rounded-full overflow-hidden border border-white/5" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(to right, #8b5cf6, #f97316)' }}
          animate={{ width: `${phase.overallProgress * 100}%` }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
    </div>
  );
};

// ========== Ban Screen ==========
const BanScreen: React.FC<{
  groupeTitre: string;
  groupeId: string;
  onDone: () => void;
}> = ({ groupeTitre, groupeId, onDone }) => {
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async () => {
    const user = auth.currentUser;
    if (!user || !feedback.trim()) return;
    setSubmitting(true);
    try {
      await submitBanFeedback(groupeId, user.uid, user.displayName || 'Parent', feedback.trim());
      setSubmitted(true);
    } catch {
      // ignore
    }
    setSubmitting(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center"
      >
        <ShieldAlert size={36} className="text-red-400" />
      </motion.div>

      <div>
        <h2 className="text-xl font-extrabold text-white mb-2">Vous avez ete exclu</h2>
        <p className="text-sm text-white/50 leading-relaxed max-w-xs mx-auto">
          L'animateur du groupe "{groupeTitre}" a juge necessaire de vous retirer de la session.
          Cette decision vise a proteger le bien-etre de tous les participants.
        </p>
      </div>

      {!submitted ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm space-y-3"
        >
          <p className="text-xs text-white/40 font-bold uppercase tracking-wider">
            Vous pouvez exprimer votre ressenti (transmis uniquement a l'equipe)
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Votre message (facultatif)..."
            className="w-full bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 border border-white/10 resize-none"
            rows={3}
            maxLength={500}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmitFeedback}
              disabled={!feedback.trim() || submitting}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                feedback.trim()
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Envoi...' : 'Envoyer'}
            </button>
            <button
              onClick={onDone}
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30 transition-all active:scale-95"
            >
              Retour a l'espace
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2 justify-center text-emerald-400">
            <CheckCircle2 size={18} />
            <p className="text-sm font-bold">Message transmis a l'equipe</p>
          </div>
          <button
            onClick={onDone}
            className="px-8 py-3 rounded-xl text-sm font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30 transition-all active:scale-95"
          >
            Retour a l'espace
          </button>
        </motion.div>
      )}
    </div>
  );
};

// ========== Animateur Phase Controls ==========
const AnimateurPhaseControls: React.FC<{
  currentIndex: number;
  totalPhases: number;
  currentLabel: string;
  phaseTimeStatus: PhaseTimeStatus;
  extendedMinutes: number;
  onAdvancePhase: () => void;
  onExtendTime: () => void;
  onEndSession: () => void;
}> = ({ currentIndex, totalPhases, currentLabel, phaseTimeStatus, extendedMinutes, onAdvancePhase, onExtendTime, onEndSession }) => {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const isLastPhase = currentIndex >= totalPhases - 1;

  return (
    <div className="px-6 py-2">
      <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
        {/* Advance phase button */}
        {!isLastPhase && (
          <button
            onClick={onAdvancePhase}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all active:scale-95 ${
              phaseTimeStatus === 'danger'
                ? 'bg-red-500/30 text-red-300 border border-red-500/40'
                : phaseTimeStatus === 'warning'
                ? 'bg-orange-500/30 text-orange-300 border border-orange-500/40'
                : 'bg-violet-500/30 text-violet-300 border border-violet-500/40'
            }`}
          >
            <SkipForward size={16} />
            Passer a l'etape suivante
          </button>
        )}

        {isLastPhase && <div className="flex gap-2 mt-2">
          {/* +5 min */}
          <button
            onClick={onExtendTime}
            disabled={extendedMinutes > 0}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 ${
              extendedMinutes > 0
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            <Plus size={14} />
            {extendedMinutes > 0 ? '+5 min utilise' : '+5 min'}
          </button>

          {/* Terminer */}
          {!showEndConfirm ? (
            <button
              onClick={() => setShowEndConfirm(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 transition-all active:scale-95"
            >
              <Square size={14} />
              Terminer
            </button>
          ) : (
            <div className="flex-1 flex gap-1">
              <button
                onClick={onEndSession}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-red-500 text-white transition-all active:scale-95"
              >
                Confirmer
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-white/10 text-white/60 transition-all active:scale-95"
              >
                Annuler
              </button>
            </div>
          )}
        </div>}
      </div>
    </div>
  );
};

// ========== Wake Lock (keep screen on during vocal) ==========
function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let active = true;

    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator && active) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock denied or not supported — silently ignore
      }
    };

    requestLock();

    // Re-acquire on visibility change (released automatically when tab hidden)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);
}

// ========== Room Content (inside LiveKitRoom) ==========
const RoomContent: React.FC<{
  isAnimateur: boolean;
  groupeId: string;
  groupeTitre: string;
  groupeTheme?: string;
  dateVocal: Date;
  onLeave: () => void;
  onCancelled?: () => void;
  animateurNotes?: AnimateurNotes | null;
  structureType: 'libre' | 'structuree';
  structure: StructureEtape[];
  defaultDurationMin?: number;
  onSessionProgress?: (elapsedMin: number, totalDurationMin: number) => void;
  onSessionEnded?: () => void;
  sessionPrenom: string;
  isTestGroup: boolean;
  createurUid: string;
}> = ({ isAnimateur, groupeId, groupeTitre, groupeTheme, dateVocal, onLeave, onCancelled, animateurNotes, structureType, structure, defaultDurationMin, onSessionProgress, onSessionEnded, sessionPrenom, isTestGroup, createurUid }) => {
  useWakeLock(); // Keep screen on during vocal session
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const localIsSpeaking = useIsSpeaking(localParticipant);
  const [localMuted, setLocalMuted] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [vocalChatMessages, setVocalChatMessages] = useState<VocalChatMessage[]>([]);
  const showChatRef = useRef(false);
  const [speakingName, setSpeakingName] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [chatUnread, setChatUnread] = useState(0);
  const [modTarget, setModTarget] = useState<ModTarget | null>(null);
  const [warnToast, setWarnToast] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [phaseToast, setPhaseToast] = useState<string | null>(null);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [notesPulse, setNotesPulse] = useState(false);
  const [participantBadges, setParticipantBadges] = useState<Record<string, BadgeLevel>>({});
  const [warningCounts, setWarningCounts] = useState<Record<string, number>>({});
  const [localWarnings, setLocalWarnings] = useState(0);
  const [banInfo, setBanInfo] = useState<{ banned: boolean; groupeTitre: string } | null>(null);

  // Fetch badges for all participants
  useEffect(() => {
    const identities = participants.map((p) => p.identity);
    const fetchBadges = async () => {
      const badges: Record<string, BadgeLevel> = {};
      for (const id of identities) {
        badges[id] = await getUserBadge(id);
      }
      setParticipantBadges(badges);
    };
    fetchBadges();
  }, [participants.length]); // re-fetch when participant count changes

  // Firestore session state listener (real-time sync for all participants)
  const [firestoreSession, setFirestoreSession] = useState<SessionState | null>(null);
  const [micLocked, setMicLocked] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'groupes', groupeId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.sessionState) {
          setFirestoreSession({
            currentPhaseIndex: data.sessionState.currentPhaseIndex ?? 0,
            extendedMinutes: data.sessionState.extendedMinutes ?? 0,
            sessionActive: data.sessionState.sessionActive ?? true,
            phaseStartedAt: data.sessionState.phaseStartedAt?.toDate?.() || new Date(),
            sessionStartedAt: data.sessionState.sessionStartedAt?.toDate?.() || new Date(),
            suspended: data.sessionState.suspended || false,
            suspensionReason: data.sessionState.suspensionReason,
            suspensionCount: data.sessionState.suspensionCount || 0,
            replacementUsed: data.sessionState.replacementUsed || false,
            currentAnimateurUid: data.sessionState.currentAnimateurUid || createurUid,
            currentAnimateurPseudo: data.sessionState.currentAnimateurPseudo,
          });
        }
      }
    });
    return unsub;
  }, [groupeId, createurUid]);

  // Warn when exactly 3 participants (1 local + 2 remote) — next departure = cancellation
  const prevParticipantCountRef = useRef(participants.length);
  useEffect(() => {
    const totalCount = 1 + participants.length; // local + remote
    const prevTotal = 1 + prevParticipantCountRef.current;
    if (totalCount === 3 && prevTotal > 3 && firestoreSession?.sessionActive) {
      setWarnToast('Attention : si un participant quitte, le groupe sera annulé (minimum 3)');
      setTimeout(() => setWarnToast(null), 6000);
    }
    prevParticipantCountRef.current = participants.length;
  }, [participants.length, firestoreSession?.sessionActive]);

  // Init session state when animateur enters
  const sessionInitRef = useRef(false);
  useEffect(() => {
    if (isAnimateur && !sessionInitRef.current) {
      sessionInitRef.current = true;
      initSessionStateV2(groupeId, auth.currentUser!.uid, sessionPrenom || 'Parent');
    }
  }, [isAnimateur, groupeId, sessionPrenom]);

  // ========== Vocal Machine (replaces useEffectiveAnimateur + useAnimateurWait + useSessionSuspension) ==========
  const {
    phase: machinePhase,
    reason: machineReason,
    countdownSec: machineCountdown,
    canPropose: machineCanPropose,
    isProposing,
    suspensionCount: machineSuspensionCount,
    effectiveAnimateurUid,
    isEffectiveAnimateur,
    isReplacementAnimateur,
    dispatch: machineDispatch,
    proposeAsReplacement,
  } = useVocalMachine({
    groupeId,
    createurUid,
    localUid: localParticipant?.identity || auth.currentUser?.uid || '',
    localPseudo: sessionPrenom || 'Parent',
    liveKitParticipants: participants,
    isTestGroup,
    firestoreSession: firestoreSession ? {
      suspended: firestoreSession.suspended || false,
      suspensionCount: firestoreSession.suspensionCount || 0,
      currentAnimateurUid: firestoreSession.currentAnimateurUid || createurUid,
      currentAnimateurPseudo: firestoreSession.currentAnimateurPseudo,
      replacementUsed: firestoreSession.replacementUsed || false,
      sessionActive: firestoreSession.sessionActive ?? true,
    } : null,
  });

  // Dispatch HOUR_REACHED when dateVocal passes (or immediately for test groups)
  const hourReachedRef = useRef(false);
  useEffect(() => {
    if (hourReachedRef.current) return;
    if (isTestGroup) {
      hourReachedRef.current = true;
      machineDispatch({ type: 'HOUR_REACHED' });
      return;
    }
    const now = Date.now();
    const delay = dateVocal.getTime() - now;
    if (delay <= 0) {
      hourReachedRef.current = true;
      machineDispatch({ type: 'HOUR_REACHED' });
    } else {
      const timer = setTimeout(() => {
        hourReachedRef.current = true;
        machineDispatch({ type: 'HOUR_REACHED' });
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [dateVocal, machineDispatch, isTestGroup]);

  // Navigate away when machine reaches terminal cancelled state
  useEffect(() => {
    if (machinePhase === 'SESSION_CANCELLED') {
      if (onCancelled) onCancelled();
      else onLeave();
    }
  }, [machinePhase, onLeave, onCancelled]);

  // Toast when animateur changes (replacement happened)
  const prevAnimateurUidRef = useRef(firestoreSession?.currentAnimateurUid);
  useEffect(() => {
    const currentAnimUid = firestoreSession?.currentAnimateurUid;
    const prevAnimUid = prevAnimateurUidRef.current;

    if (currentAnimUid && prevAnimUid && currentAnimUid !== prevAnimUid) {
      const newPseudo = firestoreSession?.currentAnimateurPseudo || 'Un participant';
      const myUid = auth.currentUser?.uid;

      if (currentAnimUid === myUid) {
        setPhaseToast('Vous êtes maintenant l\'animateur du groupe');
      } else if (prevAnimUid === myUid) {
        setPhaseToast(`${newPseudo} a pris le relais comme animateur`);
      } else {
        setPhaseToast(`${newPseudo} prend le relais comme animateur`);
      }
      setTimeout(() => setPhaseToast(null), 4000);
    }
    prevAnimateurUidRef.current = currentAnimUid;
  }, [firestoreSession?.currentAnimateurUid, firestoreSession?.currentAnimateurPseudo]);

  // Session phase tracking (now Firestore-driven for structured mode)
  const sessionPhase = useSessionPhase(dateVocal, structureType, structure, firestoreSession, defaultDurationMin);
  const prevPhaseRef = useRef(0);

  // Handle session end by animateur — notify parent via custom event
  useEffect(() => {
    if (firestoreSession && !firestoreSession.sessionActive) {
      onSessionEnded?.();
    }
  }, [firestoreSession?.sessionActive]);

  // Mic policy based on current phase
  const micPolicy: MicPolicy = useMemo(() => {
    if (isAnimateur) return 'open';
    const label = sessionPhase.currentLabel;
    return PHASE_MIC_POLICY[label] || DEFAULT_MIC_POLICY;
  }, [sessionPhase.currentLabel, isAnimateur]);

  // Apply mic policy on phase change
  useEffect(() => {
    if (!localParticipant || isAnimateur) return;
    if (sessionPhase.currentIndex === prevPhaseRef.current) return;

    // Apply mic policy after a short delay (don't cut someone mid-sentence)
    const timer = setTimeout(() => {
      if (micPolicy === 'open') {
        setMicLocked(false);
        setWarnToast('Micros ouverts — vous pouvez parler');
        setTimeout(() => setWarnToast(null), 3000);
      } else {
        localParticipant.setMicrophoneEnabled(false);
        setLocalMuted(true);
        setMicLocked(true);
        setWarnToast('Micros coupes — levez la main pour parler');
        setTimeout(() => setWarnToast(null), 3000);
      }
    }, 2000); // 2 sec delay before applying

    return () => clearTimeout(timer);
  }, [sessionPhase.currentIndex, micPolicy, localParticipant, isAnimateur]);

  // Report session progress to parent (for proportional points)
  useEffect(() => {
    onSessionProgress?.(sessionPhase.elapsedMin, sessionPhase.totalDurationMin);
  }, [sessionPhase.elapsedMin, sessionPhase.totalDurationMin, onSessionProgress]);

  // Phase transition notification
  useEffect(() => {
    if (sessionPhase.currentIndex !== prevPhaseRef.current && sessionPhase.currentIndex > 0) {
      // Toast for everyone
      setPhaseToast(sessionPhase.currentLabel);
      setTimeout(() => setPhaseToast(null), 3000);
      // Pulse for animateur if notes closed
      if (isAnimateur && !showNotes) {
        setNotesPulse(true);
        setTimeout(() => setNotesPulse(false), 5000);
      }
    }
    prevPhaseRef.current = sessionPhase.currentIndex;
  }, [sessionPhase.currentIndex, sessionPhase.currentLabel, isAnimateur, showNotes]);

  // Animateur phase control handlers
  const handleAdvancePhase = useCallback(async () => {
    if (!firestoreSession) return;
    const newIndex = firestoreSession.currentPhaseIndex + 1;
    if (newIndex < structure.length) {
      await advancePhase(groupeId, newIndex);
    }
  }, [firestoreSession, structure.length, groupeId]);

  const handleExtendTime = useCallback(async () => {
    if (!firestoreSession || firestoreSession.extendedMinutes > 0) return;
    await extendSession(groupeId, 5);
  }, [firestoreSession, groupeId]);

  const handleEndSession = useCallback(async () => {
    await endSession(groupeId);
  }, [groupeId]);

  // Current suggestions for animateur
  const currentSuggestions = useMemo(() => {
    if (!isAnimateur) return null;
    return getSuggestionsForPhase(
      sessionPhase.currentLabel,
      sessionPhase.currentIndex,
      animateurNotes || null
    );
  }, [isAnimateur, sessionPhase.currentLabel, sessionPhase.currentIndex, animateurNotes]);

  // Track who is speaking for the center label
  useEffect(() => {
    if (localIsSpeaking) {
      setSpeakingName('Vous');
      return;
    }
    const speaker = participants.find(
      (p) => p.identity !== localParticipant?.identity && p.isSpeaking
    );
    setSpeakingName(speaker ? (speaker.name || 'Parent') : null);
  }, [participants, localIsSpeaking, localParticipant]);

  // Circle layout radius based on participant count
  const circleRadius = useMemo(() => {
    const count = participants.length;
    if (count <= 3) return 110;
    if (count <= 5) return 125;
    if (count <= 8) return 140;
    return 155;
  }, [participants.length]);

  const handleToggleMute = useCallback(async () => {
    if (!localParticipant) return;
    // If mic is locked by phase and user tries to unmute, block it
    if (micLocked && localMuted && !isAnimateur) return;
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
    if (pub) {
      await localParticipant.setMicrophoneEnabled(localMuted);
      setLocalMuted(!localMuted);
    }
  }, [localParticipant, localMuted, micLocked, isAnimateur]);

  const handleRaiseHand = useCallback(async () => {
    if (!localParticipant) return;
    const newState = !handRaised;
    setHandRaised(newState);
    // Update local raised hands set
    setRaisedHands((prev) => {
      const next = new Set(prev);
      if (newState) next.add(localParticipant.identity);
      else next.delete(localParticipant.identity);
      return next;
    });
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ action: 'raise_hand', raised: newState, identity: localParticipant.identity }));
    await localParticipant.publishData(data, { reliable: true });
  }, [localParticipant, handRaised]);

  const handleMuteParticipant = useCallback(
    async (identity: string) => {
      if (!localParticipant || !isAnimateur) return;
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: 'mute', target: identity }));
      await localParticipant.publishData(data, { reliable: true });
    },
    [localParticipant, isAnimateur]
  );

  const handleGiveWord = useCallback(
    async (identity: string) => {
      if (!localParticipant || !isAnimateur) return;
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: 'give_word', target: identity }));
      await localParticipant.publishData(data, { reliable: true });
      // Also lower their hand
      setRaisedHands((prev) => {
        const next = new Set(prev);
        next.delete(identity);
        return next;
      });
    },
    [localParticipant, isAnimateur]
  );

  const handleWarnParticipant = useCallback(
    async (identity: string) => {
      if (!localParticipant || !isAnimateur) return;
      const newCount = (warningCounts[identity] || 0) + 1;
      setWarningCounts(prev => ({ ...prev, [identity]: newCount }));
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: 'warn', target: identity, warningCount: newCount }));
      await localParticipant.publishData(data, { reliable: true });
    },
    [localParticipant, isAnimateur, warningCounts]
  );

  const handleKickParticipant = useCallback(
    async (identity: string) => {
      if (!localParticipant || !isAnimateur) return;
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: 'kick', target: identity }));
      await localParticipant.publishData(data, { reliable: true });
    },
    [localParticipant, isAnimateur]
  );

  // Listen for data messages (mute/kick/raise_hand commands)
  useEffect(() => {
    if (!localParticipant || !room) return;

    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const decoder = new TextDecoder();
        const msg = JSON.parse(decoder.decode(payload));

        // Handle raise hand from other participants
        if (msg.action === 'raise_hand') {
          const senderIdentity = participant?.identity || msg.identity;
          if (senderIdentity) {
            setRaisedHands((prev) => {
              const next = new Set(prev);
              if (msg.raised) next.add(senderIdentity);
              else next.delete(senderIdentity);
              return next;
            });
          }
          return;
        }

        // Handle ephemeral chat messages
        if (msg.action === 'chat') {
          const chatMsg: VocalChatMessage = {
            id: msg.id || `${Date.now()}-${msg.auteurUid}`,
            auteurUid: msg.auteurUid,
            auteurPseudo: msg.auteurPseudo,
            contenu: msg.contenu,
            timestamp: msg.timestamp || Date.now(),
          };
          setVocalChatMessages((prev) => [...prev, chatMsg]);
          if (!showChatRef.current) {
            setChatUnread((prev) => prev + 1);
          }
          return;
        }

        if (msg.target === localParticipant.identity) {
          if (msg.action === 'mute') {
            localParticipant.setMicrophoneEnabled(false);
            setLocalMuted(true);
          } else if (msg.action === 'give_word') {
            localParticipant.setMicrophoneEnabled(true);
            setLocalMuted(false);
            setMicLocked(false); // animateur override
            setHandRaised(false);
            setWarnToast('L\'animateur vous donne la parole');
            setTimeout(() => setWarnToast(null), 4000);
          } else if (msg.action === 'warn') {
            const count = msg.warningCount || 1;
            setLocalWarnings(count);
            setWarnToast(
              count >= 2
                ? 'Dernier avertissement — Veuillez respecter les regles de bienveillance'
                : 'L\'animateur vous rappelle les regles de bienveillance'
            );
            setTimeout(() => setWarnToast(null), 6000);
          } else if (msg.action === 'kick') {
            setBanInfo({ banned: true, groupeTitre });
          }
        }
      } catch {
        // ignore invalid data
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, localParticipant, onLeave]);

  // Sync showChat ref for data channel handler
  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setChatUnread(0);
  }, [showChat]);

  // Send ephemeral chat message via data channel
  const handleSendChatMessage = useCallback((text: string) => {
    if (!localParticipant || !room) return;
    const user = auth.currentUser;
    if (!user) return;

    const chatMsg: VocalChatMessage = {
      id: `${Date.now()}-${user.uid}`,
      auteurUid: user.uid,
      auteurPseudo: user.displayName || 'Anonyme',
      contenu: text,
      timestamp: Date.now(),
    };

    // Add to local state immediately
    setVocalChatMessages((prev) => [...prev, chatMsg]);

    // Broadcast to others via data channel
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({
      action: 'chat',
      ...chatMsg,
    }));
    localParticipant.publishData(data, { reliable: true });
  }, [localParticipant, room]);

  // ===== Ban Screen =====
  if (banInfo?.banned) {
    return (
      <BanScreen
        groupeTitre={banInfo.groupeTitre}
        groupeId={groupeId}
        onDone={onLeave}
      />
    );
  }

  if (connectionState === ConnectionState.Connecting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
        <p className="text-sm font-bold text-white/60">Connexion a la salle...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Reconnection banner */}
      {connectionState === ConnectionState.Reconnecting && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-orange-500/90 backdrop-blur-sm px-4 py-2 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin text-white" />
          <span className="text-xs font-bold text-white">Reconnexion en cours...</span>
        </div>
      )}
      {/* Header */}
      <div className="text-center pt-6 pb-2 px-4">
        <h2 className="text-xl font-extrabold text-white tracking-tight">{groupeTitre}</h2>
        <div className="w-16 h-[2px] bg-gradient-to-r from-transparent via-orange-400 to-transparent mx-auto mt-2" />
        <div className="flex items-center justify-center gap-2 mt-2">
          {isReplacementAnimateur && (
            <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider mr-1">
              ANIMATEUR DE REMPLACEMENT
            </span>
          )}
          <span className="text-sm text-white/60 font-medium">
            {structureType === 'structuree' && sessionPhase.currentLabel
              ? sessionPhase.currentLabel
              : 'Session en cours'}
          </span>
          <span className="text-white/40">&middot;</span>
          <VocalTimer dateVocal={dateVocal} durationMin={sessionPhase.totalDurationMin} extendedMinutes={firestoreSession?.extendedMinutes} />
          <span className="text-white/40">&middot;</span>
          <span className="text-sm text-white/60 font-medium">restantes</span>
        </div>
        {groupeTheme && (
          <p className="text-sm text-white/40 font-medium mt-1">
            Theme: {groupeTheme} &middot; {participants.length} participant{participants.length > 1 ? 's' : ''}
          </p>
        )}
        {!groupeTheme && (
          <p className="text-sm text-white/40 font-medium mt-1">
            {participants.length} participant{participants.length > 1 ? 's' : ''}
          </p>
        )}

        {/* Progress bar */}
        <SessionProgressBar
          structureType={structureType}
          structure={structure}
          phase={sessionPhase}
        />
      </div>

      {/* Animateur phase controls */}
      {isEffectiveAnimateur && structureType === 'structuree' && structure.length > 0 && (
        <AnimateurPhaseControls
          currentIndex={sessionPhase.currentIndex}
          totalPhases={structure.length}
          currentLabel={sessionPhase.currentLabel}
          phaseTimeStatus={sessionPhase.phaseTimeStatus}
          extendedMinutes={firestoreSession?.extendedMinutes ?? 0}
          onAdvancePhase={handleAdvancePhase}
          onExtendTime={handleExtendTime}
          onEndSession={handleEndSession}
        />
      )}

      <AnimatePresence>
        {machinePhase === 'COUNTDOWN_START' && (() => {
          const belowMin = machineReason === 'below_minimum';
          return (
            <AnimateurWaitOverlay
              title={belowMin ? 'Pas assez de participants'
                : machineCanPropose ? "L'animateur n'est pas là"
                : "En attente de l'animateur"}
              subtitle={belowMin
                ? (machineCountdown > 0 ? 'En attente de plus de participants...' : 'La session va être annulée')
                : machineCanPropose ? "Quelqu'un peut prendre le relais !"
                : "En attendant, vous pouvez discuter entre vous !"}
              countdownSec={machineCountdown}
              variant={belowMin ? 'danger' : machineCanPropose ? 'warning' : 'info'}
              action={machineCanPropose ? {
                label: 'Je prends le relais',
                onClick: proposeAsReplacement,
                loading: isProposing,
              } : undefined}
            />
          );
        })()}
        {machinePhase === 'SUSPENDED' && (() => {
          const belowMin = machineReason === 'below_minimum';
          return (
            <SuspensionOverlay
              title={belowMin ? 'Pas assez de participants' : 'Session suspendue'}
              subtitle={belowMin
                ? (machineCountdown > 0
                  ? "En attente de plus de participants pour continuer."
                  : "La session va être annulée.")
                : machineReason === 'animateur_left'
                  ? "L'animateur a quitté la salle. Attendons son retour."
                  : "Il n'y a pas assez de participants pour continuer."}
              countdownSec={machineCountdown}
              suspensionCount={machineSuspensionCount}
              variant={belowMin ? 'danger' : 'warning'}
              action={machineCanPropose && machineReason === 'animateur_left' ? {
                label: 'Rejoindre en tant qu\'animateur',
                onClick: proposeAsReplacement,
                loading: isProposing,
              } : undefined}
            />
          );
        })()}
      </AnimatePresence>

      {/* Circular layout */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative" style={{ width: circleRadius * 2 + 100, height: circleRadius * 2 + 100 }}>
          {/* Center: Premium Table / Hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            {/* Outer Aura */}
            {speakingName && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-[-60px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(249,168,38,0.2) 0%, transparent 60%)',
                  filter: 'blur(20px)',
                }}
              />
            )}

            {/* The "Table": Glassmorphic 3D Ring */}
            <div className="relative w-40 h-40 rounded-full flex items-center justify-center">
              {/* Outer Ring / Table Edge */}
              <div 
                className="absolute inset-0 rounded-full border-[3px] border-white/10 shadow-[inset_0_4px_30px_rgba(255,255,255,0.05),_0_8px_32px_rgba(0,0,0,0.5)]" 
                style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.2) 100%)' }}
              />

              {/* Inner Table Surface (Glass) */}
              <div className="absolute inset-3 rounded-full overflow-hidden bg-[#151932]/60 backdrop-blur-md border border-white/5 flex items-center justify-center">
                
                {/* Embedded subtle motif */}
                <div className="absolute w-28 h-28 opacity-20 bg-gradient-to-tr from-white/10 to-transparent rounded-full rotate-45 blur-[2px]" />

                {/* Center Core (Glowing sound waves) */}
                <div className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-700 ${
                  speakingName ? 'bg-orange-500/20 shadow-[0_0_30px_rgba(249,168,38,0.5)]' : 'bg-white/5 shadow-inner'
                }`}>
                  <div className={`absolute inset-0 rounded-full border transition-all duration-700 ${
                    speakingName ? 'border-orange-400/50 scale-110' : 'border-white/10 scale-100'
                  }`} />
                  
                  {/* Dynamic Sound Waves */}
                  {speakingName ? (
                     <div className="flex items-center justify-center gap-[3px] h-8 w-12">
                       {[0.4, 0.8, 0.5, 0.9, 0.6].map((h, i) => (
                         <motion.div 
                           key={i}
                           animate={{ scaleY: [h, h*2.5, h] }}
                           transition={{ repeat: Infinity, duration: 0.5 + i*0.1, ease: 'easeInOut' }}
                           className="w-1.5 bg-orange-400 rounded-full"
                           style={{ height: 10 }}
                         />
                       ))}
                     </div>
                  ) : (
                    <Mic className="text-white/20 w-8 h-8" />
                  )}
                </div>
              </div>
            </div>

            {/* Speaking label floating */}
            <AnimatePresence>
              {speakingName && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 25, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, y: 15 }}
                  className="absolute bottom-[-15px] px-5 py-2 rounded-full bg-[#111426]/90 backdrop-blur-xl border border-orange-500/40 shadow-2xl z-20"
                >
                  <p className="text-[10px] uppercase tracking-widest font-extrabold flex items-center gap-2" style={{ color: '#F9A826' }}>
                    <span className="w-2 h-2 rounded-full bg-[#F9A826] animate-pulse shadow-[0_0_10px_rgba(249,168,38,0.8)]" />
                    {speakingName === 'Vous' ? 'Vous parlez' : `${speakingName} parle`}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Participants around the circle */}
          {participants.map((p, index) => {
            const isLocal = p.identity === localParticipant?.identity;
            const pIsAnimateur = p.identity === effectiveAnimateurUid;
            const micPub = p.getTrackPublication(Track.Source.Microphone);
            const isMuted = !micPub || micPub.isMuted;
            const count = participants.length;
            const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
            const color = AVATAR_COLORS[index % AVATAR_COLORS.length];

            return (
              <CircleParticipant
                key={p.identity}
                identity={p.identity}
                name={p.name || 'Parent'}
                isSpeaking={isLocal ? localIsSpeaking : p.isSpeaking}
                isMuted={isLocal ? localMuted : isMuted}
                isAnimateur={pIsAnimateur}
                isLocal={isLocal}
                hasHandRaised={raisedHands.has(p.identity)}
                warningCount={isLocal ? localWarnings : (warningCounts[p.identity] || 0)}
                showWarningBadge={isLocal ? localWarnings > 0 : (isAnimateur && (warningCounts[p.identity] || 0) > 0)}
                angle={angle}
                radius={circleRadius}
                color={color}
                badge={participantBadges[p.identity] || 'none'}
                onTap={isEffectiveAnimateur && !isLocal ? () => setModTarget({
                  identity: p.identity,
                  name: p.name || 'Parent',
                  color,
                  isMuted: isLocal ? localMuted : isMuted,
                  hasHandRaised: raisedHands.has(p.identity),
                  warningCount: warningCounts[p.identity] || 0,
                }) : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="pb-8 pt-4 px-6">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 flex items-center justify-around">
          {/* Mute */}
          <button
            onClick={handleToggleMute}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all active:scale-90 ${
              micLocked && localMuted && !isAnimateur
                ? 'bg-gray-500/20 cursor-not-allowed'
                : localMuted ? 'bg-red-500/20' : 'bg-white/10'
            }`}
          >
            <div className="relative">
              {localMuted ? (
                <MicOff size={22} className={micLocked && !isAnimateur ? 'text-gray-400' : 'text-red-400'} />
              ) : (
                <Mic size={22} className="text-white" />
              )}
              {micLocked && !isAnimateur && (
                <Lock size={10} className="absolute -bottom-1 -right-1 text-amber-400" />
              )}
            </div>
            <span className={`text-[10px] font-bold ${
              micLocked && localMuted && !isAnimateur ? 'text-gray-400'
              : localMuted ? 'text-red-400' : 'text-white/70'
            }`}>
              {micLocked && !isAnimateur ? 'Verrouille' : 'Muet'}
            </span>
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* Chat */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all active:scale-90 ${
              showChat ? 'bg-blue-500/20' : 'bg-white/10'
            }`}
          >
            <MessageCircle size={22} className={showChat ? 'text-blue-400' : 'text-white'} />
            <span className={`text-[10px] font-bold ${showChat ? 'text-blue-400' : 'text-white/70'}`}>
              Chat
            </span>
            {/* Unread badge */}
            {chatUnread > 0 && !showChat && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">{chatUnread > 9 ? '9+' : chatUnread}</span>
              </div>
            )}
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* Raise hand */}
          <button
            onClick={handleRaiseHand}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all active:scale-90 ${
              handRaised ? 'bg-amber-500/20' : 'bg-white/10'
            }`}
          >
            <Hand size={22} className={handRaised ? 'text-amber-400' : 'text-white'} />
            <span className={`text-[10px] font-bold ${handRaised ? 'text-amber-400' : 'text-white/70'}`}>
              Parole
            </span>
          </button>

          <div className="w-px h-8 bg-white/10" />

          {/* Suggestions (animateur only) */}
          {isAnimateur && (
            <>
              <button
                onClick={() => { setShowNotes(!showNotes); setNotesPulse(false); }}
                className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all active:scale-90 ${
                  showNotes ? 'bg-violet-500/20' : 'bg-white/10'
                }`}
              >
                <Lightbulb size={22} className={showNotes ? 'text-violet-400' : 'text-white'} />
                <span className={`text-[10px] font-bold ${showNotes ? 'text-violet-400' : 'text-white/70'}`}>
                  Aide
                </span>
                {/* Pulse badge on phase change */}
                {notesPulse && !showNotes && (
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    className="absolute -top-1 -right-1 w-3 h-3 bg-violet-500 rounded-full"
                  />
                )}
              </button>
              <div className="w-px h-8 bg-white/10" />
            </>
          )}

          {/* Quitter */}
          <button
            onClick={() => {
              // Skip confirmation si session presque finie (<2 min)
              const remaining = sessionPhase.totalDurationMin - sessionPhase.elapsedMin;
              if (remaining < 2) {
                onLeave();
              } else {
                setShowLeaveConfirm(true);
              }
            }}
            className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-white/10 transition-all active:scale-90"
          >
            <LogOut size={22} className="text-white/60" />
            <span className="text-[10px] font-bold text-white/60">Quitter</span>
          </button>
        </div>
      </div>

      {/* Suggestions panel (animateur) */}
      <AnimatePresence>
        {showNotes && isAnimateur && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col bg-[#12152a]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10"
            style={{ height: '55%' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Lightbulb size={16} className="text-violet-400" />
                Aide animateur
              </h3>
              <button onClick={() => setShowNotes(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90">
                <X size={16} className="text-white/60" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Current phase badge */}
              {structureType === 'structuree' && sessionPhase.currentLabel && (
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-violet-500/20 rounded-full">
                    <span className="text-[11px] font-bold text-violet-300">
                      Phase {sessionPhase.currentIndex + 1}/{structure.length} — {sessionPhase.currentLabel}
                    </span>
                  </div>
                </div>
              )}

              {/* Contextual suggestions */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={sessionPhase.currentIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  {currentSuggestions?.tips.map((tip, i) => (
                    <div key={i} className="bg-violet-500/10 rounded-xl p-3 flex gap-2.5">
                      <Lightbulb size={14} className="text-violet-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-white/80 font-medium leading-relaxed">{tip}</p>
                    </div>
                  ))}

                  {/* Suggested question */}
                  {currentSuggestions?.question && (
                    <div className="bg-orange-500/10 rounded-xl p-3 flex gap-2.5">
                      <span className="text-orange-400 shrink-0 font-bold text-sm">?</span>
                      <p className="text-xs text-white/80 font-medium leading-relaxed italic">
                        "{currentSuggestions.question}"
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Toggle to see all original AI notes */}
              {animateurNotes && (
                <div>
                  <button
                    onClick={() => setShowAllNotes(!showAllNotes)}
                    className="text-[11px] font-bold text-violet-400/60 hover:text-violet-400 transition-colors"
                  >
                    {showAllNotes ? 'Masquer les notes completes' : 'Voir toutes les notes'}
                  </button>

                  <AnimatePresence>
                    {showAllNotes && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-2 space-y-3"
                      >
                        {animateurNotes.introduction && (
                          <div>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">Introduction</p>
                            <p className="text-xs text-white/70 font-medium leading-relaxed italic">"{animateurNotes.introduction}"</p>
                          </div>
                        )}
                        {animateurNotes.structure.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">Structure</p>
                            <div className="space-y-1">
                              {animateurNotes.structure.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="w-5 h-5 bg-violet-500/20 rounded-full flex items-center justify-center shrink-0">
                                    <span className="text-[10px] font-bold text-violet-400">{i + 1}</span>
                                  </div>
                                  <p className="text-xs text-white/70 font-medium">{s}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {animateurNotes.questions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">Questions</p>
                            <ul className="space-y-1">
                              {animateurNotes.questions.map((q, i) => (
                                <li key={i} className="text-xs text-white/70 font-medium flex gap-1.5">
                                  <span className="text-violet-400 shrink-0">&bull;</span>
                                  {q}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel overlay */}
      <AnimatePresence>
        {showChat && (
          <ChatPanel
            messages={vocalChatMessages}
            onSend={handleSendChatMessage}
            onClose={() => setShowChat(false)}
          />
        )}
      </AnimatePresence>

      {/* Moderator bottom sheet */}
      <AnimatePresence>
        {modTarget && (
          <ModeratorSheet
            target={modTarget}
            onClose={() => setModTarget(null)}
            onGiveWord={handleGiveWord}
            onMute={handleMuteParticipant}
            onWarn={handleWarnParticipant}
            onKick={handleKickParticipant}
          />
        )}
      </AnimatePresence>

      {/* Phase transition toast */}
      <AnimatePresence>
        {phaseToast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="absolute top-4 left-4 right-4 z-50 bg-violet-500/90 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl"
          >
            <Lightbulb size={18} className="text-white shrink-0" />
            <p className="text-sm font-bold text-white flex-1">{phaseToast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warning / info toast */}
      <AnimatePresence>
        {warnToast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="absolute top-4 left-4 right-4 z-50 bg-amber-500/90 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl"
          >
            <AlertTriangle size={20} className="text-white shrink-0" />
            <p className="text-sm font-bold text-white flex-1">{warnToast}</p>
            <button onClick={() => setWarnToast(null)} className="active:scale-90">
              <X size={16} className="text-white/70" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave confirmation bottom sheet */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLeaveConfirm(false)}
              className="absolute inset-0 bg-black/40 z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-50 bg-[#1e2340] rounded-t-3xl p-6 pb-8"
            >
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-white text-center mb-2">
                Quitter la session ?
              </p>
              <p className="text-sm text-white/50 text-center mb-6">
                Pas de souci ! Vous pouvez revenir dans les prochaines minutes si vous changez d'avis.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-orange-500 text-white font-bold text-sm active:scale-95 transition-transform"
                >
                  Rester
                </button>
                <button
                  onClick={() => { setShowLeaveConfirm(false); onLeave(); }}
                  className="flex-1 py-3 rounded-2xl bg-white/10 text-white/70 font-bold text-sm active:scale-95 transition-transform"
                >
                  Quitter
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// ========== Mic Test with Audio Level ==========
const MicTest: React.FC = () => {
  const [micOk, setMicOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [micError, setMicError] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [soundDetected, setSoundDetected] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    let analyser: AnalyserNode | null = null;
    let audioCtx: AudioContext | null = null;

    const startMicTest = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setMicOk(true);
        setChecking(false);

        // Setup audio analysis for level meter
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          // Average volume
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const normalized = Math.min(avg / 80, 1); // normalize to 0-1
          setAudioLevel(normalized);
          if (normalized > 0.1) setSoundDetected(true);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };

        updateLevel();
      } catch {
        setMicOk(false);
        setMicError(true);
        setChecking(false);
      }
    };

    startMicTest();

    return () => {
      // Cleanup
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close();
    };
  }, []);

  // Level bar segments (8 bars)
  const bars = 8;

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          checking ? 'bg-white/10' : micOk ? (soundDetected ? 'bg-emerald-500/20' : 'bg-amber-500/20') : 'bg-red-500/20'
        }`}>
          {checking ? (
            <Loader2 size={18} className="text-white/40 animate-spin" />
          ) : micOk ? (
            soundDetected ? (
              <CheckCircle2 size={18} className="text-emerald-400" />
            ) : (
              <Mic size={18} className="text-amber-400" />
            )
          ) : (
            <MicOff size={18} className="text-red-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${
            checking ? 'text-white/40' : micOk ? (soundDetected ? 'text-emerald-400' : 'text-white') : 'text-red-400'
          }`}>
            {checking
              ? 'Verification du micro...'
              : micError
              ? 'Micro non disponible'
              : soundDetected
              ? 'Micro fonctionne !'
              : 'Parlez pour tester...'}
          </p>
          {micError && (
            <p className="text-[11px] text-red-300/60 font-medium">Autorisez l'acces au micro</p>
          )}

          {/* Audio level bar */}
          {micOk && !checking && (
            <div className="flex items-center gap-[3px] mt-2">
              {Array.from({ length: bars }).map((_, i) => {
                const threshold = (i + 1) / bars;
                const active = audioLevel >= threshold;
                const color = i < 4 ? 'bg-emerald-400' : i < 6 ? 'bg-amber-400' : 'bg-red-400';
                return (
                  <div
                    key={i}
                    className={`h-3 flex-1 rounded-sm transition-all duration-75 ${
                      active ? color : 'bg-white/10'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ========== Waiting Room ==========
const WaitingRoom: React.FC<{
  groupeId: string;
  groupeTitre: string;
  groupeTheme?: string;
  dateVocal: Date;
  isTestGroup: boolean;
  participants: ParticipantGroupe[];
  createurUid: string;
  structureType?: 'libre' | 'structuree';
  structure?: StructureEtape[];
  sessionPrenom: string;
  onEnter: () => void;
  onBack: () => void;
}> = ({ groupeId, groupeTitre, groupeTheme, dateVocal, isTestGroup, participants, createurUid, structureType, structure, sessionPrenom, onEnter, onBack }) => {
  const currentUser = auth.currentUser;
  const [countdown, setCountdown] = useState('');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [remotePresences, setRemotePresences] = useState<{uid:string, pseudo:string, status?:string, mood?:string}[]>([]);
  // For test group: fake 15min countdown starting from now
  const [testStartTime] = useState(() => new Date(Date.now() + 15 * 60 * 1000));

  useEffect(() => {
    return onPresenceList(groupeId, (list) => {
      // Only keep OTHER users with status 'waiting' (not self — self is always shown locally)
      const uid = currentUser?.uid;
      setRemotePresences(
        list.filter(p => p.uid !== uid && (!p.status || p.status === 'waiting'))
      );
    });
  }, [groupeId, currentUser?.uid]);

  // Build the FINAL display list: current user (guaranteed) + remote presences
  const displayPresences = useMemo(() => {
    const me = currentUser ? {
      uid: currentUser.uid,
      pseudo: sessionPrenom || currentUser.displayName || 'Parent',
      isMe: true as const,
    } : null;
    
    const others = remotePresences.map(p => ({
      ...p,
      isMe: false as const,
    }));
    
    return me ? [me, ...others] : others;
  }, [currentUser, sessionPrenom, remotePresences]);

  // Countdown to session start
  useEffect(() => {
    const targetTime = isTestGroup ? testStartTime : dateVocal;

    const update = () => {
      const now = Date.now();
      const diff = targetTime.getTime() - now;

      if (diff <= 0) {
        setCountdown('00:00');
        setSessionStarted(true);
        return;
      }

      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
      setSessionStarted(false);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [dateVocal, isTestGroup, testStartTime]);

  const animateurPresent = participants.some((p) => p.uid === createurUid);
  const isAnimateur = currentUser?.uid === createurUid;

  return (
    <div
      className="h-screen flex flex-col items-center px-6 pt-12 pb-8 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #2a3060 0%, #1a1f3a 50%, #12152a 100%)',
      }}
    >
      {/* Logo */}
      <img src="/app-icon.png" alt="Parent'aile" className="w-20 h-20 rounded-full shadow-xl mb-4" />

      <h2 className="text-xl font-extrabold text-white">{groupeTitre}</h2>
      {groupeTheme && (
        <p className="text-sm text-white/40 font-medium mt-1">Theme: {groupeTheme}</p>
      )}

      <div className="w-16 h-[2px] bg-gradient-to-r from-transparent via-orange-400 to-transparent mx-auto mt-3 mb-4" />

      {/* Countdown or Enter button */}
      {sessionStarted || isTestGroup ? (
        <button
          onClick={onEnter}
          className="mb-5 px-10 py-4 rounded-2xl font-extrabold text-base shadow-xl active:scale-95 transition-all bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/30 animate-pulse"
        >
          {isAnimateur ? '🎙️ Lancer la session' : '🎙️ Entrer dans la salle'}
        </button>
      ) : (
        <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 flex flex-col items-center mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-orange-400" />
            <p className="text-sm font-medium text-white/60">La session commence dans</p>
          </div>
          <p className="text-3xl font-mono font-extrabold text-white tracking-wider">{countdown}</p>
        </div>
      )}

      {/* Status cards */}
      <div className="w-full max-w-sm space-y-3">
        {/* Participants */}
        <div className="bg-white/10 backdrop-blur-md border border-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center shrink-0">
              <Users size={18} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                {participants.length} participant{participants.length > 1 ? 's' : ''} inscrit{participants.length > 1 ? 's' : ''}
              </p>
              <p className="text-[11px] text-white/40 font-medium truncate">
                Inscrits de la premiere heure et arrivants
              </p>
            </div>
          </div>
          
          <div className="w-full h-px bg-white/5 my-3" />

          {/* Inscrits au groupe */}
          <p className="text-[10px] uppercase tracking-wider font-extrabold text-white/30 mb-2 px-1">
            Inscrits :
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {participants.map((p) => {
              const presentUids = displayPresences.map(dp => dp.uid);
              const isPresent = presentUids.includes(p.uid);
              const isMe = p.uid === currentUser?.uid;
              const displayName = p.pseudo || 'Parent';
              const nameInitial = displayName.charAt(0).toUpperCase();
              const hash = p.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
              const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
              return (
                <div
                  key={p.uid}
                  className={`flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 border ${
                    isMe ? 'bg-orange-500/15 border-orange-400/30' :
                    isPresent ? 'bg-white/5 border-white/10' :
                    'bg-white/[0.03] border-white/5'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${!isPresent && !isMe ? 'opacity-40' : ''}`}
                      style={{ backgroundColor: color }}
                    >
                      {nameInitial}
                    </div>
                    {isPresent && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#1a1f3a] shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
                    )}
                  </div>
                  <span className={`text-[11px] font-medium ${
                    isMe ? 'text-orange-300' :
                    isPresent ? 'text-white/80' :
                    'text-white/30'
                  }`}>
                    {displayName}{isMe ? ' (vous)' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Micro test */}
        <MicTest />

        {/* Animateur status */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            animateurPresent || isAnimateur ? 'bg-amber-500/20' : 'bg-white/10'
          }`}>
            <Crown size={18} className={animateurPresent || isAnimateur ? 'text-amber-400' : 'text-white/30'} />
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${animateurPresent || isAnimateur ? 'text-white' : 'text-white/40'}`}>
              {isAnimateur
                ? 'Vous etes l\'animateur'
                : animateurPresent
                ? 'Animateur present'
                : 'En attente de l\'animateur...'}
            </p>
          </div>
        </div>

        {/* Mini-briefing : structure de la session */}
        {structureType === 'structuree' && structure && structure.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
            <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Programme</p>
            <div className="space-y-2">
              {structure.map((phase, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-white/80 font-medium flex-1">{phase.label}</span>
                  <span className="text-xs text-white/40 font-medium">{phase.dureeMinutes} min</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-white/10 text-right">
              <span className="text-xs text-orange-400 font-bold">
                Total : {structure.reduce((s, p) => s + p.dureeMinutes, 0)} min
              </span>
            </div>
          </div>
        )}

        {/* Mood selector : humeur du jour */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
          <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Votre humeur</p>
          <div className="flex justify-center gap-3">
            {['😊', '😐', '😔', '💪', '🤗'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  const uid = auth.currentUser?.uid;
                  if (uid && groupeId) {
                    setPresence(groupeId, uid, { mood: emoji, pseudo: sessionPrenom || auth.currentUser?.displayName || 'Parent' }).catch(() => {});
                  }
                }}
                className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl hover:bg-white/20 active:scale-90 transition-all"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={onBack}
        className="mt-6 text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
      >
        Retour
      </button>
    </div>
  );
};

// ========== Écran 1 — Charte & Cadre ==========
const CharteScreen: React.FC<{
  onContinue: () => void;
  onBack: () => void;
}> = ({ onContinue, onBack }) => {
  const [skipNext, setSkipNext] = useState(false);
  const currentUser = auth.currentUser;

  const handleContinue = async () => {
    if (skipNext && currentUser) {
      try {
        const { updateDoc: ud, doc: d } = await import('firebase/firestore');
        await ud(d(db, 'accounts', currentUser.uid), { skipCharte: true });
      } catch { /* ignore */ }
    }
    onContinue();
  };

  const items = [
    { icon: '💛', title: 'Bienveillance', text: 'Ici, on ecoute sans juger. Chaque parent a le droit de s\'exprimer librement.' },
    { icon: '🤫', title: 'Confidentialite', text: 'Ce qui se dit dans le groupe reste dans le groupe. Rien ne sera partage a l\'exterieur.' },
    { icon: '🔒', title: 'Pas d\'enregistrement', text: 'Le vocal n\'est pas enregistre. Rien n\'est stocke dans le cloud.' },
    { icon: '💨', title: 'Ephemere', text: 'Les echanges vocaux disparaissent a la fin de la session. Vous repartez uniquement avec ce que vous avez retenu.' },
  ];

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pt-10 pb-6">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src="/app-icon.png" alt="Parent'aile" className="w-16 h-16 rounded-full shadow-lg" />
        </div>

        <h2 className="text-xl font-extrabold text-gray-800 text-center">Avant d'entrer</h2>
        <p className="text-sm text-gray-400 text-center font-medium mt-1 mb-6">
          Quelques engagements pour un echange en confiance
        </p>

        {/* Charte items */}
        <div className="space-y-3 max-w-sm mx-auto">
          {items.map((item) => (
            <div key={item.title} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-3">
              <span className="text-2xl shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-extrabold text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500 font-medium mt-0.5 leading-relaxed">{item.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Skip toggle */}
        <label className="flex items-center gap-3 max-w-sm mx-auto mt-6 cursor-pointer">
          <div
            onClick={() => setSkipNext(!skipNext)}
            className={`w-10 h-6 rounded-full transition-colors relative ${skipNext ? 'bg-orange-400' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${skipNext ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs text-gray-400 font-medium">Ne plus afficher a l'avenir</span>
        </label>
      </div>

      {/* Bottom */}
      <div className="px-6 pb-8 pt-4">
        <button
          onClick={handleContinue}
          className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-extrabold text-base shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all"
        >
          J'ai compris, continuer
        </button>
        <button
          onClick={onBack}
          className="w-full mt-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          Retour
        </button>
      </div>
    </div>
  );
};

// ========== Écran 2 — Choix du prénom ==========
const PrenomScreen: React.FC<{
  defaultName: string;
  onContinue: (prenom: string) => void;
  onBack: () => void;
}> = ({ defaultName, onContinue, onBack }) => {
  const [prenom, setPrenom] = useState(defaultName);
  const [error, setError] = useState('');

  const handleContinue = () => {
    const trimmed = prenom.trim();
    if (trimmed.length < 2) {
      setError('2 caracteres minimum');
      return;
    }
    if (/[^a-zA-ZÀ-ÿ\s\-']/.test(trimmed)) {
      setError('Uniquement des lettres');
      return;
    }
    onContinue(trimmed);
  };

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-6">
      <img src="/app-icon.png" alt="Parent'aile" className="w-16 h-16 rounded-full shadow-lg mb-6" />

      <h2 className="text-xl font-extrabold text-gray-800 text-center">
        Comment souhaitez-vous etre appele(e) ?
      </h2>
      <p className="text-sm text-gray-400 text-center font-medium mt-2 mb-8 max-w-xs leading-relaxed">
        Idealement votre prenom. Un surnom est accepte s'il reste adapte a un groupe de parole.
      </p>

      <input
        type="text"
        value={prenom}
        onChange={(e) => { setPrenom(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleContinue(); }}
        placeholder="Votre prenom"
        className="w-full max-w-xs px-5 py-4 bg-white border-2 border-gray-200 rounded-2xl text-center text-base font-bold text-gray-700 outline-none focus:border-orange-400 transition-colors placeholder:text-gray-300 shadow-sm"
        autoFocus
      />
      {error && <p className="text-xs font-bold text-red-500 mt-2">{error}</p>}

      {defaultName && (
        <button
          onClick={() => onContinue(defaultName)}
          className="mt-4 text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
        >
          Continuer en tant que "{defaultName}"
        </button>
      )}

      <button
        onClick={handleContinue}
        disabled={prenom.trim().length < 2}
        className="mt-6 px-10 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-extrabold text-base shadow-xl shadow-orange-500/20 disabled:opacity-40 active:scale-[0.98] transition-all"
      >
        Continuer
      </button>
      <button
        onClick={onBack}
        className="mt-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
      >
        Retour
      </button>
    </div>
  );
};

// ========== Écran 2b — Préparation animateur ==========
interface AnimateurNotes {
  introduction: string;
  structure: string[];
  questions: string[];
}

const PrepAnimateurScreen: React.FC<{
  defaultName: string;
  groupeTitre: string;
  groupeTheme?: string;
  groupeDescription: string;
  participantsCount: number;
  onContinue: (prenom: string, notes: AnimateurNotes | null) => void;
  onBack: () => void;
}> = ({ defaultName, groupeTitre, groupeTheme, groupeDescription, participantsCount, onContinue, onBack }) => {
  const [prenom, setPrenom] = useState(defaultName);
  const [prenomError, setPrenomError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotes, setAiNotes] = useState<AnimateurNotes | null>(null);
  const [aiError, setAiError] = useState('');

  const handleRequestAI = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/.netlify/functions/prepareAnimateur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: groupeTitre,
          theme: groupeTheme || 'libre',
          intention: groupeDescription,
        }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      const data = await res.json();
      setAiNotes({
        introduction: data.introduction || '',
        structure: data.structure || [],
        questions: data.questions || [],
      });
      setShowAI(true);
    } catch {
      setAiError('Erreur lors de la preparation. Reessayez.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleContinue = () => {
    const trimmed = prenom.trim();
    if (trimmed.length < 2) {
      setPrenomError('2 caracteres minimum');
      return;
    }
    if (/[^a-zA-ZÀ-ÿ\s\-']/.test(trimmed)) {
      setPrenomError('Uniquement des lettres');
      return;
    }
    onContinue(trimmed, aiNotes);
  };

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-6">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center shadow-sm">
            <Crown size={24} className="text-amber-600" />
          </div>
        </div>

        <h2 className="text-xl font-extrabold text-gray-800 text-center">Preparation animateur</h2>
        <p className="text-sm text-gray-400 text-center font-medium mt-1 mb-5">Preparez votre session</p>

        {/* Prenom */}
        <div className="max-w-sm mx-auto mb-5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Votre prenom affiche</label>
          <input
            type="text"
            value={prenom}
            onChange={(e) => { setPrenom(e.target.value); setPrenomError(''); }}
            placeholder="Votre prenom"
            className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-700 outline-none focus:border-orange-400 transition-colors placeholder:text-gray-300"
          />
          {prenomError && <p className="text-xs font-bold text-red-500 mt-1">{prenomError}</p>}
        </div>

        {/* Group recap */}
        <div className="max-w-sm mx-auto mb-5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Rappel de votre groupe</label>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-gray-800">{groupeTitre}</p>
              <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full">
                {participantsCount} inscrit{participantsCount > 1 ? 's' : ''}
              </span>
            </div>
            {groupeTheme && (
              <p className="text-xs text-gray-400 font-medium">Theme : {groupeTheme}</p>
            )}
            {groupeDescription && (
              <p className="text-xs text-gray-500 font-medium leading-relaxed border-t border-gray-50 pt-2 mt-2">
                "{groupeDescription}"
              </p>
            )}
          </div>
        </div>

        {/* AI help */}
        <div className="max-w-sm mx-auto">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Aide a la preparation (facultatif)</label>

          {!showAI && !aiNotes && (
            <button
              onClick={handleRequestAI}
              disabled={aiLoading}
              className="w-full py-3 bg-white border-2 border-dashed border-orange-200 rounded-2xl text-sm font-bold text-orange-500 hover:border-orange-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {aiLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Preparation en cours...
                </>
              ) : (
                <>
                  <span className="text-lg">✨</span>
                  Preparer mon introduction avec l'IA
                </>
              )}
            </button>
          )}
          {aiError && <p className="text-xs font-bold text-red-500 mt-2">{aiError}</p>}

          {/* AI result */}
          {aiNotes && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 space-y-4 mt-2">
              {/* Introduction */}
              <div>
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Introduction suggeree</p>
                <p className="text-xs text-gray-600 font-medium leading-relaxed italic">"{aiNotes.introduction}"</p>
              </div>

              {/* Structure */}
              {aiNotes.structure.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Structure proposee</p>
                  <div className="space-y-1">
                    {aiNotes.structure.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-orange-600">{i + 1}</span>
                        </div>
                        <p className="text-xs text-gray-600 font-medium">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Questions */}
              {aiNotes.questions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Questions pour lancer le groupe</p>
                  <ul className="space-y-1">
                    {aiNotes.questions.map((q, i) => (
                      <li key={i} className="text-xs text-gray-600 font-medium flex gap-1.5">
                        <span className="text-orange-400 shrink-0">•</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Regenerate */}
              <button
                onClick={handleRequestAI}
                disabled={aiLoading}
                className="text-[11px] font-bold text-orange-400 hover:text-orange-500 transition-colors flex items-center gap-1"
              >
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <span>↻</span>}
                Regenerer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="px-6 pb-8 pt-4 border-t border-gray-100">
        <button
          onClick={handleContinue}
          disabled={prenom.trim().length < 2}
          className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-extrabold text-base shadow-xl shadow-orange-500/20 disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          Continuer vers la salle
        </button>
        <button
          onClick={onBack}
          className="w-full mt-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          Retour
        </button>
      </div>
    </div>
  );
};

// ========== Too Early Screen ==========
const TooEarlyScreen: React.FC<{
  groupeTitre: string;
  participantsCount: number;
  dateVocal: Date;
  onBack: () => void;
}> = ({ groupeTitre, participantsCount, dateVocal, onBack }) => (
  <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-6 text-center">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 20 }}
      className="flex flex-col items-center w-full"
    >
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
        <Clock size={36} className="text-blue-400" />
      </div>

      <h2 className="text-xl font-extrabold text-gray-800">Encore un peu de patience...</h2>
      <p className="text-sm text-gray-500 font-medium mt-3 max-w-xs leading-relaxed">
        La salle d'attente pour "{groupeTitre}" ouvrira 15 minutes avant le debut de la session.
      </p>
      <p className="text-sm font-bold text-gray-700 mt-2">
        ({dateVocal.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
      </p>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 w-full max-w-xs mt-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
            <Users size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-base font-extrabold text-gray-800">
              {participantsCount} inscrit{participantsCount > 1 ? 's' : ''}
            </p>
            <p className="text-[11px] text-gray-400 font-medium truncate">
              Actuellement
            </p>
          </div>
        </div>
        
        {participantsCount < 3 && (
          <div className="mt-4 bg-red-50 p-3 rounded-xl border border-red-100 flex items-start text-left gap-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium text-red-600 leading-relaxed">
              S'il n'y a pas assez de monde (min. 3) au moment de l'ouverture de la salle, le groupe risque d'etre annule automatiquement.
            </p>
          </div>
        )}
      </div>

      <div className="mt-10 w-full max-w-xs">
        <button
          onClick={onBack}
          className="w-full py-4 bg-gray-200 text-gray-600 rounded-2xl font-extrabold text-base active:scale-[0.98] transition-all"
        >
          Retour a mon espace
        </button>
      </div>
    </motion.div>
  </div>
);

// ========== Flow steps ==========
type FlowStep = 'loading' | 'too_early' | 'password' | 'charte' | 'prenom' | 'waiting' | 'room' | 'reconnecting' | 'end' | 'evaluation';

// ========== Heart Rating ==========
const HeartRating: React.FC<{
  value: number;
  onChange: (v: number) => void;
  label: string;
}> = ({ value, onChange, label }) => (
  <div className="space-y-2">
    <p className="text-sm font-bold text-gray-700">{label}</p>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="active:scale-90 transition-transform"
        >
          <Heart
            size={32}
            className={`transition-colors ${
              n <= value
                ? 'text-orange-400 fill-orange-400'
                : 'text-gray-200'
            }`}
          />
        </button>
      ))}
    </div>
  </div>
);

// ========== End Screen (Thank you) ==========
const EndScreen: React.FC<{
  groupeTitre: string;
  canEvaluate: boolean;
  onEvaluate: () => void;
  onLater: () => void;
}> = ({ groupeTitre, canEvaluate, onEvaluate, onLater }) => (
  <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-6 text-center">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 20 }}
      className="flex flex-col items-center"
    >
      <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-6">
        <Heart size={36} className="text-orange-400 fill-orange-400" />
      </div>

      <h2 className="text-2xl font-extrabold text-gray-800">
        {canEvaluate ? "Merci d'avoir ete la" : "A bientot !"}
      </h2>
      <p className="text-sm text-gray-400 font-medium mt-3 max-w-xs leading-relaxed">
        {canEvaluate
          ? `Votre presence dans "${groupeTitre}" compte. Chaque echange fait avancer les choses.`
          : `Vous avez quitte "${groupeTitre}" avant la fin. L'evaluation est reservee aux participants qui restent jusqu'au bout.`
        }
      </p>

      <div className="mt-10 w-full max-w-xs space-y-3">
        {canEvaluate ? (
          <>
            <button
              onClick={onEvaluate}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-extrabold text-base shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all"
            >
              Donner mon avis (+5 pts)
            </button>

            <button
              onClick={onLater}
              className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
            >
              Plus tard
            </button>

            <p className="mt-6 text-[11px] text-gray-300 font-medium max-w-[200px]">
              Vous pourrez retrouver cette evaluation depuis votre espace personnel
            </p>
          </>
        ) : (
          <button
            onClick={onLater}
            className="w-full py-4 bg-gray-200 text-gray-600 rounded-2xl font-extrabold text-base active:scale-[0.98] transition-all"
          >
            Retour a l'espace
          </button>
        )}
      </div>
    </motion.div>
  </div>
);

// ========== Evaluation Screen ==========
const EvaluationScreen: React.FC<{
  groupeId: string;
  groupeTitre: string;
  participants: ParticipantGroupe[];
  onDone: () => void;
  onBack: () => void;
}> = ({ groupeId, groupeTitre, participants, onDone, onBack }) => {
  const currentUser = auth.currentUser;
  const [noteAmbiance, setNoteAmbiance] = useState(0);
  const [noteTheme, setNoteTheme] = useState(0);
  const [noteTechnique, setNoteTechnique] = useState(0);
  const [ressenti, setRessenti] = useState('');
  const [showSignalement, setShowSignalement] = useState(false);
  const [signalementUid, setSignalementUid] = useState('');
  const [signalementText, setSignalementText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const otherParticipants = participants.filter((p) => p.uid !== currentUser?.uid);

  const canSubmit = noteAmbiance > 0 && noteTheme > 0 && noteTechnique > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser || submitting) return;
    setSubmitting(true);
    try {
      await submitEvaluation({
        groupeId,
        participantUid: currentUser.uid,
        participantPseudo: currentUser.displayName || 'Parent',
        noteAmbiance,
        noteTheme,
        noteTechnique,
        ressenti: ressenti.trim() || undefined,
        signalement: showSignalement && signalementUid && signalementText.trim()
          ? {
              participantUid: signalementUid,
              participantPseudo: otherParticipants.find((p) => p.uid === signalementUid)?.pseudo || '',
              description: signalementText.trim(),
            }
          : undefined,
      });
      // Bonus +5 pts for giving an evaluation
      await addPoints(currentUser.uid, 5, {
        groupeId,
        groupeTitre,
        date: new Date(),
        type: 'participation',
      }).catch(() => {});
      setSubmitted(true);
      setTimeout(onDone, 2000);
    } catch (err) {
      console.error('Erreur evaluation:', err);
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="flex flex-col items-center"
        >
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h2 className="text-xl font-extrabold text-gray-800">Merci pour votre avis !</h2>
          <p className="text-sm text-gray-400 font-medium mt-2">
            Votre retour nous aide a ameliorer l'experience pour tous les parents.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-6">
        {/* Header */}
        <div className="flex justify-center mb-4">
          <img src="/app-icon.png" alt="Parent'aile" className="w-14 h-14 rounded-full shadow-lg" />
        </div>
        <h2 className="text-xl font-extrabold text-gray-800 text-center">Votre avis compte</h2>
        <p className="text-sm text-gray-400 text-center font-medium mt-1 mb-6">
          Quelques secondes pour ameliorer l'experience
        </p>

        <div className="max-w-sm mx-auto space-y-6">
          {/* Note ambiance */}
          <HeartRating
            value={noteAmbiance}
            onChange={setNoteAmbiance}
            label="L'ambiance du groupe"
          />

          {/* Note theme */}
          <HeartRating
            value={noteTheme}
            onChange={setNoteTheme}
            label="Le theme aborde"
          />

          {/* Note technique */}
          <HeartRating
            value={noteTechnique}
            onChange={setNoteTechnique}
            label="L'experience technique (audio, ergonomie)"
          />

          {/* Ressenti libre */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700">Un mot, un ressenti ? <span className="text-gray-300 font-normal">(facultatif)</span></p>
            <textarea
              value={ressenti}
              onChange={(e) => setRessenti(e.target.value)}
              placeholder="Ce qui vous a plu, ce qu'on pourrait ameliorer..."
              rows={3}
              className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-700 outline-none focus:border-orange-400 transition-colors placeholder:text-gray-300 resize-none"
            />
          </div>

          {/* Signalement */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowSignalement(!showSignalement)}
              className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronDown size={14} className={`transition-transform ${showSignalement ? 'rotate-180' : ''}`} />
              Signaler un comportement inadapte
            </button>

            <AnimatePresence>
              {showSignalement && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-3"
                >
                  <div className="bg-orange-50 rounded-2xl p-3 border border-orange-100">
                    <p className="text-[11px] text-orange-600 font-medium leading-relaxed">
                      Ce signalement est confidentiel. Il sera transmis uniquement a l'equipe Parent'aile pour garantir un espace securise.
                    </p>
                  </div>

                  {/* Participant selection */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500">Quel participant ?</p>
                    <div className="flex flex-wrap gap-2">
                      {otherParticipants.map((p) => (
                        <button
                          key={p.uid}
                          type="button"
                          onClick={() => setSignalementUid(p.uid === signalementUid ? '' : p.uid)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            signalementUid === p.uid
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {p.pseudo}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  {signalementUid && (
                    <textarea
                      value={signalementText}
                      onChange={(e) => setSignalementText(e.target.value)}
                      placeholder="Decrivez brievement la situation..."
                      rows={2}
                      className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-700 outline-none focus:border-orange-400 transition-colors placeholder:text-gray-300 resize-none"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="px-6 pb-8 pt-4 border-t border-gray-100">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-extrabold text-base shadow-xl shadow-orange-500/20 disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 size={18} className="animate-spin" /> Envoi...</>
          ) : (
            'Envoyer mon avis'
          )}
        </button>
        <button
          onClick={onBack}
          className="w-full mt-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          Retour
        </button>
      </div>
    </div>
  );
};

// ========== Main Page ==========
export const SalleVocalePage = () => {
  const { groupeId } = useParams<{ groupeId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEvalDirect = searchParams.get('eval') === 'true';

  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string>('');
  const [isAnimateur, setIsAnimateur] = useState(false);
  const [groupeTitre, setGroupeTitre] = useState('');
  const [groupeTheme, setGroupeTheme] = useState<string | undefined>();
  const [groupeDescription, setGroupeDescription] = useState('');
  const [dateVocal, setDateVocal] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [groupeParticipants, setGroupeParticipants] = useState<ParticipantGroupe[]>([]);
  const [createurUid, setCreateurUid] = useState('');
  const [isTestGroup, setIsTestGroup] = useState(false);
  const [structureType, setStructureType] = useState<'libre' | 'structuree'>('libre');
  const [structure, setStructure] = useState<StructureEtape[]>([]);
  const [customDurationMin, setCustomDurationMin] = useState<number | undefined>(undefined);
  const [groupeStatus, setGroupeStatus] = useState<'scheduled'|'cancelled'|'in_progress'|'completed'>('scheduled');

  // Flow state
  const [step, setStep] = useState<FlowStep | 'cancelled'>('loading');
  const [connectingToRoom, setConnectingToRoom] = useState(false);

  // Auto-redirect to cancellation screen when group is cancelled (real-time from Firestore)
  useEffect(() => {
    if (groupeStatus === 'cancelled' && step !== 'cancelled' && step !== 'loading') {
      setStep('cancelled');
    }
  }, [groupeStatus, step]);

  // Session data
  const [sessionPrenom, setSessionPrenom] = useState('');
  const [animateurNotes, setAnimateurNotes] = useState<AnimateurNotes | null>(null);

  // Password prompt state
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [connectingAfterPassword, setConnectingAfterPassword] = useState(false);
  const [passwordValidated, setPasswordValidated] = useState(false);

  // Connect to LiveKit
  const connectToRoom = async (password?: string) => {
    const result = await getLiveKitToken(groupeId!, password);
    setToken(result.token);
    setWsUrl(result.wsUrl);
    setIsAnimateur(result.isAnimateur);
  };

  // Load group info + check skipCharte
  useEffect(() => {
    if (!groupeId) return;

    const init = async () => {
      try {
        const groupeSnap = await getDoc(doc(db, 'groupes', groupeId));
        if (groupeSnap.exists()) {
          const data = groupeSnap.data();
          setGroupeTitre(data.titre || '');
          setGroupeTheme(data.theme || data.categorie || undefined);
          setGroupeDescription(data.description || '');
          setDateVocal(data.dateVocal?.toDate?.() || new Date());
          setCreateurUid(data.createurUid || '');
          setIsTestGroup(!!data.isTestGroup);
          setStructureType(data.structureType || 'libre');
          setStructure(
            data.structureType === 'structuree'
              ? (data.structure || STRUCTURE_DEFAUT)
              : []
          );
          if (data.durationMin) setCustomDurationMin(data.durationMin);
          setGroupeParticipants(
            (data.participants || []).map((p: any) => ({
              uid: p.uid || '',
              pseudo: p.pseudo || '',
              inscritVocal: p.inscritVocal ?? true,
              dateInscription: p.dateInscription?.toDate?.() || new Date(),
            }))
          );
          setGroupeStatus(data.status || 'scheduled');

          if (data.status === 'cancelled') {
             setStep('cancelled');
             return;
          }

          const now = Date.now();
          const vocalTime = data.dateVocal?.toDate?.() || new Date();
          const minutesBefore = (vocalTime.getTime() - now) / 60000;

          if (minutesBefore > 15 && !data.isTestGroup) {
            setStep('too_early');
            return;
          }

          // Test group → skip evaluation check, go to password
          if (data.isTestGroup && data.passwordVocal) {
            setStep('password');
            return;
          }

          // Check if session is still active (not ended by animateur)
          const sessionActive = data.sessionState?.sessionActive !== false;

          // Direct evaluation access (from "Donner mon avis" bottom sheet)
          if (isEvalDirect) {
            setStep('evaluation');
            return;
          }

          // Normal groups: check if user has a pending evaluation
          // BUT only redirect to evaluation if session is no longer active
          const currentUsr = auth.currentUser;
          if (currentUsr) {
            try {
              const evalStatus = await getEvaluationStatus(groupeId, currentUsr.uid);
              if (evalStatus === 'pending' && !sessionActive) {
                setStep('evaluation');
                return;
              }
            } catch {
              // Firestore rules may not allow reading evaluations yet
            }

            // If session is still active and user is a participant, go directly to room
            if (sessionActive && minutesBefore <= 0) {
              // Logic check: if not test group and < 3 registered, cancel instead of joining
              if (!data.isTestGroup && (data.participants || []).length < 3) {
                 await cancelGroup(groupeId, 'Nombre de participants insuffisant (minimum 3)');
                 setStep('cancelled');
                 return;
              }

              const isParticipant = (data.participants || []).some(
                (p: any) => p.uid === currentUsr.uid
              );
              if (isParticipant) {
                // Pre-fill pseudo and skip charte/waiting
                const accSnap = await getDoc(doc(db, 'accounts', currentUsr.uid));
                if (accSnap.exists()) {
                  setSessionPrenom(accSnap.data()?.pseudo || currentUsr.displayName || '');
                }
                await connectToRoom(data.passwordVocal || undefined);
                setStep('room');
                return;
              }
            }
          }
        }

        // Check if user has skipCharte
        const currentUser = auth.currentUser;
        if (currentUser) {
          const accSnap = await getDoc(doc(db, 'accounts', currentUser.uid));
          if (accSnap.exists() && accSnap.data()?.skipCharte) {
            setStep('prenom');
            return;
          }
          // Pre-fill prenom from account
          if (accSnap.exists()) {
            setSessionPrenom(accSnap.data()?.pseudo || currentUser.displayName || '');
          }
        }

        setStep('charte');
      } catch (err: any) {
        console.error('Erreur chargement groupe:', err);
        setError(err.message || 'Impossible de charger le groupe');
        setStep('charte');
      }
    };

    init();

    // Real-time listener for participants
    const unsub = onSnapshot(doc(db, 'groupes', groupeId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGroupeParticipants(
          (data.participants || []).map((p: any) => ({
            uid: p.uid || '',
            pseudo: p.pseudo || '',
            inscritVocal: p.inscritVocal ?? true,
            dateInscription: p.dateInscription?.toDate?.() || new Date(),
          }))
        );
      }
    });

    return unsub;
  }, [groupeId]);

  // Submit password
  const handlePasswordSubmit = async () => {
    if (!passwordInput.trim()) return;
    setPasswordError('');
    setConnectingAfterPassword(true);
    try {
      await connectToRoom(passwordInput.trim());
      setPasswordValidated(true);

      // Check skipCharte
      const currentUser = auth.currentUser;
      if (currentUser) {
        const accSnap = await getDoc(doc(db, 'accounts', currentUser.uid));
        if (accSnap.exists()) {
          setSessionPrenom(accSnap.data()?.pseudo || currentUser.displayName || '');
          if (accSnap.data()?.skipCharte) {
            setStep('prenom');
            return;
          }
        }
      }
      setStep('charte');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('mot de passe') || msg.includes('password')) {
        setPasswordError('Mot de passe incorrect');
      } else {
        setError(msg || 'Impossible de rejoindre la salle vocale');
      }
    } finally {
      setConnectingAfterPassword(false);
    }
  };

  // Enter room from waiting room
  const handleEnterRoom = async () => {
    // Logic check: if not test group and < 3 registered, cancel instead of joining
    if (!isTestGroup && groupeParticipants.length < 3) {
       await cancelGroup(groupeId!, 'Nombre de participants insuffisant (minimum 3)');
       setStep('cancelled');
       return;
    }

    if (token && wsUrl) {
      setStep('room');
      return;
    }
    setConnectingToRoom(true);
    try {
      await connectToRoom(passwordValidated ? passwordInput : undefined);
      setStep('room');
    } catch (err: any) {
      console.error('Erreur connexion salle:', err);
      setError(err.message || 'Impossible de rejoindre la salle vocale');
    } finally {
      setConnectingToRoom(false);
    }
  };

  const pointsAwardedRef = useRef(false);
  const voluntaryLeaveRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const sessionElapsedRef = useRef(0);
  const sessionTotalRef = useRef(0);
  const [leftEarly, setLeftEarly] = useState(false);

  const handleSessionProgress = useCallback((elapsedMin: number, totalDurationMin: number) => {
    sessionElapsedRef.current = elapsedMin;
    sessionTotalRef.current = totalDurationMin;
  }, []);

  // Called when animateur ends the session — treated as normal completion
  const handleSessionEnded = useCallback(() => {
    voluntaryLeaveRef.current = true;

    // If we're already on the cancellation screen, don't override it
    // (race condition: sessionActive listener fires before status listener updates groupeStatus)
    setStep(prev => {
      if (prev === 'cancelled') return prev;

      const elapsed = sessionElapsedRef.current;
      const total = sessionTotalRef.current;
      const participationRatio = total > 0 ? elapsed / total : 0;

      if (!pointsAwardedRef.current && groupeId) {
        pointsAwardedRef.current = true;
        const user = auth.currentUser;
        if (user) {
          const points = participationRatio > 0.5 ? 10 : 5;
          addPoints(user.uid, points, {
            groupeId,
            groupeTitre,
            date: new Date(),
            type: 'participation',
          }).catch(() => {});
        }
      }

      if (groupeStatus === 'cancelled') return 'cancelled';
      return 'end';
    });
  }, [groupeId, groupeTitre, groupeStatus]);

  const handleLeave = useCallback(() => {
    voluntaryLeaveRef.current = true;

    setStep(prev => {
      // If already on cancellation screen, don't override
      if (prev === 'cancelled') return prev;

      if (groupeStatus === 'cancelled') return 'cancelled';

      const elapsed = sessionElapsedRef.current;
      const total = sessionTotalRef.current;
      const isSessionComplete = total > 0 && (total - elapsed) < 2;
      const participationRatio = total > 0 ? elapsed / total : 0;

      if (!isSessionComplete) {
        setLeftEarly(true);
      }

      if (!pointsAwardedRef.current && groupeId) {
        pointsAwardedRef.current = true;
        const user = auth.currentUser;
        if (user) {
          const points = participationRatio > 0.5 ? 10 : 5;
          addPoints(user.uid, points, {
            groupeId,
            groupeTitre,
            date: new Date(),
            type: 'participation',
          }).catch(() => {});
        }
      }
      return 'end';
    });
  }, [groupeId, groupeTitre, groupeStatus]);

  const handleDisconnected = useCallback(() => {
    if (voluntaryLeaveRef.current) {
      // Depart volontaire → ecran de fin
      handleLeave();
    } else {
      // Deconnexion technique → tentative de reconnexion
      console.log('[SalleVocale] Deconnexion technique, tentative de reconnexion...');
      reconnectAttemptsRef.current = 0;
      setStep('reconnecting');
    }
  }, [handleLeave]);

  const handleReconnect = useCallback(async () => {
    reconnectAttemptsRef.current += 1;
    try {
      await connectToRoom();
      setStep('room');
      reconnectAttemptsRef.current = 0;
    } catch {
      if (reconnectAttemptsRef.current < 3) {
        // Reessayer apres 2 secondes
        setTimeout(() => handleReconnect(), 2000);
      }
      // Apres 3 echecs, rester sur l'ecran reconnecting avec boutons manuels
    }
  }, []);

  const handleNavigateAway = useCallback(() => {
    navigate('/espace/mon-espace');
  }, [navigate]);

  // Presence tracking: single unified effect for set/remove
  // Uses delayed removal to survive React StrictMode double-mount
  const presenceCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 1. ALWAYS clear any pending cleanup first to prevent "disappearing" flicker
    if (presenceCleanupRef.current) {
      clearTimeout(presenceCleanupRef.current);
      presenceCleanupRef.current = null;
    }

    const uid = auth.currentUser?.uid;
    if (!groupeId || !uid) return;

    const inRoom = step === 'waiting' || step === 'room';

    if (!inRoom) {
      // Not in room — remove presence immediately
      removePresence(groupeId, uid).catch(() => {});
      return;
    }

    // 2. Set/Update presence
    setPresence(groupeId, uid, { 
      pseudo: sessionPrenom || 'Parent',
      status: step 
    }).catch(() => {});

    // 3. Heartbeat every 30s
    const interval = setInterval(() => {
      setPresence(groupeId, uid, { 
        pseudo: sessionPrenom || 'Parent',
        status: step 
      }).catch(() => {});
    }, 30000);

    return () => {
      clearInterval(interval);
      // Delayed removal: survives React StrictMode double-mount and rapid state updates
      const capturedUid = uid;
      const capturedGroupeId = groupeId;
      presenceCleanupRef.current = setTimeout(() => {
        removePresence(capturedGroupeId, capturedUid).catch(() => {});
        presenceCleanupRef.current = null;
      }, 3000); // 3-second grace period for stability
    };
  }, [step, groupeId, sessionPrenom, auth.currentUser?.uid]);

  // Cleanup presence on tab/browser close (immediate, no delay needed)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!groupeId || !uid) return;

    const cleanup = () => {
      removePresence(groupeId, uid).catch(() => {});
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [groupeId]);

  // Determine if user is animateur (before LiveKit connection, based on createurUid)
  const currentUser = auth.currentUser;
  const isAnimateurPreConnect = currentUser?.uid === createurUid && createurUid !== '__test__';

  // ===== Loading =====
  if (step === 'loading') {
    return (
      <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
        <p className="text-sm font-bold text-gray-400">Chargement...</p>
      </div>
    );
  }

  // ===== Too Early =====
  if (step === 'too_early') {
    return (
      <TooEarlyScreen
        groupeTitre={groupeTitre}
        participantsCount={groupeParticipants.length}
        dateVocal={dateVocal}
        onBack={handleNavigateAway}
      />
    );
  }

  // ===== Cancelled =====
  if (step === 'cancelled') {
    return (
      <CancellationScreen
        reason="Ce groupe n'a pas atteint le nombre de participants minimum (3 personnes) ou a du etre annule par l'animateur."
        theme={groupeTheme}
        onGoHome={handleNavigateAway}
        onDiscussForum={() => navigate(`/espace/groupes/${groupeId}`)}
        isCreator={currentUser?.uid === createurUid}
        onBrowseGroups={() => navigate('/espace/groupes')}
        onReschedule={currentUser?.uid === createurUid ? () => navigate('/espace/groupes', {
          state: {
            openCreate: true,
            prefill: {
              titre: groupeTitre,
              description: groupeDescription,
              theme: groupeTheme,
              structureType: structureType,
              structure: structure
            }
          }
        }) : undefined}
      />
    );
  }

  // ===== Error =====
  if (error) {
    return (
      <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
          <AlertCircle size={32} className="text-red-400" />
        </div>
        <h2 className="text-lg font-extrabold text-gray-800">Erreur</h2>
        <p className="text-sm text-gray-500 text-center font-medium">{error}</p>
        <button
          onClick={() => navigate(`/espace/groupes/${groupeId}`)}
          className="mt-4 px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30"
        >
          Retour au groupe
        </button>
      </div>
    );
  }

  // ===== Password =====
  if (step === 'password') {
    return (
      <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center">
          <KeyRound size={36} className="text-orange-400" />
        </div>
        <h2 className="text-lg font-extrabold text-gray-800">Salle protegee</h2>
        <p className="text-sm text-gray-400 text-center font-medium">
          Entrez le mot de passe pour acceder a la salle vocale
        </p>
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
          placeholder="Mot de passe"
          className="w-full max-w-xs px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-center text-sm font-bold text-gray-700 outline-none focus:border-orange-400 transition-colors placeholder:text-gray-300"
          autoFocus
        />
        {passwordError && <p className="text-xs font-bold text-red-500">{passwordError}</p>}
        <button
          onClick={handlePasswordSubmit}
          disabled={!passwordInput.trim() || connectingAfterPassword}
          className="px-8 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 disabled:opacity-50 flex items-center gap-2"
        >
          {connectingAfterPassword ? (
            <><Loader2 size={16} className="animate-spin" /> Connexion...</>
          ) : 'Entrer'}
        </button>
        <button
          onClick={handleLeave}
          className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
        >
          Retour au groupe
        </button>
      </div>
    );
  }

  // ===== Charte =====
  if (step === 'charte') {
    return (
      <CharteScreen
        onContinue={() => setStep('prenom')}
        onBack={handleLeave}
      />
    );
  }

  // ===== Prénom / Prep animateur =====
  if (step === 'prenom') {
    if (isAnimateurPreConnect) {
      return (
        <PrepAnimateurScreen
          defaultName={sessionPrenom}
          groupeTitre={groupeTitre}
          groupeTheme={groupeTheme}
          groupeDescription={groupeDescription}
          participantsCount={groupeParticipants.length}
          onContinue={(prenom, notes) => {
            setSessionPrenom(prenom);
            setAnimateurNotes(notes);
            setStep('waiting');
          }}
          onBack={() => setStep('charte')}
        />
      );
    }

    return (
      <PrenomScreen
        defaultName={sessionPrenom}
        onContinue={(prenom) => {
          setSessionPrenom(prenom);
          setStep('waiting');
        }}
        onBack={() => setStep('charte')}
      />
    );
  }

  // ===== Waiting Room =====
  if (step === 'waiting') {
    if (connectingToRoom) {
      return (
        <div className="h-screen bg-[#1a1f3a] flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
          <p className="text-sm font-bold text-white/50">Connexion a la salle vocale...</p>
        </div>
      );
    }

    return (
      <WaitingRoom
        groupeId={groupeId!}
        groupeTitre={groupeTitre}
        groupeTheme={groupeTheme}
        dateVocal={dateVocal}
        isTestGroup={isTestGroup}
        participants={groupeParticipants}
        createurUid={createurUid}
        structureType={structureType}
        structure={structure}
        sessionPrenom={sessionPrenom}
        onEnter={handleEnterRoom}
        onBack={() => setStep('prenom')}
      />
    );
  }

  // ===== Reconnecting Screen =====
  if (step === 'reconnecting') {
    const attempts = reconnectAttemptsRef.current;
    const failed = attempts >= 3;
    return (
      <div
        className="h-screen flex flex-col items-center justify-center gap-6 px-6"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, #2a3060 0%, #1a1f3a 50%, #12152a 100%)',
        }}
      >
        <div className="relative">
          {!failed && <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping" />}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center border ${
            failed ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'
          }`}>
            {failed
              ? <AlertTriangle className="w-10 h-10 text-red-400" />
              : <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
            }
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">
            {failed ? 'Problème de connexion' : 'Reconnexion en cours...'}
          </p>
          <p className="text-sm text-white/50 mt-2">
            {failed
              ? 'Impossible de rejoindre la salle après plusieurs tentatives'
              : `Tentative ${attempts + 1}/3 — veuillez patienter`
            }
          </p>
        </div>

        {/* Progress dots */}
        {!failed && (
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${
                i <= attempts ? 'bg-orange-400' : 'bg-white/20'
              }`} />
            ))}
          </div>
        )}

        {failed && (
          <div className="flex flex-col gap-3 mt-4 w-full max-w-xs">
            <button
              onClick={() => {
                reconnectAttemptsRef.current = 0;
                handleReconnect();
              }}
              className="w-full px-6 py-3.5 bg-orange-500 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform"
            >
              Réessayer la connexion
            </button>
            <button
              onClick={handleLeave}
              className="w-full px-6 py-3.5 bg-white/10 text-white/70 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
            >
              Quitter la session
            </button>
          </div>
        )}
      </div>
    );
  }

  // ===== End Screen (thank you) =====
  if (step === 'end') {
    return (
      <EndScreen
        groupeTitre={groupeTitre}
        canEvaluate={!leftEarly}
        onEvaluate={() => setStep('evaluation')}
        onLater={async () => {
          const user = auth.currentUser;
          if (user && groupeId) {
            try {
              await markEvaluationPending(groupeId, user.uid, user.displayName || 'Parent');
            } catch { /* ignore */ }
          }
          handleNavigateAway();
        }}
      />
    );
  }

  // ===== Evaluation Screen =====
  if (step === 'evaluation') {
    return (
      <EvaluationScreen
        groupeId={groupeId!}
        groupeTitre={groupeTitre}
        participants={groupeParticipants}
        onDone={handleNavigateAway}
        onBack={() => setStep('end')}
      />
    );
  }

  // ===== No token =====
  if (!token || !wsUrl) {
    return (
      <div className="h-screen bg-[#1a1f3a] flex flex-col items-center justify-center gap-4 px-6">
        <AlertCircle size={32} className="text-orange-400" />
        <p className="text-sm text-white/50 text-center font-medium">
          Configuration LiveKit manquante. Contactez l'administrateur.
        </p>
        <button
          onClick={handleNavigateAway}
          className="mt-4 px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm"
        >
          Retour
        </button>
      </div>
    );
  }

  // ===== Main room =====
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #2a3060 0%, #1a1f3a 50%, #12152a 100%)',
      }}
    >
      {/* @ts-ignore LiveKit types mismatch with React 18 */}
      <LiveKitRoom
        serverUrl={wsUrl}
        token={token}
        audio={true}
        video={false}
        connect={true}
        onDisconnected={handleDisconnected}
        className="flex-1 flex flex-col max-w-md mx-auto w-full"
      >
        <RoomAudioRenderer />
        <RoomContent
          isAnimateur={isAnimateur}
          groupeId={groupeId!}
          groupeTitre={groupeTitre}
          groupeTheme={groupeTheme}
          dateVocal={dateVocal}
          onLeave={handleLeave}
          onCancelled={() => setStep('cancelled')}
          animateurNotes={animateurNotes}
          structureType={structureType}
          structure={structure}
          defaultDurationMin={customDurationMin}
          onSessionProgress={handleSessionProgress}
          onSessionEnded={handleSessionEnded}
          sessionPrenom={sessionPrenom}
          isTestGroup={isTestGroup}
          createurUid={createurUid}
        />
      </LiveKitRoom>
    </div>
  );
};

export default SalleVocalePage;
