import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Sparkles,
  Send,
  Loader2,
  Check,
  Eraser,
  Calendar,
  Clock,
  Users,
  BookOpen,
  Heart,
  Brain,
  GraduationCap,
  HelpCircle,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Star,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { auth, db } from '../../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { canUseRefinement, getRemainingUses, incrementUsage, isAdminUser } from '../../../lib/rateLimiting';
import { createGroupeParole } from '../../../lib/groupeParoleService';
import type { ThemeGroupe, StructureEtape } from '../../../types/groupeParole';
import { THEME_LABELS, THEME_COLORS, THEME_SHORT_LABELS, STRUCTURE_DEFAUT } from '../../../types/groupeParole';

interface CreateGroupeParoleProps {
  onBack: () => void;
}

const THEME_ICONS: Record<ThemeGroupe, React.ElementType> = {
  ecole: GraduationCap,
  comportement: BookOpen,
  emotions: Heart,
  developpement: Brain,
  autre: HelpCircle,
};

export const CreateGroupeParole: React.FC<CreateGroupeParoleProps> = ({ onBack }) => {
  // Form state
  const [description, setDescription] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<ThemeGroupe | null>(null);
  const [titre, setTitre] = useState('');
  const [dateVocal, setDateVocal] = useState('');
  const [heureVocal, setHeureVocal] = useState('20:30');
  const [structureType, setStructureType] = useState<'libre' | 'structuree'>('libre');
  const [structure, setStructure] = useState<StructureEtape[]>(
    STRUCTURE_DEFAUT.map(s => ({ ...s }))
  );
  const [currentStep, setCurrentStep] = useState(1);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Reformulation
  const [isReformulating, setIsReformulating] = useState(false);
  const [reformulatedText, setReformulatedText] = useState('');
  const [showReformulated, setShowReformulated] = useState(false);

  // Title suggestion
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);

  // Submit
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Init voice recognition (pattern from MessageComposer) ---
  useEffect(() => {
    const hasSupport = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setVoiceSupported(hasSupport);

    if (hasSupport) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
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
        setDescription(finalTranscriptRef.current + interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        if (isMobile && (event.error === 'no-speech' || event.error === 'aborted')) {
          if (isRecordingRef.current) {
            setTimeout(() => {
              try { recognitionRef.current?.start(); } catch {}
            }, 100);
          }
          return;
        }
        setIsRecording(false);
        isRecordingRef.current = false;
      };

      recognitionRef.current.onend = () => {
        if (isMobile && isRecordingRef.current) {
          setTimeout(() => {
            try { recognitionRef.current?.start(); } catch {
              setIsRecording(false);
              isRecordingRef.current = false;
            }
          }, 100);
          return;
        }
        setIsRecording(false);
        isRecordingRef.current = false;
        if (finalTranscriptRef.current) {
          setDescription(finalTranscriptRef.current.trim());
        }
      };
    }

    return () => {
      isRecordingRef.current = false;
      try { recognitionRef.current?.stop(); } catch {}
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
      setDescription(finalTranscriptRef.current.trim());
    } else {
      if (isMobile) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch {
          setError('Veuillez autoriser l\'accès au microphone');
          return;
        }
      }
      finalTranscriptRef.current = description ? description + ' ' : '';
      try {
        recognitionRef.current.start();
        isRecordingRef.current = true;
        setIsRecording(true);
        setError(null);
      } catch {
        setError('Impossible de démarrer la dictée vocale. Réessayez.');
      }
    }
  };

  // --- Reformulation (pattern from MessageComposer) ---
  const handleReformulate = async () => {
    if (!description.trim() || description.length < 10) {
      setError('Le texte est trop court pour être reformulé.');
      return;
    }

    const userEmail = auth.currentUser?.email;
    if (!canUseRefinement(userEmail)) {
      setError('Vous avez atteint la limite de 2 reformulations par jour.');
      return;
    }

    setIsReformulating(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/refineText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: description, mode: 'reformulate' }),
      });

      if (!response.ok) throw new Error('Erreur reformulation');

      const data = await response.json();
      setReformulatedText(data.refinedText || data.refined || data.text);
      setShowReformulated(true);

      if (!isAdminUser(userEmail)) {
        incrementUsage();
      }
    } catch {
      setError('Impossible de reformuler. Réessayez.');
    } finally {
      setIsReformulating(false);
    }
  };

  const useReformulated = () => {
    setDescription(reformulatedText);
    setShowReformulated(false);
  };

  // --- Title suggestion ---
  const handleSuggestTitle = async () => {
    if (!description.trim() || description.length < 10 || !selectedTheme) {
      setError('Remplissez d\'abord la description et le thème.');
      return;
    }

    setIsSuggestingTitle(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/suggestGroupTitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          theme: THEME_LABELS[selectedTheme],
        }),
      });

      if (!response.ok) throw new Error('Erreur suggestion');

      const data = await response.json();
      setTitre(data.title || '');
    } catch {
      setError('Impossible de suggérer un titre. Vous pouvez l\'écrire vous-même.');
    } finally {
      setIsSuggestingTitle(false);
    }
  };

  // --- Validation ---
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const isFormValid = () => {
    return (
      description.trim().length >= 20 &&
      selectedTheme !== null &&
      titre.trim().length >= 5 &&
      titre.trim().length <= 80 &&
      dateVocal !== '' &&
      heureVocal !== ''
    );
  };

  // --- Structure helpers ---
  const MAX_TOTAL_MINUTES = 45;
  const MIN_PHASE_MINUTES = 3;
  const MAX_PHASES = 7;

  const PHASES_SUGGEREES = [
    'Présentations', 'Partage du vécu', 'Tour de parole', 'Discussion libre',
    'Clôture', 'Questions / Réponses', 'Activité guidée', 'Méditation / Respiration',
  ];

  const updateStructureEtape = (index: number, field: keyof StructureEtape, value: string | number) => {
    if (field === 'dureeMinutes') {
      const numValue = value as number;
      if (numValue < MIN_PHASE_MINUTES) return;
      // Check if increasing would exceed max
      const currentTotal = structure.reduce((sum, s, i) => sum + (i === index ? 0 : s.dureeMinutes), 0);
      if (currentTotal + numValue > MAX_TOTAL_MINUTES) return;
    }
    setStructure(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const [structureToast, setStructureToast] = useState<string | null>(null);

  const addPhase = (label: string = 'Nouvelle étape') => {
    if (structure.length >= MAX_PHASES) return;
    const newPhaseDuration = 5;
    const currentTotal = structure.reduce((sum, s) => sum + s.dureeMinutes, 0);
    const remaining = MAX_TOTAL_MINUTES - currentTotal;

    if (remaining >= newPhaseDuration) {
      // Enough room — just add
      setStructure(prev => [...prev, { label, dureeMinutes: newPhaseDuration }]);
    } else {
      // Need to redistribute: reduce other phases proportionally
      const deficit = newPhaseDuration - remaining;
      const reducibleTotal = structure.reduce((sum, s) => sum + Math.max(0, s.dureeMinutes - MIN_PHASE_MINUTES), 0);
      if (reducibleTotal < deficit) return; // Can't reduce enough

      let toReduce = deficit;
      const adjusted = structure.map(s => {
        if (toReduce <= 0) return s;
        const canReduce = s.dureeMinutes - MIN_PHASE_MINUTES;
        const reduction = Math.min(canReduce, Math.ceil(toReduce * (canReduce / reducibleTotal)));
        toReduce -= reduction;
        return { ...s, dureeMinutes: s.dureeMinutes - reduction };
      });
      // Fix rounding: if toReduce > 0, take from the longest phase
      if (toReduce > 0) {
        const longestIdx = adjusted.reduce((maxI, s, i, arr) => s.dureeMinutes > arr[maxI].dureeMinutes ? i : maxI, 0);
        adjusted[longestIdx] = { ...adjusted[longestIdx], dureeMinutes: adjusted[longestIdx].dureeMinutes - toReduce };
      }
      setStructure([...adjusted, { label, dureeMinutes: newPhaseDuration }]);
      setStructureToast('Durées ajustées pour rester à 45 min');
      setTimeout(() => setStructureToast(null), 3000);
    }
  };

  const removePhase = (index: number) => {
    if (structure.length <= 1) return;
    setStructure(prev => prev.filter((_, i) => i !== index));
  };

  const movePhase = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= structure.length) return;
    setStructure(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const totalMinutes = structure.reduce((sum, s) => sum + s.dureeMinutes, 0);
  const remainingMinutes = MAX_TOTAL_MINUTES - totalMinutes;
  const canAddPhase = structure.length < MAX_PHASES;

  // --- Submit ---
  const handlePublish = async () => {
    if (!isFormValid()) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('Vous devez être connecté pour créer un groupe.');
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      // Get user pseudo
      const accountDoc = await getDoc(doc(db, 'accounts', user.uid));
      const pseudo = accountDoc.exists() ? (accountDoc.data().pseudo || 'Parent') : 'Parent';

      const dateTime = new Date(`${dateVocal}T${heureVocal}:00`);

      await createGroupeParole({
        titre: titre.trim(),
        description: description.trim(),
        theme: selectedTheme!,
        createurUid: user.uid,
        createurPseudo: pseudo,
        dateVocal: dateTime,
        structureType,
        ...(structureType === 'structuree' ? { structure } : {}),
      });

      setIsPublished(true);
      setTimeout(() => onBack(), 2500);
    } catch (err) {
      console.error('Erreur création groupe:', err);
      setError('Impossible de créer le groupe. Réessayez.');
      setIsPublishing(false);
    }
  };

  // --- Success screen ---
  if (isPublished) {
    return createPortal(
      <div className="fixed inset-0 bg-[#FFFBF0] flex items-center justify-center p-6 z-[100]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-24 h-24 bg-green-100 rounded-[2rem] flex items-center justify-center mx-auto shadow-premium transform rotate-6">
            <Check className="w-12 h-12 text-green-500" />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Groupe créé !</h2>
            <p className="text-gray-500 mt-2 font-medium">Votre groupe de parole est maintenant visible.</p>
          </div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-4">Retour aux groupes...</p>
        </motion.div>
      </div>,
      document.body
    );
  }

  // --- Main form ---
  return createPortal(
    <div className="fixed inset-0 bg-[#FFFBF0] overflow-y-auto pb-32 z-[100]">
      {/* Header sticky */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-orange-100">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-orange-50 rounded-xl transition-colors text-gray-400"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Créer un groupe</h1>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">Étape {currentStep} sur 4 : {
              currentStep === 1 ? 'La situation' :
              currentStep === 2 ? 'Thème et titre' :
              currentStep === 3 ? 'Organisation' :
              'Récapitulatif'
            }</p>
          </div>
        </div>
        {/* Barre de progression */}
        <div className="w-full h-1 bg-orange-100 relative">
          <motion.div 
            initial={false}
            animate={{ width: `${(currentStep / 4) * 100}%` }}
            className="absolute top-0 left-0 h-full bg-orange-500 transition-all duration-500"
          />
        </div>
      </div>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-8">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 pb-32"
            >
              {/* ====== SECTION 1 : Description ====== */}
              <section className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Décrivez votre situation</label>
                  <p className="text-[11px] text-gray-400 font-medium ml-1 mt-0.5">
                    Pas besoin d'être parfait, écrivez comme vous le ressentez.
                  </p>
                </div>

                <div className={`glass rounded-[2rem] p-4 border-2 transition-all duration-300 shadow-glass min-h-[200px] flex flex-col ${isRecording ? 'border-red-400 bg-red-50/30' : 'border-white focus-within:border-orange-200 focus-within:bg-orange-50/10'}`}>
                  <textarea
                    ref={textareaRef}
                    value={description}
                    spellCheck={true}
                    lang="fr-FR"
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (!isRecording) finalTranscriptRef.current = e.target.value;
                    }}
                    placeholder="Mon enfant traverse une période difficile avec..."
                    className="flex-1 w-full bg-transparent resize-none focus:outline-none font-medium text-gray-700 placeholder:text-gray-300 leading-relaxed min-h-[140px] text-base"
                    style={{ fontSize: '16px' }}
                  />

                  {isRecording && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2 text-red-500">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-xs font-bold">Enregistrement en cours...</span>
                    </motion.div>
                  )}

                  <div className="text-right text-[10px] text-gray-400 font-medium">
                    {description.length} caractère{description.length > 1 ? 's' : ''}
                    {description.length > 0 && description.length < 20 && (
                      <span className="text-orange-400 ml-2">min. 20</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-black/5">
                    <div className="flex gap-2">
                      {voiceSupported ? (
                        <button
                          onClick={toggleRecording}
                          className={`p-3 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-gray-100 text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}
                        >
                          {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                      ) : (
                        <div className="p-3 rounded-xl bg-gray-100 text-gray-300 cursor-not-allowed" title="Non disponible">
                          <Mic size={20} />
                        </div>
                      )}
                      <button
                        onClick={() => { setDescription(''); finalTranscriptRef.current = ''; textareaRef.current?.focus(); }}
                        className="p-3 bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Eraser size={20} />
                      </button>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {isReformulating ? (
                        <div className="flex items-center gap-2 text-orange-500">
                          <Loader2 size={16} className="animate-spin" />
                          <span className="text-[10px] uppercase font-bold tracking-widest">Réflexion...</span>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={handleReformulate}
                            disabled={description.length < 10 || !canUseRefinement(auth.currentUser?.email)}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-all font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Sparkles size={16} />
                            Reformuler
                          </button>
                          {!isAdminUser(auth.currentUser?.email) && (
                            <span className="text-[9px] text-gray-400">
                              {getRemainingUses(auth.currentUser?.email)}/2 restantes
                            </span>
                          )}
                        </>
                      )}
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
                          <span className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest">Suggestion</span>
                        </div>
                        <p className="text-white font-medium leading-relaxed italic">"{reformulatedText}"</p>
                        <div className="flex gap-2 pt-2">
                          <button onClick={useReformulated} className="flex-1 h-12 bg-white text-indigo-600 rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-50 transition-colors">
                            Utiliser cette version
                          </button>
                          <button onClick={() => setShowReformulated(false)} className="h-12 px-4 bg-indigo-500/50 text-white rounded-2xl font-bold text-sm hover:bg-indigo-500 transition-colors">
                            Garder l'original
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 pb-32"
            >
              {/* ====== SECTION 2 : Thème ====== */}
              <section className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Quel est le thème ?</label>

                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(THEME_LABELS) as ThemeGroupe[]).map((theme) => {
                    const colors = THEME_COLORS[theme];
                    const Icon = THEME_ICONS[theme];
                    const isSelected = selectedTheme === theme;

                    return (
                      <button
                        key={theme}
                        onClick={() => setSelectedTheme(theme)}
                        className={`
                          relative p-4 rounded-2xl transition-all text-left flex items-center gap-3
                          ${isSelected
                            ? `${colors.light} border-2 ${colors.text} shadow-sm`
                            : 'bg-white/50 border-2 border-gray-100/60 hover:bg-white/70'
                          }
                        `}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? colors.bg : 'bg-gray-100'}`}>
                          <Icon size={18} className={isSelected ? 'text-white' : 'text-gray-400'} />
                        </div>
                        <span className={`text-xs font-bold leading-tight ${isSelected ? 'text-gray-800' : 'text-gray-500'}`}>
                          {THEME_SHORT_LABELS[theme]}
                        </span>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-2 right-2"
                          >
                            <div className={`w-5 h-5 ${colors.bg} rounded-full flex items-center justify-center`}>
                              <Check size={12} className="text-white" />
                            </div>
                          </motion.div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ====== SECTION 3 : Titre ====== */}
              <section className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Donnez un titre à votre groupe</label>

                <div className="glass rounded-2xl border-2 border-white focus-within:border-orange-200 shadow-glass overflow-hidden">
                  <input
                    type="text"
                    value={titre}
                    onChange={(e) => setTitre(e.target.value.slice(0, 80))}
                    placeholder={selectedTheme
                      ? `Ex: ${selectedTheme === 'ecole' ? 'Mon enfant refuse l\'école' : selectedTheme === 'comportement' ? 'Gérer les crises de colère' : selectedTheme === 'emotions' ? 'Aider mon enfant à s\'exprimer' : selectedTheme === 'developpement' ? 'Retard de langage, que faire ?' : 'Partage d\'expérience entre parents'}`
                      : 'Titre de votre groupe...'
                    }
                    className="w-full px-4 py-4 bg-transparent focus:outline-none font-bold text-gray-700 placeholder:text-gray-300 text-sm"
                    style={{ fontSize: '16px' }}
                  />
                </div>

                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] text-gray-400 font-medium">
                    {titre.length}/80 caractères
                    {titre.length > 0 && titre.length < 5 && <span className="text-orange-400 ml-2">min. 5</span>}
                  </span>

                  <button
                    onClick={handleSuggestTitle}
                    disabled={isSuggestingTitle || description.length < 10 || !selectedTheme}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSuggestingTitle ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Sparkles size={12} />
                    )}
                    Suggérer un titre
                  </button>
                </div>
              </section>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 pb-32"
            >
              {/* ====== SECTION 4 : Date/Heure ====== */}
              <section className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Quand organiser le vocal ?</label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="glass rounded-2xl border-2 border-white focus-within:border-orange-200 shadow-glass p-3 flex items-center gap-3">
                    <Calendar size={18} className="text-orange-400 flex-shrink-0" />
                    <input
                      type="date"
                      value={dateVocal}
                      onChange={(e) => setDateVocal(e.target.value)}
                      min={getMinDate()}
                      className="w-full bg-transparent focus:outline-none font-bold text-gray-700 text-sm"
                      style={{ fontSize: '16px' }}
                    />
                  </div>

                  <div className="glass rounded-2xl border-2 border-white focus-within:border-orange-200 shadow-glass p-3 flex items-center gap-3">
                    <Clock size={18} className="text-orange-400 flex-shrink-0" />
                    <input
                      type="time"
                      value={heureVocal}
                      onChange={(e) => setHeureVocal(e.target.value)}
                      className="w-full bg-transparent focus:outline-none font-bold text-gray-700 text-sm"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 font-medium ml-1">
                  Le groupe vocal dure environ 45 minutes. Minimum 24h à l'avance.
                </p>
              </section>

              {/* ====== SECTION 5 : Organisation ====== */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 ml-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Comment organiser le temps ?</label>
                  <span className="text-[9px] font-bold text-orange-400 bg-orange-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Facultatif</span>
                </div>

                <div className="space-y-3">
                  {/* Option Libre */}
                  <button
                    onClick={() => setStructureType('libre')}
                    className={`w-full p-4 rounded-2xl text-left transition-all flex items-center gap-3 ${
                      structureType === 'libre'
                        ? 'bg-orange-50 border-2 border-orange-200 shadow-sm'
                        : 'bg-white/50 border-2 border-gray-100/60'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      structureType === 'libre' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                    }`}>
                      {structureType === 'libre' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Groupe libre</p>
                      <p className="text-[10px] text-gray-400 font-medium">Discussion naturelle sans contrainte</p>
                    </div>
                  </button>

                  {/* Option Structurée */}
                  <button
                    onClick={() => setStructureType('structuree')}
                    className={`w-full p-4 rounded-2xl text-left transition-all flex items-center gap-3 ${
                      structureType === 'structuree'
                        ? 'bg-orange-50 border-2 border-orange-200 shadow-sm'
                        : 'bg-white/50 border-2 border-gray-100/60'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      structureType === 'structuree' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                    }`}>
                      {structureType === 'structuree' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800">Avec une structure</p>
                        <span className="flex items-center gap-0.5 text-[8px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full uppercase">
                          <Star size={8} className="fill-amber-500 text-amber-500" />
                          Recommandé
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium">Un cadre proposé pour guider les échanges</p>
                    </div>
                  </button>
                </div>

                {/* Structure éditable */}
                <AnimatePresence>
                  {structureType === 'structuree' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="glass rounded-2xl border-2 border-white shadow-glass p-4 space-y-3">
                        {structure.map((etape, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            {/* Move up/down */}
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => movePhase(index, 'up')}
                                disabled={index === 0}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                  index === 0 ? 'text-gray-200' : 'text-gray-400 hover:bg-gray-100 active:scale-90'
                                }`}
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                onClick={() => movePhase(index, 'down')}
                                disabled={index === structure.length - 1}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                  index === structure.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:bg-gray-100 active:scale-90'
                                }`}
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={etape.label}
                              onChange={(e) => updateStructureEtape(index, 'label', e.target.value)}
                              className="flex-1 bg-white/60 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 border border-gray-100"
                              style={{ fontSize: '14px' }}
                              placeholder="Nom de l'étape"
                            />
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateStructureEtape(index, 'dureeMinutes', etape.dureeMinutes - 1)}
                                disabled={etape.dureeMinutes <= MIN_PHASE_MINUTES}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                  etape.dureeMinutes <= MIN_PHASE_MINUTES ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                              >
                                <Minus size={14} />
                              </button>
                              <span className="text-xs font-bold text-gray-600 w-10 text-center">{etape.dureeMinutes}min</span>
                              <button
                                onClick={() => updateStructureEtape(index, 'dureeMinutes', etape.dureeMinutes + 1)}
                                disabled={remainingMinutes <= 0}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                  remainingMinutes <= 0 ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            {structure.length > 1 && (
                              <button
                                onClick={() => removePhase(index)}
                                className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Toast redistribution */}
                        <AnimatePresence>
                          {structureToast && (
                            <motion.p
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="text-[10px] font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg text-center"
                            >
                              {structureToast}
                            </motion.p>
                          )}
                        </AnimatePresence>

                        {/* Ajouter une étape */}
                        {canAddPhase && (
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Ajouter une étape</p>
                            <div className="flex flex-wrap gap-1.5">
                              {PHASES_SUGGEREES
                                .filter(p => !structure.some(s => s.label === p))
                                .map(phase => (
                                  <button
                                    key={phase}
                                    onClick={() => addPhase(phase)}
                                    className="text-[11px] font-semibold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full hover:bg-orange-100 transition-colors border border-orange-100"
                                  >
                                    + {phase}
                                  </button>
                                ))}
                              <button
                                onClick={() => addPhase('Nouvelle étape')}
                                className="text-[11px] font-semibold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full hover:bg-gray-100 transition-colors border border-gray-200"
                              >
                                + Personnalisée
                              </button>
                            </div>
                          </div>
                        )}
                        {!canAddPhase && structure.length >= MAX_PHASES && (
                          <p className="text-[10px] text-gray-400 text-center pt-2 border-t border-gray-100">
                            Maximum {MAX_PHASES} étapes atteint
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <div>
                            <span className={`text-xs font-bold ${
                              totalMinutes === MAX_TOTAL_MINUTES ? 'text-emerald-600' :
                              totalMinutes > MAX_TOTAL_MINUTES ? 'text-red-500' : 'text-orange-500'
                            }`}>
                              Total : {totalMinutes} / {MAX_TOTAL_MINUTES} min
                            </span>
                            {remainingMinutes > 0 && (
                              <span className="text-[10px] text-gray-400 ml-2">({remainingMinutes} min restantes)</span>
                            )}
                          </div>
                          <button
                            onClick={() => setStructure(STRUCTURE_DEFAUT.map(s => ({ ...s })))}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <RotateCcw size={12} />
                            Réinitialiser
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 pb-32"
            >
              {/* ====== SECTION 6 : Prévisualisation + Publish ====== */}
              <section className="space-y-4">
                {/* Preview card */}
                {selectedTheme && titre.trim() && dateVocal && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 tracking-widest">Votre groupe ressemblera à ça</label>
                    <div className="glass rounded-3xl border border-white/60 shadow-glass overflow-hidden">
                      <div className={`${THEME_COLORS[selectedTheme].bg} px-4 py-2.5`}>
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                          {THEME_SHORT_LABELS[selectedTheme]}
                        </span>
                      </div>
                      <div className="p-4 space-y-2">
                        <h3 className="text-sm font-extrabold text-gray-800">{titre}</h3>
                        <p className="text-[10px] text-gray-400 font-semibold">Créé par vous</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 ${THEME_COLORS[selectedTheme].light} rounded-lg flex items-center justify-center`}>
                            <Users size={14} className={THEME_COLORS[selectedTheme].text} />
                          </div>
                          <span className="text-xs font-bold text-gray-700">1 / 5</span>
                          <span className="text-[10px] font-semibold text-emerald-600">4 places</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
                            <Mic size={14} className="text-orange-500" />
                          </div>
                          <span className="text-xs font-semibold text-gray-600">
                            {new Date(`${dateVocal}T${heureVocal}`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à {heureVocal}
                          </span>
                          <span className="text-[9px] font-bold bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full ml-auto">À venir</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm font-bold"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Barre de navigation bas */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-orange-100 flex gap-4 z-[60] max-w-md mx-auto shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          {currentStep > 1 && (
            <button
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex-1 h-14 glass text-gray-600 rounded-2xl font-bold transition-all active:scale-95"
            >
              Précédent
            </button>
          )}
          
          {currentStep < 4 ? (
            <button
              onClick={() => {
                if (currentStep === 1) {
                  if (description.trim().length < 20) {
                    setError("Décrivez davantage votre situation (min. 20 car.)");
                    return;
                  }
                } else if (currentStep === 2) {
                  if (!selectedTheme || titre.trim().length < 5) {
                    setError("Veuillez choisir un thème et un titre (min. 5 car.)");
                    return;
                  }
                } else if (currentStep === 3) {
                  if (!dateVocal || !heureVocal) {
                    setError("Veuillez choisir une date et une heure valides.");
                    return;
                  }
                }
                setError(null);
                setCurrentStep(prev => prev + 1);
              }}
              className={`bg-orange-500 text-white rounded-2xl font-extrabold transition-all active:scale-95 shadow-premium ${currentStep === 1 ? 'w-full' : 'flex-1'} h-14`}
            >
              Continuer
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={isPublishing || !isFormValid()}
              className="flex-[2] h-14 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:bg-gray-300 rounded-2xl shadow-premium flex items-center justify-center gap-3 transition-all group"
            >
              {isPublishing ? (
                <Loader2 className="animate-spin text-white" />
              ) : (
                <>
                  <Send size={20} className="text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  <span className="text-white font-extrabold text-lg">Publier</span>
                </>
              )}
            </button>
          )}
        </div>
      </main>
    </div>,
    document.body
  );
};

export default CreateGroupeParole;
