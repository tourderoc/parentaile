import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useIsSpeaking,
  useConnectionState,
  useRoomInfo,
} from '@livekit/components-react';
import {
  Track,
  RoomEvent,
  RemoteParticipant,
  ConnectionState,
} from 'livekit-client';
import {
  ArrowLeft,
  Mic,
  MicOff,
  PhoneOff,
  Crown,
  Loader2,
  AlertCircle,
  Volume2,
  UserX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getLiveKitToken } from '../../lib/liveKitService';
import { UserAvatar } from '../../components/ui/UserAvatar';

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
      className={`text-sm font-mono font-extrabold ${
        isOvertime ? 'text-red-500 animate-pulse' : 'text-gray-600'
      }`}
    >
      {timeLeft}
    </span>
  );
};

// ========== Participant Card ==========
const ParticipantCard: React.FC<{
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isAnimateur: boolean;
  isLocal: boolean;
  onMute?: () => void;
  onKick?: () => void;
  showModControls: boolean;
}> = ({ name, isSpeaking, isMuted, isAnimateur, isLocal, onMute, onKick, showModControls }) => {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-center gap-2"
    >
      {/* Avatar circle */}
      <div
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
          isSpeaking
            ? 'ring-4 ring-emerald-400 ring-offset-2 bg-emerald-50'
            : isMuted
            ? 'bg-gray-100 ring-2 ring-gray-200'
            : 'bg-orange-50 ring-2 ring-orange-200'
        }`}
      >
        <span className="text-2xl font-extrabold text-gray-600">
          {name.charAt(0).toUpperCase()}
        </span>

        {/* Speaking indicator */}
        {isSpeaking && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg"
          >
            <Volume2 size={12} className="text-white" />
          </motion.div>
        )}

        {/* Muted indicator */}
        {isMuted && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
            <MicOff size={12} className="text-white" />
          </div>
        )}

        {/* Animateur badge */}
        {isAnimateur && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
            <Crown size={12} className="text-white" />
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-xs font-bold text-gray-700 text-center max-w-[80px] truncate">
        {isLocal ? 'Vous' : name}
      </p>

      {/* Mod controls */}
      {showModControls && !isLocal && (
        <div className="flex gap-1">
          {onMute && (
            <button
              onClick={onMute}
              className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center active:scale-90"
              title="Muter"
            >
              <MicOff size={12} className="text-orange-600" />
            </button>
          )}
          {onKick && (
            <button
              onClick={onKick}
              className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center active:scale-90"
              title="Exclure"
            >
              <UserX size={12} className="text-red-600" />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

// ========== Room Content (inside LiveKitRoom) ==========
const RoomContent: React.FC<{
  isAnimateur: boolean;
  groupeTitre: string;
  dateVocal: Date;
  onLeave: () => void;
}> = ({ isAnimateur, groupeTitre, dateVocal, onLeave }) => {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const localIsSpeaking = useIsSpeaking(localParticipant);
  const [localMuted, setLocalMuted] = useState(false);

  const handleToggleMute = useCallback(async () => {
    if (!localParticipant) return;
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
    if (pub) {
      await localParticipant.setMicrophoneEnabled(localMuted);
      setLocalMuted(!localMuted);
    }
  }, [localParticipant, localMuted]);

  const handleMuteParticipant = useCallback(
    async (identity: string) => {
      if (!localParticipant || !isAnimateur) return;
      // Send data message to request mute (participant-side handling)
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: 'mute', target: identity }));
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

  // Listen for data messages (mute/kick commands from animateur)
  useEffect(() => {
    if (!localParticipant) return;

    const room = localParticipant.room;
    if (!room) return;

    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const decoder = new TextDecoder();
        const msg = JSON.parse(decoder.decode(payload));

        if (msg.target === localParticipant.identity) {
          if (msg.action === 'mute') {
            localParticipant.setMicrophoneEnabled(false);
            setLocalMuted(true);
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

  if (connectionState === ConnectionState.Connecting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
        <p className="text-sm font-bold text-gray-500">Connexion à la salle...</p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100/60">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-extrabold text-gray-800 truncate">{groupeTitre}</h2>
          <p className="text-[10px] text-gray-400 font-medium">
            {participants.length} participant{participants.length > 1 ? 's' : ''}
          </p>
        </div>
        <VocalTimer dateVocal={dateVocal} durationMin={45} />
      </div>

      {/* Participants grid */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="grid grid-cols-3 gap-6 max-w-xs">
          {participants.map((p) => {
            const isLocal = p.identity === localParticipant?.identity;
            const metadata = p.metadata ? JSON.parse(p.metadata) : {};
            const pIsAnimateur = metadata.isAnimateur === true;
            const micPub = p.getTrackPublication(Track.Source.Microphone);
            const isMuted = !micPub || micPub.isMuted;

            return (
              <ParticipantCard
                key={p.identity}
                identity={p.identity}
                name={p.name || 'Parent'}
                isSpeaking={isLocal ? localIsSpeaking : p.isSpeaking}
                isMuted={isLocal ? localMuted : isMuted}
                isAnimateur={pIsAnimateur}
                isLocal={isLocal}
                showModControls={isAnimateur && !isLocal}
                onMute={isAnimateur && !isLocal ? () => handleMuteParticipant(p.identity) : undefined}
                onKick={isAnimateur && !isLocal ? () => handleKickParticipant(p.identity) : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 pb-8 pt-4 border-t border-gray-100/60">
        <div className="flex items-center justify-center gap-6">
          {/* Mute toggle */}
          <button
            onClick={handleToggleMute}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
              localMuted
                ? 'bg-red-500 shadow-red-500/30'
                : 'bg-white border-2 border-gray-200 shadow-gray-200/50'
            }`}
          >
            {localMuted ? (
              <MicOff size={24} className="text-white" />
            ) : (
              <Mic size={24} className="text-gray-700" />
            )}
          </button>

          {/* Leave */}
          <button
            onClick={onLeave}
            className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-90 transition-transform"
          >
            <PhoneOff size={24} className="text-white" />
          </button>
        </div>

        <p className="text-center text-[10px] text-gray-400 font-medium mt-3">
          {localMuted ? 'Micro coupé' : 'Micro actif'}
        </p>
      </div>
    </>
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
  const [dateVocal, setDateVocal] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRules, setShowRules] = useState(true);

  // Load token and group info
  useEffect(() => {
    if (!groupeId) return;

    const init = async () => {
      try {
        // Get group info
        const groupeSnap = await getDoc(doc(db, 'groupes', groupeId));
        if (groupeSnap.exists()) {
          const data = groupeSnap.data();
          setGroupeTitre(data.titre || '');
          setDateVocal(data.dateVocal?.toDate?.() || new Date());
        }

        // Get LiveKit token
        const result = await getLiveKitToken(groupeId);
        setToken(result.token);
        setWsUrl(result.wsUrl);
        setIsAnimateur(result.isAnimateur);
      } catch (err: any) {
        console.error('Erreur connexion salle:', err);
        setError(err.message || 'Impossible de rejoindre la salle vocale');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [groupeId]);

  // Auto-hide rules after 5 seconds
  useEffect(() => {
    if (showRules) {
      const timer = setTimeout(() => setShowRules(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showRules]);

  const handleLeave = useCallback(() => {
    navigate(`/espace/groupes/${groupeId}`);
  }, [navigate, groupeId]);

  if (isLoading) {
    return (
      <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
        <p className="text-sm font-bold text-gray-500">Connexion à la salle vocale...</p>
      </div>
    );
  }

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

  if (!token || !wsUrl) {
    return (
      <div className="h-screen bg-[#FFFBF0] flex flex-col items-center justify-center gap-4 px-6">
        <AlertCircle size={32} className="text-orange-400" />
        <p className="text-sm text-gray-500 text-center font-medium">
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

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={handleLeave}
            className="w-10 h-10 glass rounded-xl flex items-center justify-center shadow-glass active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Salle Vocale</h1>
          </div>
        </div>
      </header>

      {/* Rules overlay */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 mt-4 bg-orange-50 border border-orange-200/60 rounded-2xl p-4 max-w-md mx-auto"
          >
            <h3 className="text-xs font-extrabold text-orange-700 uppercase tracking-wider mb-2">
              Rappel des règles
            </h3>
            <ul className="text-[11px] text-orange-600 font-medium space-y-1">
              <li>- Bienveillance et respect mutuel</li>
              <li>- Confidentialité : ce qui se dit ici reste ici</li>
              <li>- Session de 45 minutes maximum</li>
              <li>- L'animateur gère les tours de parole</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LiveKit Room */}
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
          groupeTitre={groupeTitre}
          dateVocal={dateVocal}
          onLeave={handleLeave}
        />
      </LiveKitRoom>
    </div>
  );
};

export default SalleVocalePage;
