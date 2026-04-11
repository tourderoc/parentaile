export type ThemeGroupe =
  | 'ecole'
  | 'comportement'
  | 'emotions'
  | 'developpement'
  | 'autre';

export interface ParticipantGroupe {
  uid: string;
  pseudo: string;
  inscritVocal: boolean;
  dateInscription: Date;
  banni?: boolean;
}

export interface MessageGroupe {
  id: string;
  auteurUid: string;
  auteurPseudo: string;
  contenu: string;
  dateEnvoi: Date;
}

export interface StructureEtape {
  label: string;
  dureeMinutes: number;
  micMode?: 'muted' | 'free';
}

export const STRUCTURE_DEFAUT: StructureEtape[] = [
  { label: 'Présentations', dureeMinutes: 5, micMode: 'free' },
  { label: 'Partage du vécu', dureeMinutes: 10, micMode: 'muted' },
  { label: 'Tour de parole', dureeMinutes: 15, micMode: 'muted' },
  { label: 'Discussion libre', dureeMinutes: 10, micMode: 'free' },
  { label: 'Clôture', dureeMinutes: 5, micMode: 'muted' },
];

export type GroupeStatus = 'scheduled' | 'cancelled' | 'in_progress' | 'completed' | 'reprogrammed';

export interface GroupeParole {
  id: string;
  titre: string;
  description: string;
  theme: ThemeGroupe;
  createurUid: string;
  createurPseudo: string;
  dateCreation: Date;
  dateVocal: Date;
  dateExpiration: Date;
  participantsMax: number;
  structureType: 'libre' | 'structuree';
  structure?: StructureEtape[];
  participants: ParticipantGroupe[];
  messages: MessageGroupe[];
  messageCount?: number;
  sessionState?: SessionState;
  status?: GroupeStatus;
  reprogrammedFromId?: string;
  reprogrammedToId?: string;
}

export const THEME_LABELS: Record<ThemeGroupe, string> = {
  ecole: 'École et apprentissages',
  comportement: 'Comportement et règles',
  emotions: 'Émotions et relations',
  developpement: 'Développement et difficultés',
  autre: 'Autre sujet',
};

export const THEME_COLORS: Record<ThemeGroupe, { bg: string; text: string; light: string; glass: string }> = {
  ecole: { bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50', glass: 'bg-blue-500/40' },
  comportement: { bg: 'bg-purple-500', text: 'text-purple-600', light: 'bg-purple-50', glass: 'bg-purple-500/40' },
  emotions: { bg: 'bg-pink-500', text: 'text-pink-600', light: 'bg-pink-50', glass: 'bg-pink-500/40' },
  developpement: { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', glass: 'bg-emerald-500/40' },
  autre: { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', glass: 'bg-amber-500/40' },
};

// ========== Évaluation post-groupe ==========
export interface EvaluationGroupe {
  id?: string;
  groupeId: string;
  participantUid: string;
  participantPseudo: string;
  noteAmbiance: number;       // 1-5
  noteTheme: number;          // 1-5
  noteTechnique: number;      // 1-5
  ressenti?: string;          // champ libre facultatif
  signalement?: {
    participantUid: string;
    participantPseudo: string;
    description: string;
  };
  dateEvaluation: Date;
}

export interface EvaluationPendante {
  groupeId: string;
  groupeTitre: string;
  groupeTheme: ThemeGroupe;
  dateVocal: Date;
  dateExpiration: Date;
}

// ========== Système de points & badges ==========
export type BadgeLevel = 'none' | 'plume' | 'envol' | 'nid';

export interface ParticipationEntry {
  groupeId: string;
  groupeTitre: string;
  date: Date;
  type: 'participation' | 'creation';
  points: number;
}

export interface UserProgression {
  points: number;
  badge: BadgeLevel;
  history: ParticipationEntry[];
}

export const BADGE_THRESHOLDS: { level: BadgeLevel; points: number; label: string; color: string; ring: string }[] = [
  { level: 'nid',   points: 300, label: 'Nid',   color: '#F59E0B', ring: 'ring-amber-400' },
  { level: 'envol', points: 150, label: 'Envol', color: '#8B5CF6', ring: 'ring-violet-400' },
  { level: 'plume', points: 50,  label: 'Plume', color: '#F9A826', ring: 'ring-orange-300' },
];

export function getBadgeForPoints(points: number): BadgeLevel {
  if (points >= 300) return 'nid';
  if (points >= 150) return 'envol';
  if (points >= 50) return 'plume';
  return 'none';
}

export function getBadgeInfo(badge: BadgeLevel) {
  const info = BADGE_THRESHOLDS.find((b) => b.level === badge);
  if (!info) return { label: '', color: 'transparent', ring: '', points: 0 };
  return info;
}

export function getNextBadge(points: number): { label: string; pointsNeeded: number } | null {
  if (points >= 300) return null;
  if (points >= 150) return { label: 'Nid', pointsNeeded: 300 - points };
  if (points >= 50) return { label: 'Envol', pointsNeeded: 150 - points };
  return { label: 'Plume', pointsNeeded: 50 - points };
}

export const THEME_SHORT_LABELS: Record<ThemeGroupe, string> = {
  ecole: 'École',
  comportement: 'Comportement',
  emotions: 'Émotions',
  developpement: 'Développement',
  autre: 'Autre',
};

// ========== Session vocale en temps réel ==========
export interface SessionState {
  currentPhaseIndex: number;
  extendedMinutes: number;       // 0 ou 5
  sessionActive: boolean;
  phaseStartedAt: Date;
  sessionStartedAt: Date;
  // Lifecycle extensions
  suspended?: boolean;
  suspendedAt?: Date;
  suspensionReason?: 'animateur_left' | 'below_minimum' | 'technical';
  suspensionCount?: number;      // max 2
  replacementUsed?: boolean;
  currentAnimateurUid?: string;
  currentAnimateurPseudo?: string;
  animateurDisconnectCount?: number; // max 2, after which replacement is forced
}

export type MicPolicy = 'open' | 'muted_raise_hand' | 'muted_animateur_gives';

export const PHASE_MIC_POLICY: Record<string, MicPolicy> = {
  'Présentations': 'open',
  'Partage du vécu': 'muted_raise_hand',
  'Tour de parole': 'muted_animateur_gives',
  'Discussion libre': 'open',
  'Clôture': 'muted_raise_hand',
};

export const DEFAULT_MIC_POLICY: MicPolicy = 'muted_raise_hand';
