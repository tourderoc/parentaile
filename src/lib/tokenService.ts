/**
 * Service de validation des tokens Parent'aile
 *
 * Vérifie que le token scanné/saisi est valide :
 * 1. Existe dans Firebase (collection tokens)
 * 2. Status = "pending" (pas encore utilisé ni révoqué)
 */

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ============================================
// TYPES
// ============================================

export type TokenStatus = 'pending' | 'used' | 'revoked';

export interface TokenData {
  createdAt: Date;
  status: TokenStatus;
  usedAt?: Date;
}

export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'ALREADY_USED' | 'REVOKED' | 'FIREBASE_ERROR';
  data?: TokenData;
}

// ============================================
// VÉRIFICATION EN LECTURE SEULE
// ============================================

/**
 * Vérifie le statut d'un token SANS le modifier (lecture seule)
 * Utilisé pour les utilisateurs déjà connectés qui scannent un QR code
 */
export async function checkTokenStatus(tokenId: string): Promise<TokenValidationResult> {
  if (!tokenId || tokenId.length < 8) {
    return {
      valid: false,
      error: 'Code invalide (format incorrect)',
      errorCode: 'NOT_FOUND'
    };
  }

  try {
    const tokenRef = doc(db, 'tokens', tokenId);
    const tokenSnap = await getDoc(tokenRef);

    if (!tokenSnap.exists()) {
      return {
        valid: false,
        error: 'Ce code n\'existe pas ou a expiré. Vérifiez le document remis par votre médecin.',
        errorCode: 'NOT_FOUND'
      };
    }

    const data = tokenSnap.data();
    const status = data.status as TokenStatus;

    if (status === 'used') {
      return {
        valid: false,
        error: 'Ce code a déjà été utilisé. Si vous avez déjà ajouté cet enfant, il apparaît dans votre espace.',
        errorCode: 'ALREADY_USED'
      };
    }

    if (status === 'revoked') {
      return {
        valid: false,
        error: 'Ce code a été révoqué par le cabinet médical.',
        errorCode: 'REVOKED'
      };
    }

    // Token pending → valide (mais on ne le marque PAS comme used)
    return {
      valid: true,
      data: {
        createdAt: data.createdAt?.toDate?.() || new Date(),
        status: status
      }
    };

  } catch (error) {
    console.error('Erreur vérification token:', error);
    return {
      valid: false,
      error: 'Erreur de connexion. Réessayez.',
      errorCode: 'FIREBASE_ERROR'
    };
  }
}

// ============================================
// VALIDATION DU TOKEN (avec activation)
// ============================================

/**
 * Vérifie si un token est valide ET le marque comme "used" (single-use)
 * Utilisé uniquement pour le flow d'activation (inscription/ajout enfant)
 * @param tokenId - L'ID du token à vérifier
 * @returns Résultat de la validation
 */
export async function validateToken(tokenId: string): Promise<TokenValidationResult> {
  if (!tokenId || tokenId.length < 8) {
    return {
      valid: false,
      error: 'Token invalide (format incorrect)',
      errorCode: 'NOT_FOUND'
    };
  }

  try {
    const tokenRef = doc(db, 'tokens', tokenId);
    const tokenSnap = await getDoc(tokenRef);

    // Token n'existe pas
    if (!tokenSnap.exists()) {
      return {
        valid: false,
        error: 'Ce token n\'existe pas ou a expiré. Vérifiez que vous avez bien scanné le QR code fourni par votre médecin.',
        errorCode: 'NOT_FOUND'
      };
    }

    const data = tokenSnap.data();
    const status = data.status as TokenStatus;

    // Token déjà utilisé
    if (status === 'used') {
      return {
        valid: false,
        error: 'Ce token a déjà été utilisé. Si vous avez déjà un compte, connectez-vous directement.',
        errorCode: 'ALREADY_USED'
      };
    }

    // Token révoqué
    if (status === 'revoked') {
      return {
        valid: false,
        error: 'Ce token a été révoqué par le cabinet médical. Veuillez les contacter pour obtenir un nouveau code.',
        errorCode: 'REVOKED'
      };
    }

    // Token valide (pending) → le marquer immédiatement comme "used" (single-use)
    try {
      await updateDoc(tokenRef, {
        status: 'used',
        usedAt: serverTimestamp()
      });
    } catch {
      return {
        valid: false,
        error: 'Erreur lors de l\'activation du token. Réessayez.',
        errorCode: 'FIREBASE_ERROR'
      };
    }

    return {
      valid: true,
      data: {
        createdAt: data.createdAt?.toDate?.() || new Date(),
        status: 'used' as TokenStatus
      }
    };

  } catch (error) {
    console.error('Erreur validation token:', error);
    return {
      valid: false,
      error: 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.',
      errorCode: 'FIREBASE_ERROR'
    };
  }
}

/**
 * Marque un token comme utilisé (après inscription réussie)
 * @param tokenId - L'ID du token à marquer
 */
export async function markTokenAsUsed(tokenId: string): Promise<boolean> {
  try {
    const tokenRef = doc(db, 'tokens', tokenId);
    await updateDoc(tokenRef, {
      status: 'used',
      usedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Erreur mise à jour token:', error);
    return false;
  }
}

/**
 * Extrait le token d'une URL
 * Ex: https://parentaile.fr/espace?token=abc123xyz
 */
export function extractTokenFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('token');
  } catch {
    // Si ce n'est pas une URL valide, c'est peut-être juste le token
    if (url.length >= 8 && url.length <= 20 && /^[a-z0-9]+$/.test(url)) {
      return url;
    }
    return null;
  }
}

/**
 * Récupère le token depuis l'URL courante (paramètre ?token=xxx)
 */
export function getTokenFromCurrentUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

export default {
  checkTokenStatus,
  validateToken,
  markTokenAsUsed,
  extractTokenFromUrl,
  getTokenFromCurrentUrl
};
