/**
 * Service de filtrage des pseudos - Sans IA
 *
 * Vérifie que le pseudo :
 * 1. Respecte les contraintes de longueur
 * 2. Ne contient pas de mots vulgaires/inappropriés
 * 3. N'existe pas déjà dans la base (doublons)
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// ============================================
// LISTE DE MOTS INTERDITS
// ============================================
// Liste de base, peut être étendue selon les besoins
const FORBIDDEN_WORDS = [
  // Insultes courantes
  'merde', 'putain', 'pute', 'salope', 'connard', 'connasse', 'enculé', 'encule',
  'nique', 'niquer', 'baiser', 'foutre', 'bordel', 'chiotte', 'chier',
  'couille', 'bite', 'queue', 'cul', 'fesse', 'sein', 'nichon', 'teub', 'zob',
  'pd', 'pédé', 'tapette', 'gouine', 'tantouse',
  'negro', 'negre', 'bougnoule', 'arabe', 'youpin', 'feuj', 'rebeu',
  'nazi', 'hitler', 'fasciste',
  'con', 'conne', 'idiot', 'debile', 'mongol', 'attardé', 'retardé',
  'creve', 'mort', 'suicide', 'tuer', 'kill',
  'drogue', 'cocaine', 'heroine', 'crack',
  'sexe', 'porn', 'xxx', 'penis', 'vagin',

  // Expressions combinées courantes
  'niketamere', 'niketa', 'ntm', 'tg', 'ftg', 'vff', 'vtff',
  'tamere', 'tonpere', 'tasœur', 'tasoeur',
  'cacaboudin', 'pipi', 'caca', 'prout',

  // Variantes leetspeak communes (seront aussi détectées par normalisation)
  'put1', 'put4in', 'n1que', 'm3rde',
];

// ============================================
// NORMALISATION DU TEXTE
// ============================================
// Remplace les caractères leetspeak par leurs équivalents
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '+': 't',
  '€': 'e',
  '£': 'l',
};

/**
 * Normalise un texte pour la comparaison
 * - Met en minuscules
 * - Supprime les accents
 * - Remplace le leetspeak
 * - Supprime les caractères spéciaux et espaces
 */
function normalizeText(text: string): string {
  let normalized = text.toLowerCase();

  // Supprimer les accents
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remplacer le leetspeak
  for (const [leet, char] of Object.entries(LEET_MAP)) {
    normalized = normalized.split(leet).join(char);
  }

  // Supprimer les caractères spéciaux, espaces, underscores, tirets
  normalized = normalized.replace(/[^a-z0-9]/g, '');

  return normalized;
}

/**
 * Vérifie si un texte contient un mot interdit
 * Utilise la normalisation pour détecter les variantes
 */
function containsForbiddenWord(text: string): { found: boolean; word?: string } {
  const normalized = normalizeText(text);

  for (const forbidden of FORBIDDEN_WORDS) {
    const normalizedForbidden = normalizeText(forbidden);

    // Vérifier si le mot interdit est contenu dans le pseudo normalisé
    if (normalized.includes(normalizedForbidden)) {
      return { found: true, word: forbidden };
    }
  }

  return { found: false };
}

// ============================================
// VALIDATION DU PSEUDO
// ============================================

export interface PseudoValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valide un pseudo localement (sans vérification de doublon)
 * - Longueur : 3-20 caractères
 * - Pas de mots interdits
 * - Caractères autorisés : lettres, chiffres, underscore, tiret
 */
export function validatePseudoFormat(pseudo: string): PseudoValidationResult {
  // Vérifier la longueur
  if (!pseudo || pseudo.length < 3) {
    return { valid: false, error: 'Le pseudo doit contenir au moins 3 caractères' };
  }

  if (pseudo.length > 20) {
    return { valid: false, error: 'Le pseudo ne peut pas dépasser 20 caractères' };
  }

  // Vérifier les caractères autorisés
  const validCharsRegex = /^[a-zA-Z0-9_-]+$/;
  if (!validCharsRegex.test(pseudo)) {
    return { valid: false, error: 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores' };
  }

  // Vérifier les mots interdits
  const forbiddenCheck = containsForbiddenWord(pseudo);
  if (forbiddenCheck.found) {
    return { valid: false, error: 'Ce pseudo contient un terme inapproprié' };
  }

  return { valid: true };
}

/**
 * Vérifie si un pseudo existe déjà dans Firebase
 */
export async function checkPseudoAvailability(pseudo: string): Promise<boolean> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('pseudo', '==', pseudo.toLowerCase()));
    const querySnapshot = await getDocs(q);

    // Le pseudo est disponible si aucun document n'est trouvé
    return querySnapshot.empty;
  } catch (error) {
    console.error('Erreur lors de la vérification du pseudo:', error);
    // En cas d'erreur, on refuse par précaution
    return false;
  }
}

/**
 * Validation complète du pseudo
 * Combine validation format + vérification doublon
 */
export async function validatePseudo(pseudo: string): Promise<PseudoValidationResult> {
  // Validation du format
  const formatResult = validatePseudoFormat(pseudo);
  if (!formatResult.valid) {
    return formatResult;
  }

  // Vérification de disponibilité
  const isAvailable = await checkPseudoAvailability(pseudo);
  if (!isAvailable) {
    return { valid: false, error: 'Ce pseudo est déjà utilisé' };
  }

  return { valid: true };
}

/**
 * Validation simple sans vérification de doublon
 * Utile pour l'Espace Patient où le pseudo est juste un nickname
 */
export function validateNickname(nickname: string): PseudoValidationResult {
  // Vérifier la longueur (plus souple pour les nicknames)
  if (!nickname || nickname.length < 2) {
    return { valid: false, error: 'Le prénom/surnom doit contenir au moins 2 caractères' };
  }

  if (nickname.length > 30) {
    return { valid: false, error: 'Le prénom/surnom ne peut pas dépasser 30 caractères' };
  }

  // Vérifier les mots interdits
  const forbiddenCheck = containsForbiddenWord(nickname);
  if (forbiddenCheck.found) {
    return { valid: false, error: 'Ce prénom/surnom contient un terme inapproprié' };
  }

  return { valid: true };
}

export default {
  validatePseudo,
  validatePseudoFormat,
  validateNickname,
  checkPseudoAvailability,
};
