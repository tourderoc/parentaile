import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useIsSpeaking,
  useConnectionState,
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getLiveKitToken } from '../../lib/liveKitService';
import { onGroupeMessages, sendGroupeMessage } from '../../lib/groupeParoleService';
import type { MessageGroupe, ParticipantGroupe } from '../../types/groupeParole';

// ========== Timer Component ==========
const VocalTimer: React.FC<{ dateVocal: Date; durationMin: number }> = ({
  dateVocal,
  durationMin,
}) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    const endTime = dateVocal.getTime() + durationMin * 60000;

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
  }, [dateVocal, durationMin]);

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
const ChatPanel: React.FC<{
  groupeId: string;
  onClose: () => void;
  unreadCount: number;
}> = ({ groupeId, onClose, unreadCount }) => {
  const [messages, setMessages] = useState<MessageGroupe[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    const unsub = onGroupeMessages(groupeId, (msgs) => {
      setMessages(msgs);
      // Auto-scroll to bottom
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    });
    return unsub;
  }, [groupeId]);

  const handleSend = async () => {
    if (!input.trim() || !currentUser || sending) return;
    setSending(true);
    try {
      await sendGroupeMessage(groupeId, {
        auteurUid: currentUser.uid,
        auteurPseudo: currentUser.displayName || 'Parent',
        contenu: input.trim(),
      });
      setInput('');
    } catch (err) {
      console.error('Erreur envoi message:', err);
    } finally {
      setSending(false);
    }
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
          Chat de la salle
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
                  {msg.dateEnvoi.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Votre message..."
            className="flex-1 px-4 py-2.5 bg-white/10 border border-white/10 rounded-2xl text-sm text-white font-medium outline-none focus:border-orange-400/50 placeholder:text-white/30"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
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
      icon: <ShieldAlert size={20} className="text-red-400" />,
      bg: 'bg-red-500/15',
      description: 'Exclure definitivement de la session',
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
const CircleParticipant: React.FC<{
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isAnimateur: boolean;
  isLocal: boolean;
  hasHandRaised: boolean;
  angle: number;
  radius: number;
  color: string;
  avatarUrl?: string;
  onTap?: () => void;
}> = ({ name, isSpeaking, isMuted, isAnimateur, isLocal, hasHandRaised, angle, radius, color, avatarUrl, onTap }) => {
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
          className={`relative w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
            isSpeaking ? 'scale-110' : ''
          }`}
          style={{
            background: avatarUrl ? 'transparent' : color,
            border: isSpeaking ? `3px solid ${color}` : '3px solid rgba(255,255,255,0.15)',
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
        </div>
      </div>

      {/* Name label */}
      <div className="mt-2 text-center">
        <p className="text-[11px] font-bold text-white/90 max-w-[80px] truncate">
          {isLocal ? 'Vous' : isAnimateur ? 'Anim' : name}
        </p>
        {isSpeaking && (
          <p className="text-[9px] font-medium text-emerald-400">
            {isLocal ? 'Vous parlez' : `${name} parle`}
          </p>
        )}
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

// ========== Room Content (inside LiveKitRoom) ==========
const RoomContent: React.FC<{
  isAnimateur: boolean;
  groupeId: string;
  groupeTitre: string;
  groupeTheme?: string;
  dateVocal: Date;
  onLeave: () => void;
}> = ({ isAnimateur, groupeId, groupeTitre, groupeTheme, dateVocal, onLeave }) => {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const localIsSpeaking = useIsSpeaking(localParticipant);
  const [localMuted, setLocalMuted] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [speakingName, setSpeakingName] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [chatUnread, setChatUnread] = useState(0);
  const [modTarget, setModTarget] = useState<ModTarget | null>(null);
  const [warnToast, setWarnToast] = useState<string | null>(null);

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
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
    if (pub) {
      await localParticipant.setMicrophoneEnabled(localMuted);
      setLocalMuted(!localMuted);
    }
  }, [localParticipant, localMuted]);

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
    const data = encoder.encode(JSON.stringify({ action: 'raise_hand', raised: newState }));
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
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: 'warn', target: identity }));
      await localParticipant.publishData(data, { reliable: true });
    },
    [localParticipant, isAnimateur]
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
    if (!localParticipant) return;
    const room = localParticipant.room;
    if (!room) return;

    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const decoder = new TextDecoder();
        const msg = JSON.parse(decoder.decode(payload));

        // Handle raise hand from other participants
        if (msg.action === 'raise_hand' && participant) {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            if (msg.raised) next.add(participant.identity);
            else next.delete(participant.identity);
            return next;
          });
          return;
        }

        if (msg.target === localParticipant.identity) {
          if (msg.action === 'mute') {
            localParticipant.setMicrophoneEnabled(false);
            setLocalMuted(true);
          } else if (msg.action === 'give_word') {
            localParticipant.setMicrophoneEnabled(true);
            setLocalMuted(false);
            setHandRaised(false);
            setWarnToast('L\'animateur vous donne la parole');
            setTimeout(() => setWarnToast(null), 4000);
          } else if (msg.action === 'warn') {
            setWarnToast('L\'animateur vous rappelle les regles de bienveillance');
            setTimeout(() => setWarnToast(null), 5000);
          } else if (msg.action === 'kick') {
            onLeave();
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
  }, [localParticipant, onLeave]);

  // Track unread chat messages when chat is closed
  useEffect(() => {
    if (showChat) {
      setChatUnread(0);
      return;
    }
    const unsub = onGroupeMessages(groupeId, (msgs) => {
      // Simple: count new messages since we don't track read state
      // Just show a dot indicator
      if (msgs.length > 0) {
        setChatUnread((prev) => prev + 1);
      }
    });
    return unsub;
  }, [groupeId, showChat]);

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
      {/* Header */}
      <div className="text-center pt-6 pb-2 px-4">
        <h2 className="text-xl font-extrabold text-white tracking-tight">{groupeTitre}</h2>
        <div className="w-16 h-[2px] bg-gradient-to-r from-transparent via-orange-400 to-transparent mx-auto mt-2" />
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-sm text-white/60 font-medium">Tour de parole</span>
          <span className="text-white/40">&middot;</span>
          <VocalTimer dateVocal={dateVocal} durationMin={45} />
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
      </div>

      {/* Circular layout */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative" style={{ width: circleRadius * 2 + 100, height: circleRadius * 2 + 100 }}>
          {/* Center: Logo Parent'aile with glow */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            {/* Glow effect */}
            <div
              className={`absolute w-24 h-24 rounded-full transition-all duration-500 ${
                speakingName ? 'opacity-60' : 'opacity-30'
              }`}
              style={{
                background: 'radial-gradient(circle, rgba(249,168,38,0.5) 0%, rgba(249,168,38,0) 70%)',
                filter: 'blur(12px)',
                transform: speakingName ? 'scale(1.3)' : 'scale(1)',
              }}
            />
            {/* Logo */}
            <img
              src="/app-icon.png"
              alt="Parent'aile"
              className={`w-20 h-20 rounded-full shadow-xl transition-all duration-500 ${
                speakingName ? 'ring-2 ring-orange-400/50' : ''
              }`}
              style={{
                filter: speakingName
                  ? 'drop-shadow(0 0 16px rgba(249,168,38,0.5))'
                  : 'drop-shadow(0 0 8px rgba(249,168,38,0.2))',
              }}
            />
            {/* Speaking label */}
            <AnimatePresence>
              {speakingName && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="mt-2 text-xs font-bold text-orange-300"
                >
                  {speakingName === 'Vous' ? 'Vous parlez' : `${speakingName} parle`}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Participants around the circle */}
          {participants.map((p, index) => {
            const isLocal = p.identity === localParticipant?.identity;
            const metadata = p.metadata ? JSON.parse(p.metadata) : {};
            const pIsAnimateur = metadata.isAnimateur === true;
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
                angle={angle}
                radius={circleRadius}
                color={color}
                onTap={isAnimateur && !isLocal ? () => setModTarget({
                  identity: p.identity,
                  name: p.name || 'Parent',
                  color,
                  isMuted: isLocal ? localMuted : isMuted,
                  hasHandRaised: raisedHands.has(p.identity),
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
              localMuted ? 'bg-red-500/20' : 'bg-white/10'
            }`}
          >
            {localMuted ? (
              <MicOff size={22} className="text-red-400" />
            ) : (
              <Mic size={22} className="text-white" />
            )}
            <span className={`text-[10px] font-bold ${localMuted ? 'text-red-400' : 'text-white/70'}`}>
              Muet
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

          {/* Quitter */}
          <button
            onClick={onLeave}
            className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-white/10 transition-all active:scale-90"
          >
            <LogOut size={22} className="text-white/60" />
            <span className="text-[10px] font-bold text-white/60">Quitter</span>
          </button>
        </div>
      </div>

      {/* Chat panel overlay */}
      <AnimatePresence>
        {showChat && (
          <ChatPanel
            groupeId={groupeId}
            onClose={() => setShowChat(false)}
            unreadCount={chatUnread}
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
  onEnter: () => void;
  onBack: () => void;
}> = ({ groupeId, groupeTitre, groupeTheme, dateVocal, isTestGroup, participants, createurUid, onEnter, onBack }) => {
  const currentUser = auth.currentUser;
  const [countdown, setCountdown] = useState('');
  const [sessionStarted, setSessionStarted] = useState(false);
  // For test group: fake 15min countdown starting from now
  const [testStartTime] = useState(() => new Date(Date.now() + 15 * 60 * 1000));

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

      {/* Countdown */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 flex flex-col items-center mb-5">
        {sessionStarted ? (
          <>
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mb-2">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-emerald-400">La session est ouverte !</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-orange-400" />
              <p className="text-sm font-medium text-white/60">La session commence dans</p>
            </div>
            <p className="text-3xl font-mono font-extrabold text-white tracking-wider">{countdown}</p>
          </>
        )}
      </div>

      {/* Status cards */}
      <div className="w-full max-w-xs space-y-3">
        {/* Participants */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center shrink-0">
            <Users size={18} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {participants.length} participant{participants.length > 1 ? 's' : ''} inscrit{participants.length > 1 ? 's' : ''}
            </p>
            <p className="text-[11px] text-white/40 font-medium truncate">
              {participants.map((p) => p.pseudo).join(', ')}
            </p>
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
      </div>

      {/* Enter button — always clickable for test groups, otherwise wait for countdown */}
      <button
        onClick={onEnter}
        className={`mt-8 px-10 py-4 rounded-2xl font-extrabold text-base shadow-xl active:scale-95 transition-all ${
          isTestGroup || sessionStarted
            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/30'
            : 'bg-white/10 text-white/30 cursor-not-allowed'
        }`}
        disabled={!isTestGroup && !sessionStarted}
      >
        {isAnimateur ? 'Lancer la session' : 'Entrer dans la salle'}
      </button>

      {!isTestGroup && !sessionStarted && (
        <p className="mt-2 text-[11px] text-white/30 font-medium">
          Disponible quand le compte a rebours atteint zero
        </p>
      )}

      <button
        onClick={onBack}
        className="mt-4 text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
      >
        Retour au groupe
      </button>
    </div>
  );
};

// ========== Main Page ==========
export const SalleVocalePage = () => {
  const { groupeId } = useParams<{ groupeId: string }>();
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string>('');
  const [isAnimateur, setIsAnimateur] = useState(false);
  const [groupeTitre, setGroupeTitre] = useState('');
  const [groupeTheme, setGroupeTheme] = useState<string | undefined>();
  const [dateVocal, setDateVocal] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [groupeParticipants, setGroupeParticipants] = useState<ParticipantGroupe[]>([]);
  const [createurUid, setCreateurUid] = useState('');
  const [isTestGroup, setIsTestGroup] = useState(false);

  // Waiting room vs room state
  const [inWaitingRoom, setInWaitingRoom] = useState(true);
  const [connectingToRoom, setConnectingToRoom] = useState(false);

  // Password prompt state
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [connectingAfterPassword, setConnectingAfterPassword] = useState(false);
  const [passwordValidated, setPasswordValidated] = useState(false);

  // Connect to LiveKit (shared logic)
  const connectToRoom = async (password?: string) => {
    const result = await getLiveKitToken(groupeId!, password);
    setToken(result.token);
    setWsUrl(result.wsUrl);
    setIsAnimateur(result.isAnimateur);
  };

  // Load group info
  useEffect(() => {
    if (!groupeId) return;

    const init = async () => {
      try {
        const groupeSnap = await getDoc(doc(db, 'groupes', groupeId));
        if (groupeSnap.exists()) {
          const data = groupeSnap.data();
          setGroupeTitre(data.titre || '');
          setGroupeTheme(data.theme || data.categorie || undefined);
          setDateVocal(data.dateVocal?.toDate?.() || new Date());
          setCreateurUid(data.createurUid || '');
          setIsTestGroup(!!data.isTestGroup);
          setGroupeParticipants(
            (data.participants || []).map((p: any) => ({
              uid: p.uid || '',
              pseudo: p.pseudo || '',
              inscritVocal: p.inscritVocal ?? true,
              dateInscription: p.dateInscription?.toDate?.() || new Date(),
            }))
          );

          // Test group with password
          if (data.isTestGroup && data.passwordVocal) {
            setNeedsPassword(true);
            setIsLoading(false);
            return;
          }
        }

        // No password needed → go to waiting room
        setIsLoading(false);
      } catch (err: any) {
        console.error('Erreur chargement groupe:', err);
        setError(err.message || 'Impossible de charger le groupe');
        setIsLoading(false);
      }
    };

    init();

    // Real-time listener for participants updates
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

  // Submit password → go to waiting room
  const handlePasswordSubmit = async () => {
    if (!passwordInput.trim()) return;
    setPasswordError('');
    setConnectingAfterPassword(true);
    try {
      // Validate password by trying to get token
      await connectToRoom(passwordInput.trim());
      setPasswordValidated(true);
      setNeedsPassword(false);
      // Go to waiting room (not directly to the room)
      setInWaitingRoom(true);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('mot de passe') || msg.includes('password')) {
        setPasswordError('Mot de passe incorrect');
      } else {
        setError(msg || 'Impossible de rejoindre la salle vocale');
        setNeedsPassword(false);
      }
    } finally {
      setConnectingAfterPassword(false);
    }
  };

  // Enter room from waiting room
  const handleEnterRoom = async () => {
    // If token already obtained (e.g. after password validation), just enter
    if (token && wsUrl) {
      setInWaitingRoom(false);
      return;
    }
    setConnectingToRoom(true);
    try {
      await connectToRoom(passwordValidated ? passwordInput : undefined);
      setInWaitingRoom(false);
    } catch (err: any) {
      console.error('Erreur connexion salle:', err);
      setError(err.message || 'Impossible de rejoindre la salle vocale');
    } finally {
      setConnectingToRoom(false);
    }
  };

  const handleLeave = useCallback(() => {
    navigate(`/espace/groupes/${groupeId}`);
  }, [navigate, groupeId]);

  // ===== Loading =====
  if (isLoading) {
    return (
      <div className="h-screen bg-[#1a1f3a] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
        <p className="text-sm font-bold text-white/50">Chargement...</p>
      </div>
    );
  }

  // ===== Password prompt =====
  if (needsPassword) {
    return (
      <div className="h-screen bg-[#1a1f3a] flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center">
          <KeyRound size={36} className="text-orange-400" />
        </div>
        <h2 className="text-lg font-extrabold text-white">Salle protegee</h2>
        <p className="text-sm text-white/50 text-center font-medium">
          Entrez le mot de passe pour acceder a la salle vocale
        </p>
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
          placeholder="Mot de passe"
          className="w-full max-w-xs px-4 py-3 bg-white/10 border-2 border-white/20 rounded-2xl text-center text-sm font-bold text-white outline-none focus:border-orange-400 transition-colors placeholder:text-white/30"
          autoFocus
        />
        {passwordError && (
          <p className="text-xs font-bold text-red-400">{passwordError}</p>
        )}
        <button
          onClick={handlePasswordSubmit}
          disabled={!passwordInput.trim() || connectingAfterPassword}
          className="px-8 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 disabled:opacity-50 flex items-center gap-2"
        >
          {connectingAfterPassword ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Connexion...
            </>
          ) : (
            'Entrer'
          )}
        </button>
        <button
          onClick={() => navigate(`/espace/groupes/${groupeId}`)}
          className="text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
        >
          Retour au groupe
        </button>
      </div>
    );
  }

  // ===== Error =====
  if (error) {
    return (
      <div className="h-screen bg-[#1a1f3a] flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
          <AlertCircle size={32} className="text-red-400" />
        </div>
        <h2 className="text-lg font-extrabold text-white">Erreur</h2>
        <p className="text-sm text-white/50 text-center font-medium">{error}</p>
        <button
          onClick={() => navigate(`/espace/groupes/${groupeId}`)}
          className="mt-4 px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30"
        >
          Retour au groupe
        </button>
      </div>
    );
  }

  // ===== Waiting Room =====
  if (inWaitingRoom) {
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
        onEnter={handleEnterRoom}
        onBack={handleLeave}
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
          onClick={() => navigate(`/espace/groupes/${groupeId}`)}
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
      <LiveKitRoom
        serverUrl={wsUrl}
        token={token}
        audio={true}
        video={false}
        connect={true}
        onDisconnected={handleLeave}
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
        />
      </LiveKitRoom>
    </div>
  );
};

export default SalleVocalePage;
