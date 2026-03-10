export interface AvatarConfig {
  style: 'masculine' | 'feminine' | 'neutral';
  skinColor: string;
  bgColor: string;
  faceShape: 'round' | 'oval';
  hairStyle: 'short' | 'long' | 'curly' | 'bald' | 'mid';
  hairColor: string;
  glasses: boolean;
  beard: boolean;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  style: 'neutral',
  skinColor: '#FDDCB5',
  bgColor: '#E8E8E8',
  faceShape: 'round',
  hairStyle: 'short',
  hairColor: '#4A3728',
  glasses: false,
  beard: false,
};

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

export const FACE_SHAPES = ['round', 'oval'] as const;

export const FACE_SHAPE_LABELS: Record<AvatarConfig['faceShape'], string> = {
  round: 'Rond',
  oval: 'Ovale',
};
