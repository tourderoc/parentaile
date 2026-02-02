import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { BottomNav } from '../../components/ui/BottomNav';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Sparkles,
  Send,
  Loader2,
  Check,
  ChevronDown,
  User,
  Baby,
  Eraser
} from 'lucide-react';

interface Child {
  tokenId: string;
  nickname: string;
}

export const MessageComposer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // State
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [showChildSelector, setShowChildSelector] = useState(false);
  const [message, setMessage] = useState('');
  const [reformulatedMessage, setReformulatedMessage] = useState('');
  const [showReformulated, setShowReformulated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isReformulating, setIsReformulating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Charger les enfants
  useEffect(() => {
    const loadChildren = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate('/espace');
        return;
      }

      try {
        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const q = query(childrenRef, orderBy('addedAt', 'desc'));
        const snapshot = await getDocs(q);

        const childrenData: Child[] = snapshot.docs.map(doc => ({
          tokenId: doc.id,
          nickname: doc.data().nickname
        }));

        setChildren(childrenData);

        // Sélection par défaut
        const childFromUrl = searchParams.get('childId');
        if (childFromUrl) {
          const found = childrenData.find(c => c.tokenId === childFromUrl);
          if (found) setSelectedChild(found);
        } else if (childrenData.length === 1) {
          setSelectedChild(childrenData[0]);
        }
      } catch (err) {
        console.error('Erreur chargement enfants:', err);
      }
    };

    loadChildren();
  }, [navigate, searchParams]);

  // Initialiser la reconnaissance vocale
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();

      // On mobile, continuous mode doesn't work well - use single shot and restart
      recognitionRef.current.continuous = !isMobile;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'fr-FR';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            // Only add final results to the accumulated text
            finalTranscriptRef.current += transcript + ' ';
          } else {
            // Interim results are just for display preview
            interimTranscript += transcript;
          }
        }

        // Update message with final text + current interim preview
        setMessage(finalTranscriptRef.current + interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Erreur reconnaissance vocale:', event.error);

        // Don't stop on 'no-speech' or 'aborted' errors on mobile - just restart
        if (isMobile && (event.error === 'no-speech' || event.error === 'aborted')) {
          if (isRecordingRef.current) {
            setTimeout(() => {
              try {
                recognitionRef.current?.start();
              } catch (e) {}
            }, 100);
          }
          return;
        }

        setIsRecording(false);
        isRecordingRef.current = false;
      };

      recognitionRef.current.onend = () => {
        // On mobile, restart recognition if still recording
        if (isMobile && isRecordingRef.current) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              setIsRecording(false);
              isRecordingRef.current = false;
            }
          }, 100);
          return;
        }

        setIsRecording(false);
        isRecordingRef.current = false;
        // Ensure we keep only the final transcript
        if (finalTranscriptRef.current) {
          setMessage(finalTranscriptRef.current.trim());
        }
      };
    }

    return () => {
      isRecordingRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [isMobile]);

  const toggleRecording = async () => {
    if (!recognitionRef.current) {
      setError('La dictée vocale n\'est pas disponible sur ce navigateur');
      return;
    }

    if (isRecording) {
      isRecordingRef.current = false;
      recognitionRef.current.stop();
      setIsRecording(false);
      // Keep the final transcript in the message
      setMessage(finalTranscriptRef.current.trim());
    } else {
      // On mobile, request microphone permission first
      if (isMobile) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop the stream immediately - we just needed permission
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
          console.error('Permission micro refusée:', err);
          setError('Veuillez autoriser l\'accès au microphone pour utiliser la dictée vocale');
          return;
        }
      }

      // Initialize with current message content
      finalTranscriptRef.current = message ? message + ' ' : '';

      try {
        recognitionRef.current.start();
        isRecordingRef.current = true;
        setIsRecording(true);
        setError(null);
      } catch (err) {
        console.error('Erreur démarrage reconnaissance:', err);
        setError('Impossible de démarrer la dictée vocale. Réessayez.');
      }
    }
  };

  const handleReformulate = async () => {
    if (!message.trim() || message.length < 5) {
      setError('Le message est trop court pour être reformulé.');
      return;
    }

    setIsReformulating(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/refineText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          mode: 'reformulate'
        })
      });

      if (!response.ok) throw new Error('Erreur reformulation');

      const data = await response.json();
      setReformulatedMessage(data.refined || data.text);
      setShowReformulated(true);
    } catch (err) {
      console.error('Erreur reformulation:', err);
      setError('Impossible de reformuler le message. Réessayez.');
    } finally {
      setIsReformulating(false);
    }
  };

  const useReformulated = () => {
    setMessage(reformulatedMessage);
    setShowReformulated(false);
  };

  const handleSend = async () => {
    if (!selectedChild) {
      setError('Veuillez sélectionner un enfant');
      return;
    }

    if (!message.trim()) {
      setError('Le message ne peut pas être vide');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');

      const messagesRef = collection(db, 'messages');
      await addDoc(messagesRef, {
        tokenId: selectedChild.tokenId,
        childNickname: selectedChild.nickname,
        parentUid: user.uid,
        parentEmail: user.email,
        content: message,
        status: 'sent',
        createdAt: serverTimestamp()
      });

      setIsSent(true);
      setTimeout(() => navigate('/espace/messages'), 2500);

    } catch (err) {
      console.error('Erreur envoi:', err);
      setError('Impossible d\'envoyer le message. Réessayez.');
      setIsSending(false);
    }
  };

  if (isSent) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-24 h-24 bg-green-100 rounded-[2rem] flex items-center justify-center mx-auto shadow-premium transform rotate-6">
            <Check className="w-12 h-12 text-green-500" />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Message envoyé !</h2>
            <p className="text-gray-500 mt-2 font-medium">Votre demande est en route vers le cabinet.</p>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-4">Redirection vers l'historique...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF0] pb-32">
      {/* Premium Header */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-orange-50 rounded-xl transition-colors text-gray-400"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Nouveau Message</h1>
            {selectedChild && (
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                Pour {selectedChild.nickname}
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-6">
        {/* Child Selector (if multi) */}
        {children.length > 1 && (
          <div className="space-y-2">
             <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest font-sans">Enfant concerné</label>
             <div className="relative">
                <button
                  onClick={() => setShowChildSelector(!showChildSelector)}
                  className="w-full h-14 bg-white rounded-2xl border-2 border-gray-100 px-4 flex items-center justify-between group shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                      <Baby size={18} />
                    </div>
                    <span className="font-bold text-gray-700">
                      {selectedChild?.nickname || 'Sélectionner...'}
                    </span>
                  </div>
                  <ChevronDown size={18} className={`text-gray-400 transition-transform ${showChildSelector ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showChildSelector && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-premium z-50 overflow-hidden"
                    >
                      {children.map((child) => (
                        <button
                          key={child.tokenId}
                          onClick={() => {
                            setSelectedChild(child);
                            setShowChildSelector(false);
                          }}
                          className={`w-full p-4 flex items-center gap-3 hover:bg-orange-50 transition-colors ${
                            selectedChild?.tokenId === child.tokenId ? 'bg-orange-50' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            selectedChild?.tokenId === child.tokenId ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <User size={16} />
                          </div>
                          <span className="font-bold text-gray-700">{child.nickname}</span>
                          {selectedChild?.tokenId === child.tokenId && <Check size={16} className="text-orange-500 ml-auto" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>
          </div>
        )}

        {/* Message Area */}
        <div className="space-y-2 relative">
          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Votre Message</label>
          <div className={`glass rounded-[2rem] p-4 border-2 transition-all duration-300 shadow-glass min-h-[240px] flex flex-col ${isRecording ? 'border-red-400 bg-red-50/30' : 'border-white focus-within:border-orange-200 focus-within:bg-orange-50/10'}`}>
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                // Sync finalTranscriptRef when user types manually
                if (!isRecording) {
                  finalTranscriptRef.current = e.target.value;
                }
              }}
              placeholder="Écrivez ici... n'hésitez pas à utiliser la dictée vocale !"
              className="flex-1 w-full bg-transparent resize-none focus:outline-none font-medium text-gray-700 placeholder:text-gray-300 leading-relaxed min-h-[160px]"
            />
            
            <div className="flex items-center justify-between pt-4 border-t border-black/5">
              <div className="flex gap-2">
                <button
                  onClick={toggleRecording}
                  className={`p-3 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-gray-100 text-gray-400 hover:text-orange-500'}`}
                >
                  {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                  onClick={() => {
                    setMessage('');
                    finalTranscriptRef.current = '';
                  }}
                  className="p-3 bg-gray-100 text-gray-400 hover:text-red-500 rounded-xl transition-all"
                  title="Effacer"
                >
                  <Eraser size={20} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                 {isReformulating ? (
                    <div className="flex items-center gap-2 text-orange-500">
                       <Loader2 size={16} className="animate-spin" />
                       <span className="text-[10px] uppercase font-bold tracking-widest">Réflexion...</span>
                    </div>
                 ) : (
                    <button
                      onClick={handleReformulate}
                      disabled={message.length < 10}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-all font-bold text-xs"
                    >
                      <Sparkles size={16} />
                      Reformuler
                    </button>
                 )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Suggestion Card */}
        <AnimatePresence>
          {showReformulated && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-indigo-600 rounded-[2rem] p-6 shadow-premium relative overflow-hidden"
            >
              <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-200" />
                  <span className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest">Suggestion de Parent'aile</span>
                </div>
                <p className="text-white font-medium leading-relaxed italic">"{reformulatedMessage}"</p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={useReformulated}
                    className="flex-1 h-12 bg-white text-indigo-600 rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-50 transition-colors"
                  >
                    Utiliser cette version
                  </button>
                  <button
                    onClick={() => setShowReformulated(false)}
                    className="h-12 px-4 bg-indigo-500/50 text-white rounded-2xl font-bold text-sm hover:bg-indigo-500 transition-colors"
                  >
                    Garder l'original
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm font-bold"
          >
            {error}
          </motion.div>
        )}

        {/* Send Button */}
        <div className="pt-4">
          <button
            onClick={handleSend}
            disabled={isSending || !selectedChild || !message.trim()}
            className="w-full h-16 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:bg-gray-300 rounded-[1.5rem] shadow-premium flex items-center justify-center gap-3 transition-all group"
          >
            {isSending ? (
              <Loader2 className="animate-spin text-white" />
            ) : (
              <>
                <Send size={24} className="text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                <span className="text-white font-extrabold text-lg">Envoyer au cabinet</span>
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-4">
            Le médecin vous répondra par email.
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default MessageComposer;

