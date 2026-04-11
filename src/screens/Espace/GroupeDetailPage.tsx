import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Mic, MicOff, Clock, ChevronDown, Send, Trash2,
  MessageCircle, Shield, Lock, Loader2, LogOut, AlertTriangle, Share2,
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  onGroupeParole,
  onGroupeMessages,
  sendGroupeMessage,
  deleteGroupeMessage,
  rejoindreGroupe,
  quitterGroupe,
} from '../../lib/groupeParoleService';
import type { GroupeParole, MessageGroupe } from '../../types/groupeParole';
import { THEME_COLORS, THEME_SHORT_LABELS, THEME_LABELS } from '../../types/groupeParole';

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

function formatMessageDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const MESSAGE_TRUNCATE_LENGTH = 280;

// --- Bulle de message ---
const MessageBubble: React.FC<{
  message: MessageGroupe;
  isOwn: boolean;
  isCreateur: boolean;
  canModerate: boolean;
  onDelete: (id: string) => void;
}> = ({ message, isOwn, isCreateur, canModerate, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isLong = message.contenu.length > MESSAGE_TRUNCATE_LENGTH;
  const displayText = isLong && !expanded
    ? message.contenu.slice(0, MESSAGE_TRUNCATE_LENGTH) + '...'
    : message.contenu;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
    >
      <div className={`max-w-[80%] ${isOwn ? 'order-1' : ''}`}>
        {/* Pseudo + badge créateur */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-[10px] font-bold text-gray-500">
              {message.auteurPseudo}
            </span>
            {isCreateur && (
              <span className="text-[8px] font-bold bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full uppercase">
                Modérateur
              </span>
            )}
          </div>
        )}

        {/* Bulle */}
        <div
          className={`
            px-4 py-2.5 rounded-[20px] relative
            ${isOwn
              ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-white rounded-br-md'
              : 'bg-white/80 border border-white/60 shadow-sm text-gray-700 rounded-bl-md'
            }
          `}
        >
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
            {displayText}
          </p>

          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`text-[11px] font-bold mt-1 ${isOwn ? 'text-white/80' : 'text-orange-500'}`}
            >
              {expanded ? 'Voir moins' : 'Plus de détails'}
            </button>
          )}

          {/* Heure */}
          <p className={`text-[9px] mt-1 ${isOwn ? 'text-white/60 text-right' : 'text-gray-400'}`}>
            {formatMessageDate(message.dateEnvoi)}
          </p>
        </div>

        {/* Bouton supprimer (modérateur) */}
        {canModerate && (
          <div className="flex justify-end mt-1">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[10px] text-gray-300 hover:text-red-400 transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100 px-1"
              >
                <Trash2 size={10} />
                <span>Supprimer</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={() => { onDelete(message.id); setShowDeleteConfirm(false); }}
                  className="text-[10px] font-bold text-red-500 hover:text-red-600"
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-[10px] text-gray-400"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// --- Page principale ---
export const GroupeDetailPage = () => {
  const { groupeId } = useParams<{ groupeId: string }>();
  const navigate = useNavigate();

  const [groupe, setGroupe] = useState<GroupeParole | null>(null);
  const [messages, setMessages] = useState<MessageGroupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [userPseudo, setUserPseudo] = useState('Parent');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  const handleShare = async () => {
    const url = `https://parentaile.fr/espace/groupes/${groupeId}`;
    const text = `Rejoins mon groupe de parole "${groupe?.titre}" sur Parent'aile`;
    if (navigator.share) {
      try {
        await navigator.share({ title: groupe?.titre, text, url });
      } catch { /* annulé par l'utilisateur */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2500);
    }
  };
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const user = auth.currentUser;
  const isParticipant = useMemo(
    () => groupe?.participants.some(p => p.uid === user?.uid) ?? false,
    [groupe, user]
  );
  const isGroupeCreateur = useMemo(
    () => groupe?.createurUid === user?.uid,
    [groupe, user]
  );
  const placesRestantes = useMemo(
    () => (groupe ? groupe.participantsMax - groupe.participants.length : 0),
    [groupe]
  );
  const estComplet = placesRestantes === 0;
  const estInscriptionPossible = useMemo(() => {
    if (!groupe) return false;
    const limit = groupe.dateVocal.getTime() - 5 * 60000;
    return Date.now() < limit;
  }, [groupe]);

  // Charger le pseudo
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'accounts', user.uid)).then(snap => {
      if (snap.exists()) {
        setUserPseudo(snap.data().pseudo || 'Parent');
      }
    });
  }, [user]);

  // Listener temps réel sur le groupe
  useEffect(() => {
    if (!groupeId) return;
    const unsub = onGroupeParole(groupeId, (g) => {
      setGroupe(g);
      setLoading(false);
    });
    return () => unsub();
  }, [groupeId]);

  // Listener temps réel sur les messages
  useEffect(() => {
    if (!groupeId) return;
    const unsub = onGroupeMessages(groupeId, setMessages);
    return () => unsub();
  }, [groupeId]);

  // Initialiser la reconnaissance vocale
  useEffect(() => {
    const hasSupport = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setVoiceSupported(hasSupport);

    if (hasSupport) {
      const SpeechRecognitionAPI = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = !isMobile;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'fr-FR';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        setMessageInput(finalTranscriptRef.current + interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        if (isMobile && (event.error === 'no-speech' || event.error === 'aborted')) {
          if (isRecordingRef.current) {
            setTimeout(() => { try { recognitionRef.current?.start(); } catch (_e) {} }, 100);
          }
          return;
        }
        setIsRecording(false);
        isRecordingRef.current = false;
      };

      recognitionRef.current.onend = () => {
        if (isMobile && isRecordingRef.current) {
          setTimeout(() => {
            try { recognitionRef.current?.start(); } catch (_e) {
              setIsRecording(false);
              isRecordingRef.current = false;
            }
          }, 100);
          return;
        }
        setIsRecording(false);
        isRecordingRef.current = false;
        if (finalTranscriptRef.current) {
          setMessageInput(finalTranscriptRef.current.trim());
        }
      };
    }

    return () => {
      isRecordingRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_e) {}
      }
    };
  }, [isMobile]);

  const toggleRecording = async () => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      isRecordingRef.current = false;
      recognitionRef.current.stop();
      setIsRecording(false);
      setMessageInput(finalTranscriptRef.current.trim());
    } else {
      if (isMobile) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (_err) {
          return;
        }
      }
      finalTranscriptRef.current = messageInput ? messageInput + ' ' : '';
      try {
        recognitionRef.current.start();
        isRecordingRef.current = true;
        setIsRecording(true);
      } catch (_err) {}
    }
  };

  // --- Actions ---
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !user || !groupeId || sending) return;
    setSending(true);
    try {
      await sendGroupeMessage(groupeId, {
        auteurUid: user.uid,
        auteurPseudo: userPseudo,
        contenu: messageInput.trim(),
      });
      setMessageInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err) {
      console.error('Erreur envoi message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!groupeId) return;
    try {
      await deleteGroupeMessage(groupeId, messageId);
    } catch (err) {
      console.error('Erreur suppression message:', err);
    }
  };

  const handleLeaveGroupe = async () => {
    if (!user || !groupeId || leaving) return;
    setLeaving(true);
    try {
      await quitterGroupe(groupeId, user.uid);
      setShowLeaveConfirm(false);
    } catch (err) {
      console.error('Erreur désinscription:', err);
    } finally {
      setLeaving(false);
    }
  };

  const handleJoinGroupe = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!groupeId || joining || estComplet) return;
    setJoining(true);
    try {
      await rejoindreGroupe(groupeId, { uid: user.uid, pseudo: userPseudo });
    } catch (err) {
      console.error('Erreur inscription:', err);
    } finally {
      setJoining(false);
    }
  };

  // --- Rendu ---
  if (loading) {
    return (
      <div className="h-screen bg-[#FFFBF0] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="text-orange-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Chargement du groupe...</p>
        </div>
      </div>
    );
  }

  if (!groupe) {
    return (
      <div className="h-screen bg-[#FFFBF0] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={28} className="text-gray-400" />
          </div>
          <h2 className="text-lg font-extrabold text-gray-700">Groupe introuvable</h2>
          <p className="text-sm text-gray-400 mt-2">Ce groupe n'existe plus ou a expiré.</p>
          <button
            onClick={() => navigate('/espace/groupes')}
            className="mt-6 px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30"
          >
            Retour aux groupes
          </button>
        </div>
      </div>
    );
  }

  const colors = THEME_COLORS[groupe.theme];
  const jours = joursRestants(groupe.dateExpiration);
  const vocalPassé = groupe.dateVocal.getTime() < Date.now();

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col">
      {/* Header sticky */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100 flex-shrink-0">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/espace/groupes')}
            className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-extrabold text-gray-800 truncate">
              {groupe.titre}
            </h1>
            <p className="text-[10px] text-gray-400 font-medium">
              {groupe.participants.length} participant{groupe.participants.length > 1 ? 's' : ''} · Encore {jours} jour{jours > 1 ? 's' : ''} pour le chat
            </p>
          </div>
          <button
            onClick={handleShare}
            className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center hover:bg-orange-100 transition-colors relative"
          >
            <Share2 size={16} className="text-orange-500" />
            {copyToast && (
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap">
                Lien copié !
              </span>
            )}
          </button>
          <div className={`${colors.bg} px-2.5 py-1 rounded-full`}>
            <span className="text-[9px] font-bold text-white uppercase tracking-wider">
              {THEME_SHORT_LABELS[groupe.theme]}
            </span>
          </div>
        </div>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto" ref={chatContainerRef}>
        <div className="max-w-md mx-auto px-4 pt-4 pb-4 space-y-4">

          {/* Carte compacte du groupe */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden"
          >
            {/* Bandeau thème */}
            <div className={`${colors.bg} px-4 py-2.5 flex items-center justify-between`}>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                {THEME_LABELS[groupe.theme]}
              </span>
              {estComplet && (
                <span className="text-[9px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Complet
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
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
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ml-auto ${
                  groupe.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                  groupe.status === 'reprogrammed' ? 'bg-blue-50 text-blue-500' :
                  vocalPassé ? 'bg-gray-100 text-gray-400' : 'bg-orange-50 text-orange-500'
                }`}>
                  {groupe.status === 'cancelled' ? 'Annulé' : 
                   groupe.status === 'reprogrammed' ? 'Reprogrammé' :
                   vocalPassé ? 'Passé' : 'À venir'}
                </span>
              </div>

              {/* Temps restant */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
                  <Clock size={14} className="text-orange-400" />
                </div>
                <span className="text-xs font-semibold text-orange-500">
                  Encore {jours} jour{jours > 1 ? 's' : ''} pour le chat
                </span>
              </div>

              {/* Bouton inscription */}
              {!isParticipant && !estComplet && (!groupe.status || groupe.status === 'scheduled') && (
                estInscriptionPossible ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleJoinGroupe}
                    disabled={joining}
                    className="w-full py-3 bg-gradient-to-r from-orange-400 to-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 hover:from-orange-500 hover:to-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {joining ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Users size={16} />
                    )}
                    {joining ? 'Inscription...' : "S'inscrire au groupe"}
                  </motion.button>
                ) : (
                  <div className="w-full py-3 bg-gray-100 text-gray-400 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border border-gray-200">
                    <Lock size={14} />
                    <span>Inscriptions closes (début imminent)</span>
                  </div>
                )
              )}

              {isParticipant && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-600">
                        {isGroupeCreateur ? 'Vous êtes le modérateur' : 'Vous participez à ce groupe'}
                      </span>
                    </div>
                    {!isGroupeCreateur && !showLeaveConfirm && (
                      <button
                        onClick={() => setShowLeaveConfirm(true)}
                        className="text-[10px] font-bold text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1"
                      >
                        <LogOut size={10} />
                        Quitter
                      </button>
                    )}
                  </div>

                  {/* Confirmation quitter */}
                  <AnimatePresence>
                    {showLeaveConfirm && !isGroupeCreateur && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className={`px-3 py-3 rounded-xl border ${
                          groupe.dateVocal.getTime() - Date.now() < 3600000 && groupe.dateVocal.getTime() > Date.now()
                            ? 'bg-red-50 border-red-200'
                            : 'bg-amber-50 border-amber-200'
                        }`}>
                          <div className="flex items-start gap-2 mb-2.5">
                            <AlertTriangle size={14} className={
                              groupe.dateVocal.getTime() - Date.now() < 3600000 && groupe.dateVocal.getTime() > Date.now()
                                ? 'text-red-400 mt-0.5'
                                : 'text-amber-400 mt-0.5'
                            } />
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                              {groupe.dateVocal.getTime() - Date.now() < 3600000 && groupe.dateVocal.getTime() > Date.now()
                                ? 'Le groupe vocal commence dans moins d\'une heure ! Êtes-vous sûr de vouloir quitter ?'
                                : 'Si vous avez un empêchement, essayez de quitter au moins 1h avant le début du groupe vocal pour laisser la place à un autre parent.'
                              }
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleLeaveGroupe}
                              disabled={leaving}
                              className="flex-1 py-2 bg-red-500 text-white rounded-xl font-bold text-xs shadow-sm hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {leaving ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                              {leaving ? 'Désinscription...' : 'Confirmer'}
                            </button>
                            <button
                              onClick={() => setShowLeaveConfirm(false)}
                              className="flex-1 py-2 bg-white text-gray-500 rounded-xl font-bold text-xs border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Plus de détails (dépliable) */}
            <div className="border-t border-gray-100/60">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/30 transition-colors"
              >
                <span className="text-xs font-bold text-gray-500">{showDetails ? 'Moins de détails' : 'Plus de détails'}</span>
                <motion.div
                  animate={{ rotate: showDetails ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={16} className="text-gray-400" />
                </motion.div>
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4">
                      {/* Description */}
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                          Description
                        </h4>
                        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                          {groupe.description}
                        </p>
                      </div>

                      {/* Créateur */}
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                          Créé par
                        </h4>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-orange-500">
                              {groupe.createurPseudo.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-700">{groupe.createurPseudo}</span>
                          <span className="text-[8px] font-bold bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full uppercase">
                            Modérateur
                          </span>
                        </div>
                      </div>

                      {/* Structure */}
                      {groupe.structureType === 'structuree' && groupe.structure && (
                        <div>
                          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                            Déroulement prévu
                          </h4>
                          <div className="space-y-1.5">
                            {groupe.structure.map((etape, i) => (
                              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                <div className={`w-5 h-5 ${colors.bg} rounded-md flex items-center justify-center`}>
                                  <span className="text-[9px] font-bold text-white">{i + 1}</span>
                                </div>
                                <span className="text-xs text-gray-600 flex-1">{etape.label}</span>
                                <span className="text-[10px] font-bold text-gray-400">{etape.dureeMinutes} min</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Participants */}
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                          Participants ({groupe.participants.length}/{groupe.participantsMax})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {groupe.participants.map((p) => (
                            <div
                              key={p.uid}
                              className="flex items-center gap-1.5 bg-white/80 border border-gray-100 rounded-full px-3 py-1.5"
                            >
                              <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center">
                                <span className="text-[8px] font-bold text-orange-500">
                                  {p.pseudo.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold text-gray-600">{p.pseudo}</span>
                              {p.uid === groupe.createurUid && (
                                <Shield size={10} className="text-orange-400" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Section Chat */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden"
          >
            {/* Header chat */}
            <div className="px-4 py-3 border-b border-gray-100/60 flex items-center gap-2">
              <MessageCircle size={16} className="text-orange-400" />
              <span className="text-xs font-bold text-gray-700">
                Discussion ({messages.length})
              </span>
            </div>

            {/* Discussion Header */}
            <div className="sticky top-0 z-10">
              {/* Alerte groupe annulé */}
              {(groupe.status === 'cancelled' || groupe.status === 'reprogrammed') && (
                <div className={`px-4 py-2 border-b flex items-center gap-3 ${
                  groupe.status === 'cancelled' ? 'bg-red-50 border-red-100/50' : 'bg-blue-50 border-blue-100/50'
                }`}>
                  <AlertTriangle size={14} className={groupe.status === 'cancelled' ? 'text-red-400' : 'text-blue-400'} />
                  <p className={`text-[10px] font-bold ${groupe.status === 'cancelled' ? 'text-red-600' : 'text-blue-600'}`}>
                    {groupe.status === 'cancelled' 
                      ? 'SESSION VOCALE ANNULÉE' 
                      : 'SESSION REPROGRAMMÉE'}
                  </p>
                </div>
              )}

              {/* Description du créateur */}
              <div className="px-4 py-2.5 bg-orange-50/90 backdrop-blur-sm border-b border-orange-100/50">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-orange-500">
                      {groupe.createurPseudo.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold text-orange-600">{groupe.createurPseudo}</span>
                      <span className="text-[8px] font-bold bg-orange-200/60 text-orange-600 px-1.5 py-0.5 rounded-full uppercase">
                        Modérateur
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {groupe.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Input (juste après la description) */}
            <div className="border-b border-gray-100/60">
              {!user ? (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full px-4 py-3.5 flex items-center justify-center gap-2 bg-gray-50/50 hover:bg-gray-50 transition-colors"
                >
                  <Lock size={14} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-500">
                    Connectez-vous pour participer
                  </span>
                </button>
              ) : (
                <div className="px-3 py-3 flex items-end gap-2 bg-white transition-all duration-300">
                  <textarea
                    ref={textareaRef}
                    value={messageInput}
                    spellCheck={true}
                    lang="fr-FR"
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder={isRecording ? 'Parlez...' : 'Votre message (Agrandit au clic)...'}
                    className={`
                      flex-1 rounded-2xl px-4 py-3 text-sm text-gray-700 placeholder:text-gray-400 outline-none border-2
                      transition-all resize-none overflow-y-auto
                      ${isInputFocused || messageInput.length > 0
                        ? 'min-h-[140px] bg-white border-orange-200 shadow-sm leading-relaxed' 
                        : 'min-h-[44px] bg-gray-50 border-transparent leading-normal'
                      }
                      ${isRecording ? '!border-red-300 !bg-red-50/30' : ''}
                    `}
                    style={{ maxHeight: '200px' }}
                    disabled={sending}
                  />
                  {voiceSupported && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={toggleRecording}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                        isRecording
                          ? 'bg-red-500 shadow-md shadow-red-500/30 animate-pulse'
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      {isRecording ? (
                        <MicOff size={16} className="text-white" />
                      ) : (
                        <Mic size={16} className="text-gray-500" />
                      )}
                    </motion.button>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || sending}
                    className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md disabled:opacity-40 disabled:shadow-none transition-all flex-shrink-0"
                  >
                    {sending ? (
                      <Loader2 size={16} className="text-white animate-spin" />
                    ) : (
                      <Send size={16} className="text-white" />
                    )}
                  </motion.button>
                </div>
              )}
            </div>

            {/* Messages (les plus récents en haut) */}
            <div className="px-4 py-3 space-y-3 min-h-[200px] max-h-[400px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center mb-3">
                    <MessageCircle size={20} className="text-orange-300" />
                  </div>
                  <p className="text-xs font-bold text-gray-400">Aucun message pour le moment</p>
                  <p className="text-[10px] text-gray-300 mt-1">
                    Soyez le premier à écrire !
                  </p>
                </div>
              ) : (
                [...messages].reverse().map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.auteurUid === user?.uid}
                    isCreateur={msg.auteurUid === groupe.createurUid}
                    canModerate={isGroupeCreateur}
                    onDelete={handleDeleteMessage}
                  />
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Modal Auth (portail) */}
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
                  Connectez-vous ou inscrivez-vous pour participer aux groupes de parole.
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

export default GroupeDetailPage;
