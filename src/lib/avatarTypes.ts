export interface AvatarConfig {
  version?: 'v1' | 'v2';
  avatarType?: 'static' | 'ai';
  aiUrl?: string;
  // V1 fields (kept for compatibility)
  style: 'masculine' | 'feminine' | 'neutral';
  skinColor: string;
  bgColor: string;
  faceShape: 'round' | 'oval' | 'square' | 'pointed';
  hairStyle: 'short' | 'long' | 'curly' | 'bald' | 'mid';
  hairColor: string;
  glasses: boolean | 'none' | 'round' | 'square' | 'cateye' | 'aviator';
  beard: boolean | 'none' | 'stubble' | 'short' | 'medium' | 'long';
  mustache?: boolean;
  
  // V2 fields (DiceBear)
  dicebearStyle?: 'lorelei' | 'avataaars' | 'personas' | 'big-smile' | 'open-peeps' | 'bottts';
  seed?: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  version: 'v2',
  style: 'neutral',
  dicebearStyle: 'lorelei',
  seed: Math.random().toString(36).substring(7),
  skinColor: '#FDDCB5',
  bgColor: '#D4E8FF',
  faceShape: 'round',
  hairStyle: 'short',
  hairColor: '#4A3728',
  glasses: 'none',
  beard: 'none',
  mustache: false,
};

export const DICEBEAR_STYLES = [
  { id: 'lorelei', label: 'Lorelei (Moderne)', preview: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Felix' },
  { id: 'avataaars', label: 'Avataaars', preview: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
  { id: 'personas', label: 'Personas', preview: 'https://api.dicebear.com/7.x/personas/svg?seed=Felix' },
  { id: 'big-smile', label: 'Big Smile', preview: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Felix' },
  { id: 'open-peeps', label: 'Open Peeps', preview: 'https://api.dicebear.com/7.x/open-peeps/svg?seed=Felix' },
  { id: 'bottts', label: 'Robots', preview: 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix' },
] as const;

export const SKIN_COLORS = [
  { label: 'Clair', value: '#FDDCB5' },
  { label: 'Medium', value: '#E8B88A' },
  { label: 'Mate', value: '#C68642' },
  { label: 'Foncee', value: '#8D5524' },
  { label: 'Ebene', value: '#5C3317' },
];

export const STYLES = ['masculine', 'feminine', 'neutral'] as const;

export const STYLE_LABELS: Record<AvatarConfig['style'], string> = {
  masculine: 'Masculin',
  feminine: 'Feminin',
  neutral: 'Neutre',
};

export const BG_COLORS = [
  '#FFE4C4', '#D4E8FF', '#E8D4FF', '#D4FFE8',
  '#FFD4D4', '#FFF3D4', '#D4F5FF', '#E8E8E8',
  '#FFB6C1', '#98FB98', '#87CEFA', '#DDA0DD',
];

export const HAIR_COLORS = [
  { label: 'Brun', value: '#4A3728' },
  { label: 'Châtain', value: '#6C4F3D' },
  { label: 'Blond', value: '#D4A853' },
  { label: 'Noir', value: '#1A1A1A' },
  { label: 'Roux', value: '#B8622C' },
  { label: 'Gris', value: '#9E9E9E' },
  { label: 'Blanc', value: '#EAEAEA' },
];

export const HAIR_STYLES = ['short', 'long', 'curly', 'bald', 'mid'] as const;

export const HAIR_STYLE_LABELS: Record<AvatarConfig['hairStyle'], string> = {
  short: 'Courts',
  long: 'Longs',
  curly: 'Boucles',
  bald: 'Chauve',
  mid: 'Mi-longs',
};

export const FACE_SHAPES = ['round', 'oval', 'square', 'pointed'] as const;

export const FACE_SHAPE_LABELS: Record<AvatarConfig['faceShape'], string> = {
  round: 'Rond',
  oval: 'Ovale',
  square: 'Carré',
  pointed: 'Pointu',
};

export const GLASSES_STYLES = ['none', 'round', 'square', 'cateye', 'aviator'] as const;
export const GLASSES_LABELS: Record<string, string> = {
  none: 'Aucune',
  round: 'Rondes',
  square: 'Carrées',
  cateye: 'Oeil de Chat',
  aviator: 'Aviateur'
};

export const BEARD_STYLES = ['none', 'stubble', 'short', 'medium', 'long'] as const;
export const BEARD_LABELS: Record<string, string> = {
  none: 'Aucune',
  stubble: '3 Jours',
  short: 'Courte',
  medium: 'Moyenne',
  long: 'Longue'
};
