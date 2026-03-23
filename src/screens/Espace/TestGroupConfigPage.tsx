import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  Check,
  Minus,
  Plus,
  RotateCcw,
  GraduationCap,
  BookOpen,
  Heart,
  Brain,
  HelpCircle,
  Settings,
  Crown,
  UserCheck,
  Users,
  Clock,
  Zap,
  AlertTriangle,
  Trash2,
  Play,
  Pause,
  XCircle,
  Radio,
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { updateTestGroup, resetTestGroup, addFakePresences, simulateSessionState } from '../../lib/groupeParoleService';
import type { ThemeGroupe, StructureEtape } from '../../types/groupeParole';
import { THEME_LABELS, STRUCTURE_DEFAUT } from '../../types/groupeParole';

const THEME_ICONS: Record<ThemeGroupe, React.ElementType> = {
  ecole: GraduationCap,
  comportement: BookOpen,
  emotions: Heart,
  developpement: Brain,
  autre: HelpCircle,
};

const TEST_GROUP_ID = 'groupe-test-vocal';

type DateVocalMode = 'now' | 'in_minutes' | 'already_started' | 'far_future';
type GroupeStatus = '' | 'scheduled' | 'in_progress' | 'cancelled' | 'completed';

// ========== Quick Scenario Presets ==========
interface QuickScenario {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  apply: () => void;
}

export const TestGroupConfigPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Config state
  const [titre, setTitre] = useState('Salle de test vocal');
  const [theme, setTheme] = useState<ThemeGroupe>('autre');
  const [structureType, setStructureType] = useState<'libre' | 'structuree'>('libre');
  const [structure, setStructure] = useState<StructureEtape[]>(STRUCTURE_DEFAUT);
  const [durationMin, setDurationMin] = useState(5);
  const [role, setRole] = useState<'animateur' | 'invite'>('animateur');

  // New controls
  const [dateVocalMode, setDateVocalMode] = useState<DateVocalMode>('now');
  const [minutesOffset, setMinutesOffset] = useState(15);
  const [fakeParticipants, setFakeParticipants] = useState(3);
  const [fakePresences, setFakePresences] = useState(0);
  const [status, setStatus] = useState<GroupeStatus>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  };

  // Load current config
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'groupes', TEST_GROUP_ID));
        if (snap.exists()) {
          const d = snap.data();
          setTitre(d.titre || 'Salle de test vocal');
          setTheme(d.theme || 'autre');
          setStructureType(d.structureType || 'libre');
          if (d.structureType === 'structuree' && d.structure) {
            setStructure(d.structure);
          }
          if (d.durationMin) setDurationMin(d.durationMin);
          const currentUid = auth.currentUser?.uid;
          if (currentUid && d.createurUid === currentUid) {
            setRole('animateur');
          } else {
            setRole('animateur');
          }
          if (d.status) setStatus(d.status);
        }
      } catch (e) {
        console.warn('[TestConfig] Erreur chargement:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalStructuredMin = structure.reduce((sum, s) => sum + s.dureeMinutes, 0);

  const computeDateVocal = (): Date => {
    const now = new Date();
    switch (dateVocalMode) {
      case 'now':
        return now;
      case 'in_minutes':
        return new Date(now.getTime() + minutesOffset * 60 * 1000);
      case 'already_started':
        return new Date(now.getTime() - minutesOffset * 60 * 1000);
      case 'far_future':
        return new Date('2027-01-01T00:00:00');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentUid = auth.currentUser?.uid;
      const pseudoSnap = currentUid ? await getDoc(doc(db, 'accounts', currentUid)) : null;
      const pseudo = pseudoSnap?.data()?.pseudo || 'Parent';

      await updateTestGroup({
        theme,
        structureType,
        structure: structureType === 'structuree' ? structure : undefined,
        durationMin: structureType === 'libre' ? durationMin : undefined,
        titre,
        createurUid: role === 'animateur' && currentUid ? currentUid : '__test__',
        createurPseudo: role === 'animateur' ? pseudo : 'Systeme',
        dateVocal: computeDateVocal(),
        status: status || undefined,
        fakeParticipantCount: fakeParticipants,
      });

      // Add fake presences if requested
      if (fakePresences > 0) {
        await addFakePresences(fakePresences);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      showToast('Configuration appliquee !');
    } catch (e) {
      console.error('[TestConfig] Erreur sauvegarde:', e);
      showToast('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetTestGroup();
      setFakeParticipants(0);
      setFakePresences(0);
      setStatus('');
      setDateVocalMode('now');
      showToast('Groupe test reinitialise !');
    } catch (e) {
      console.error('[TestConfig] Erreur reset:', e);
      showToast('Erreur de reset');
    } finally {
      setResetting(false);
    }
  };

  // Quick scenarios
  const applyQuickScenario = async (setup: () => void, extra?: () => Promise<void>) => {
    setup();
    if (extra) await extra();
    showToast('Scenario applique — cliquez "Appliquer"');
  };

  const quickScenarios: QuickScenario[] = [
    {
      label: 'Session normale',
      description: '3 min, 3 participants, maintenant',
      icon: Play,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      apply: () => applyQuickScenario(() => {
        setDateVocalMode('now');
        setDurationMin(3);
        setFakeParticipants(3);
        setFakePresences(0);
        setStatus('');
        setRole('animateur');
        setStructureType('libre');
      }),
    },
    {
      label: 'Animateur absent',
      description: 'Maintenant, 3 participants, role invite',
      icon: AlertTriangle,
      color: 'bg-orange-50 text-orange-600 border-orange-200',
      apply: () => applyQuickScenario(() => {
        setDateVocalMode('now');
        setDurationMin(5);
        setFakeParticipants(3);
        setFakePresences(2);
        setStatus('');
        setRole('invite');
        setStructureType('libre');
      }),
    },
    {
      label: 'Pas assez de monde',
      description: 'Dans 25 min, 2 participants',
      icon: Users,
      color: 'bg-red-50 text-red-600 border-red-200',
      apply: () => applyQuickScenario(() => {
        setDateVocalMode('in_minutes');
        setMinutesOffset(25);
        setDurationMin(5);
        setFakeParticipants(2);
        setFakePresences(0);
        setStatus('');
        setRole('animateur');
      }),
    },
    {
      label: 'Carte prioritaire',
      description: 'Dans 12 min, 4 participants (warm)',
      icon: Radio,
      color: 'bg-sky-50 text-sky-600 border-sky-200',
      apply: () => applyQuickScenario(() => {
        setDateVocalMode('in_minutes');
        setMinutesOffset(12);
        setDurationMin(10);
        setFakeParticipants(4);
        setFakePresences(0);
        setStatus('');
        setRole('animateur');
      }),
    },
    {
      label: 'Session suspendue',
      description: 'En cours, suspension animateur',
      icon: Pause,
      color: 'bg-violet-50 text-violet-600 border-violet-200',
      apply: () => applyQuickScenario(() => {
        setDateVocalMode('already_started');
        setMinutesOffset(5);
        setDurationMin(15);
        setFakeParticipants(4);
        setFakePresences(3);
        setStatus('in_progress');
        setRole('invite');
      }, async () => {
        await simulateSessionState({
          suspended: true,
          suspensionReason: 'animateur_left',
          suspensionCount: 1,
          sessionActive: true,
        });
      }),
    },
    {
      label: 'Groupe annule',
      description: 'Status cancelled',
      icon: XCircle,
      color: 'bg-gray-50 text-gray-600 border-gray-200',
      apply: () => applyQuickScenario(() => {
        setDateVocalMode('now');
        setFakeParticipants(1);
        setFakePresences(0);
        setStatus('cancelled');
        setRole('animateur');
      }),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF0]">
      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-800 text-white text-sm font-bold rounded-2xl shadow-xl"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-white/40 backdrop-blur-xl sticky top-0 z-40 border-b border-white/40 shadow-sm">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-orange-50 rounded-xl transition-colors text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <Settings size={20} className="text-orange-500" />
          <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Config groupe test</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6 pb-32 space-y-6">

        {/* ===== QUICK SCENARIOS ===== */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block flex items-center gap-2">
            <Zap size={14} /> Scenarios rapides
          </label>
          <div className="grid grid-cols-2 gap-2">
            {quickScenarios.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.label}
                  onClick={s.apply}
                  className={`${s.color} border rounded-2xl p-3 text-left transition-all active:scale-[0.97]`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} />
                    <span className="text-xs font-bold">{s.label}</span>
                  </div>
                  <p className="text-[9px] opacity-70 font-medium">{s.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ===== RESET BUTTON ===== */}
        <button
          onClick={handleReset}
          disabled={resetting}
          className="w-full py-3 rounded-2xl bg-red-50 border-2 border-red-200 text-red-600 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
        >
          {resetting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          Reset complet (participants, session, presence, evaluations)
        </button>

        <div className="h-px bg-gray-200/60" />

        {/* ===== DATE VOCAL ===== */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block flex items-center gap-2">
            <Clock size={14} /> Quand commence le groupe
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'now', label: 'Maintenant', desc: 'dateVocal = now' },
              { value: 'in_minutes', label: `Dans ${minutesOffset} min`, desc: 'Futur proche' },
              { value: 'already_started', label: `Il y a ${minutesOffset} min`, desc: 'Deja en cours' },
              { value: 'far_future', label: 'Lointain', desc: '2027 (toujours ouvert)' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateVocalMode(opt.value)}
                className={`p-3 rounded-2xl text-left transition-all border-2 ${
                  dateVocalMode === opt.value
                    ? 'bg-orange-50 border-orange-500'
                    : 'bg-white/50 border-transparent hover:bg-white/80'
                }`}
              >
                <span className={`text-xs font-bold ${dateVocalMode === opt.value ? 'text-orange-600' : 'text-gray-700'}`}>
                  {opt.label}
                </span>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Minutes slider for in_minutes / already_started */}
          {(dateVocalMode === 'in_minutes' || dateVocalMode === 'already_started') && (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setMinutesOffset(Math.max(1, minutesOffset - 1))}
                className="w-8 h-8 rounded-lg bg-white/60 border flex items-center justify-center text-gray-500 active:scale-95"
              >
                <Minus size={14} />
              </button>
              <input
                type="range"
                min={1}
                max={60}
                value={minutesOffset}
                onChange={(e) => setMinutesOffset(Number(e.target.value))}
                className="flex-1 accent-orange-500"
              />
              <button
                onClick={() => setMinutesOffset(Math.min(60, minutesOffset + 1))}
                className="w-8 h-8 rounded-lg bg-white/60 border flex items-center justify-center text-gray-500 active:scale-95"
              >
                <Plus size={14} />
              </button>
              <span className="text-xs font-bold text-gray-600 w-12 text-right">{minutesOffset} min</span>
            </div>
          )}
        </section>

        {/* ===== FAKE PARTICIPANTS ===== */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block flex items-center gap-2">
            <Users size={14} /> Participants fictifs ({fakeParticipants})
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFakeParticipants(Math.max(0, fakeParticipants - 1))}
              className="w-10 h-10 rounded-xl bg-white/60 border flex items-center justify-center text-gray-500 active:scale-95"
            >
              <Minus size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={10}
              value={fakeParticipants}
              onChange={(e) => setFakeParticipants(Number(e.target.value))}
              className="flex-1 accent-orange-500"
            />
            <button
              onClick={() => setFakeParticipants(Math.min(10, fakeParticipants + 1))}
              className="w-10 h-10 rounded-xl bg-white/60 border flex items-center justify-center text-gray-500 active:scale-95"
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 px-1">
            {fakeParticipants < 3
              ? `${fakeParticipants} inscrits — en dessous du seuil minimum (3)`
              : `${fakeParticipants} inscrits — seuil minimum atteint`}
          </p>
        </section>

        {/* ===== FAKE PRESENCES ===== */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block flex items-center gap-2">
            <Radio size={14} /> Presences en ligne ({fakePresences})
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFakePresences(Math.max(0, fakePresences - 1))}
              className="w-10 h-10 rounded-xl bg-white/60 border flex items-center justify-center text-gray-500 active:scale-95"
            >
              <Minus size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={10}
              value={fakePresences}
              onChange={(e) => setFakePresences(Number(e.target.value))}
              className="flex-1 accent-orange-500"
            />
            <button
              onClick={() => setFakePresences(Math.min(10, fakePresences + 1))}
              className="w-10 h-10 rounded-xl bg-white/60 border flex items-center justify-center text-gray-500 active:scale-95"
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 px-1">
            Ecrira {fakePresences} doc(s) dans la subcollection presence (avec moods aleatoires)
          </p>
        </section>

        {/* ===== STATUS ===== */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Status du groupe</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: '', label: 'Aucun (defaut)', color: 'text-gray-600' },
              { value: 'scheduled', label: 'Scheduled', color: 'text-sky-600' },
              { value: 'in_progress', label: 'In Progress', color: 'text-emerald-600' },
              { value: 'cancelled', label: 'Cancelled', color: 'text-red-600' },
            ] as { value: GroupeStatus; label: string; color: string }[]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`py-2.5 rounded-2xl font-bold text-xs transition-all border-2 ${
                  status === opt.value
                    ? 'bg-orange-50 border-orange-500 text-orange-600'
                    : `bg-white/50 border-transparent ${opt.color} hover:bg-white/80`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <div className="h-px bg-gray-200/60" />

        {/* ===== EXISTING CONTROLS ===== */}

        {/* Titre */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Titre</label>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl bg-white/60 border border-white/60 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </section>

        {/* Theme */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Theme</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(THEME_LABELS) as ThemeGroupe[]).map((t) => {
              const Icon = THEME_ICONS[t];
              const active = theme === t;
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all border-2 ${
                    active
                      ? 'bg-orange-50 border-orange-500 shadow-sm'
                      : 'bg-white/50 border-transparent hover:bg-white/80'
                  }`}
                >
                  <Icon size={22} className={active ? 'text-orange-500' : 'text-gray-400'} />
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-orange-600' : 'text-gray-500'}`}>
                    {THEME_LABELS[t].split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Type de structure */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Type de session</label>
          <div className="flex gap-3">
            {(['libre', 'structuree'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setStructureType(type)}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border-2 ${
                  structureType === type
                    ? 'bg-orange-50 border-orange-500 text-orange-600'
                    : 'bg-white/50 border-transparent text-gray-500 hover:bg-white/80'
                }`}
              >
                {type === 'libre' ? 'Libre' : 'Structuree'}
              </button>
            ))}
          </div>
        </section>

        {/* Role */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Mon role</label>
          <div className="flex gap-3">
            <button
              onClick={() => setRole('animateur')}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border-2 flex items-center justify-center gap-2 ${
                role === 'animateur'
                  ? 'bg-orange-50 border-orange-500 text-orange-600'
                  : 'bg-white/50 border-transparent text-gray-500 hover:bg-white/80'
              }`}
            >
              <Crown size={16} />
              Animateur
            </button>
            <button
              onClick={() => setRole('invite')}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border-2 flex items-center justify-center gap-2 ${
                role === 'invite'
                  ? 'bg-orange-50 border-orange-500 text-orange-600'
                  : 'bg-white/50 border-transparent text-gray-500 hover:bg-white/80'
              }`}
            >
              <UserCheck size={16} />
              Invite
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 px-1">
            {role === 'animateur'
              ? 'Vous serez l\'animateur de la session (suggestions, moderation)'
              : 'Le premier participant a rejoindre deviendra l\'animateur'}
          </p>
        </section>

        {/* Duree (mode libre) */}
        {structureType === 'libre' && (
          <section>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">
              Duree ({durationMin} min)
            </label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setDurationMin(Math.max(1, durationMin - 1))}
                className="w-10 h-10 rounded-xl bg-white/60 border border-white/60 flex items-center justify-center text-gray-500 active:scale-95"
              >
                <Minus size={16} />
              </button>
              <input
                type="range"
                min={1}
                max={60}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="flex-1 accent-orange-500"
              />
              <button
                onClick={() => setDurationMin(Math.min(60, durationMin + 1))}
                className="w-10 h-10 rounded-xl bg-white/60 border border-white/60 flex items-center justify-center text-gray-500 active:scale-95"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
              <span>1 min</span>
              <span>60 min</span>
            </div>
          </section>
        )}

        {/* Structure (mode structure) */}
        {structureType === 'structuree' && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Phases ({totalStructuredMin} min)
              </label>
              <button
                onClick={() => setStructure(STRUCTURE_DEFAUT)}
                className="text-xs text-orange-500 font-bold flex items-center gap-1"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            <div className="space-y-2">
              {structure.map((etape, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/60 rounded-2xl p-3 border border-white/60">
                  <input
                    type="text"
                    value={etape.label}
                    onChange={(e) => {
                      const next = [...structure];
                      next[i] = { ...next[i], label: e.target.value };
                      setStructure(next);
                    }}
                    className="flex-1 text-sm font-medium text-gray-800 bg-transparent focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const next = [...structure];
                        next[i] = { ...next[i], dureeMinutes: Math.max(1, next[i].dureeMinutes - 1) };
                        setStructure(next);
                      }}
                      className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-xs font-bold text-gray-700 w-8 text-center">{etape.dureeMinutes}m</span>
                    <button
                      onClick={() => {
                        const next = [...structure];
                        next[i] = { ...next[i], dureeMinutes: next[i].dureeMinutes + 1 };
                        setStructure(next);
                      }}
                      className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setStructure([...structure, { label: 'Nouvelle phase', dureeMinutes: 5 }])}
                className="flex-1 py-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-bold active:scale-95"
              >
                + Ajouter une phase
              </button>
              {structure.length > 1 && (
                <button
                  onClick={() => setStructure(structure.slice(0, -1))}
                  className="py-2 px-4 rounded-xl bg-red-50 text-red-500 text-xs font-bold active:scale-95"
                >
                  Supprimer
                </button>
              )}
            </div>
          </section>
        )}

        {/* ===== APPLY BUTTON ===== */}
        <motion.button
          onClick={handleSave}
          disabled={saving || success}
          className={`w-full h-14 rounded-2xl font-bold text-white flex items-center justify-center gap-2 shadow-premium active:scale-[0.97] transition-all ${
            success ? 'bg-green-500' : 'bg-orange-500'
          }`}
          whileTap={{ scale: 0.97 }}
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : success ? (
            <>
              <Check size={20} />
              Applique !
            </>
          ) : (
            'Appliquer la configuration'
          )}
        </motion.button>
      </div>
    </div>
  );
};

export default TestGroupConfigPage;
