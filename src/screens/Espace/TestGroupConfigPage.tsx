import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { updateTestGroup } from '../../lib/groupeParoleService';
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

export const TestGroupConfigPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Config state
  const [titre, setTitre] = useState('Salle de test vocal');
  const [theme, setTheme] = useState<ThemeGroupe>('autre');
  const [structureType, setStructureType] = useState<'libre' | 'structuree'>('libre');
  const [structure, setStructure] = useState<StructureEtape[]>(STRUCTURE_DEFAUT);
  const [durationMin, setDurationMin] = useState(5);
  const [role, setRole] = useState<'animateur' | 'invite'>('animateur');

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
          // Si le createurUid est mon UID → animateur, sinon invité
          const currentUid = auth.currentUser?.uid;
          if (currentUid && d.createurUid === currentUid) {
            setRole('animateur');
          } else {
            setRole('animateur'); // default: je serai animateur
          }
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
        // Animateur → mon UID, Invité → __test__ (le premier entrant sera animateur)
        createurUid: role === 'animateur' && currentUid ? currentUid : '__test__',
        createurPseudo: role === 'animateur' ? pseudo : 'Systeme',
      });
      setSuccess(true);
      setTimeout(() => navigate(-1), 1200);
    } catch (e) {
      console.error('[TestConfig] Erreur sauvegarde:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF0]">
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

        {/* Thème */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Thème</label>
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
                {type === 'libre' ? 'Libre' : 'Structurée'}
              </button>
            ))}
          </div>
        </section>

        {/* Rôle */}
        <section>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Mon rôle</label>
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
              Invité
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 px-1">
            {role === 'animateur'
              ? 'Vous serez l\'animateur de la session (suggestions, modération)'
              : 'Le premier participant à rejoindre deviendra l\'animateur'}
          </p>
        </section>

        {/* Durée (mode libre) */}
        {structureType === 'libre' && (
          <section>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">
              Durée ({durationMin} min)
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

        {/* Structure (mode structuré) */}
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
            {/* Add/remove phase */}
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

        {/* Save button */}
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
              Appliqué !
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
