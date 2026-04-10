export interface AvatarConfig {
  version?: 'v2';
  avatarType?: 'static' | 'ai';
  aiUrl?: string;
  dicebearStyle?: 'lorelei' | 'avataaars' | 'personas' | 'big-smile' | 'open-peeps' | 'bottts';
  seed?: string;
  bgColor?: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  version: 'v2',
  dicebearStyle: 'lorelei',
  seed: Math.random().toString(36).substring(7),
  bgColor: '#D4E8FF',
};

export const DICEBEAR_STYLES = [
  { id: 'lorelei', label: 'Lorelei (Moderne)', preview: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Felix' },
  { id: 'avataaars', label: 'Avataaars', preview: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
  { id: 'personas', label: 'Personas', preview: 'https://api.dicebear.com/7.x/personas/svg?seed=Felix' },
  { id: 'big-smile', label: 'Big Smile', preview: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Felix' },
  { id: 'open-peeps', label: 'Open Peeps', preview: 'https://api.dicebear.com/7.x/open-peeps/svg?seed=Felix' },
  { id: 'bottts', label: 'Robots', preview: 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix' },
] as const;

export const BG_COLORS = [
  '#FFE4C4', '#D4E8FF', '#E8D4FF', '#D4FFE8',
  '#FFD4D4', '#FFF3D4', '#D4F5FF', '#E8E8E8',
  '#FFB6C1', '#98FB98', '#87CEFA', '#DDA0DD',
];
