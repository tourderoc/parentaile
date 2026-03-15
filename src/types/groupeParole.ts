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
}

export const STRUCTURE_DEFAUT: StructureEtape[] = [
  { label: 'Présentations', dureeMinutes: 5 },
  { label: 'Partage du vécu', dureeMinutes: 15 },
  { label: 'Tour de parole', dureeMinutes: 15 },
  { label: 'Discussion libre', dureeMinutes: 10 },
];

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
}

export const THEME_LABELS: Record<ThemeGroupe, string> = {
  ecole: 'École et apprentissages',
  comportement: 'Comportement et règles',
  emotions: 'Émotions et relations',
  developpement: 'Développement et difficultés',
  autre: 'Autre sujet',
};

export const THEME_COLORS: Record<ThemeGroupe, { bg: string; text: string; light: string }> = {
  ecole: { bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50' },
  comportement: { bg: 'bg-purple-500', text: 'text-purple-600', light: 'bg-purple-50' },
  emotions: { bg: 'bg-pink-500', text: 'text-pink-600', light: 'bg-pink-50' },
  developpement: { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' },
  autre: { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50' },
};

export const THEME_SHORT_LABELS: Record<ThemeGroupe, string> = {
  ecole: 'École',
  comportement: 'Comportement',
  emotions: 'Émotions',
  developpement: 'Développement',
  autre: 'Autre',
};
