/**
 * Service de validation des tokens Parent'aile
 * Source : VPS bridge (/bridge/tokens)
 * @FIREBASE_LEGACY — dual-read Firebase activé si VITE_FIREBASE_BRIDGE !== 'false'
 */

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'; // @FIREBASE_LEGACY
import { db } from './firebase'; // @FIREBASE_LEGACY

const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;
const USE_FIREBASE = import.meta.env.VITE_FIREBASE_BRIDGE !== 'false'; // @FIREBASE_LEGACY

async function bridgeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${VPS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': VPS_KEY,
      ...(init.headers || {}),
    },
  });
}

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

export async function checkTokenStatus(tokenId: string): Promise<TokenValidationResult> {
  if (!tokenId || tokenId.length < 8) {
    return {
      valid: false,
      error: 'Code invalide (format incorrect)',
      errorCode: 'NOT_FOUND'
    };
  }

  try {
    const res = await bridgeFetch(`/bridge/tokens/${encodeURIComponent(tokenId)}`);

    if (res.status === 404) {
      // @FIREBASE_LEGACY — fallback Firebase si VPS ne connaît pas le token
      if (USE_FIREBASE) {
        return _checkTokenFirebase(tokenId);
      }
      return {
        valid: false,
        error: 'Ce code n\'existe pas ou a expiré. Vérifiez le document remis par votre médecin.',
        errorCode: 'NOT_FOUND'
      };
    }

    if (!res.ok) {
      return { valid: false, error: 'Erreur de connexion. Réessayez.', errorCode: 'FIREBASE_ERROR' };
    }

    const data = await res.json();
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

    return {
      valid: true,
      data: {
        createdAt: new Date(data.created_at),
        status: status
      }
    };

  } catch (error) {
    console.error('Erreur vérification token VPS:', error);
    // @FIREBASE_LEGACY — fallback Firebase si VPS down
    if (USE_FIREBASE) {
      return _checkTokenFirebase(tokenId);
    }
    return { valid: false, error: 'Erreur de connexion. Réessayez.', errorCode: 'FIREBASE_ERROR' };
  }
}

// ============================================
// VALIDATION DU TOKEN (avec activation)
// ============================================

export async function validateToken(tokenId: string, parentUid?: string, pseudo?: string): Promise<TokenValidationResult> {
  if (!tokenId || tokenId.length < 8) {
    return {
      valid: false,
      error: 'Token invalide (format incorrect)',
      errorCode: 'NOT_FOUND'
    };
  }

  try {
    // Vérifier d'abord sur VPS
    const checkRes = await bridgeFetch(`/bridge/tokens/${encodeURIComponent(tokenId)}`);

    if (checkRes.status === 404) {
      // @FIREBASE_LEGACY — fallback Firebase
      if (USE_FIREBASE) {
        return _validateTokenFirebase(tokenId);
      }
      return {
        valid: false,
        error: 'Ce token n\'existe pas ou a expiré. Vérifiez que vous avez bien scanné le QR code fourni par votre médecin.',
        errorCode: 'NOT_FOUND'
      };
    }

    if (!checkRes.ok) {
      return { valid: false, error: 'Erreur de connexion. Réessayez.', errorCode: 'FIREBASE_ERROR' };
    }

    const data = await checkRes.json();

    if (data.status === 'used') {
      return {
        valid: false,
        error: 'Ce token a déjà été utilisé. Si vous avez déjà un compte, connectez-vous directement.',
        errorCode: 'ALREADY_USED'
      };
    }

    if (data.status === 'revoked') {
      return {
        valid: false,
        error: 'Ce token a été révoqué par le cabinet médical. Veuillez les contacter pour obtenir un nouveau code.',
        errorCode: 'REVOKED'
      };
    }

    // Activer le token sur VPS
    const useRes = await bridgeFetch(`/bridge/tokens/${encodeURIComponent(tokenId)}/use`, {
      method: 'PUT',
      body: JSON.stringify({ parent_uid: parentUid || '', pseudo: pseudo || '' }),
    });

    if (!useRes.ok) {
      return { valid: false, error: 'Erreur lors de l\'activation du token. Réessayez.', errorCode: 'FIREBASE_ERROR' };
    }

    // @FIREBASE_LEGACY — aussi marquer sur Firebase
    if (USE_FIREBASE) {
      try {
        const tokenRef = doc(db, 'tokens', tokenId);
        await updateDoc(tokenRef, { status: 'used', usedAt: serverTimestamp() });
      } catch { /* Firebase indisponible, VPS fait foi */ }
    }

    return {
      valid: true,
      data: {
        createdAt: new Date(data.created_at),
        status: 'used' as TokenStatus
      }
    };

  } catch (error) {
    console.error('Erreur validation token VPS:', error);
    // @FIREBASE_LEGACY — fallback Firebase
    if (USE_FIREBASE) {
      return _validateTokenFirebase(tokenId);
    }
    return { valid: false, error: 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.', errorCode: 'FIREBASE_ERROR' };
  }
}

export async function markTokenAsUsed(tokenId: string): Promise<boolean> {
  try {
    await bridgeFetch(`/bridge/tokens/${encodeURIComponent(tokenId)}/use`, {
      method: 'PUT',
      body: JSON.stringify({ parent_uid: '', pseudo: '' }),
    });

    // @FIREBASE_LEGACY
    if (USE_FIREBASE) {
      try {
        const tokenRef = doc(db, 'tokens', tokenId);
        await updateDoc(tokenRef, { status: 'used', usedAt: serverTimestamp() });
      } catch { /* ignore */ }
    }

    return true;
  } catch (error) {
    console.error('Erreur mise à jour token:', error);
    return false;
  }
}

// ============================================
// UTILITAIRES URL
// ============================================

export function extractTokenFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('token');
  } catch {
    if (url.length >= 8 && url.length <= 20 && /^[a-z0-9]+$/.test(url)) {
      return url;
    }
    return null;
  }
}

export function getTokenFromCurrentUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

// ============================================
// @FIREBASE_LEGACY — Fallback Firebase (à supprimer au merge)
// ============================================

async function _checkTokenFirebase(tokenId: string): Promise<TokenValidationResult> {
  try {
    const tokenRef = doc(db, 'tokens', tokenId);
    const tokenSnap = await getDoc(tokenRef);

    if (!tokenSnap.exists()) {
      return { valid: false, error: 'Ce code n\'existe pas ou a expiré.', errorCode: 'NOT_FOUND' };
    }

    const data = tokenSnap.data();
    const status = data.status as TokenStatus;

    if (status === 'used') {
      return { valid: false, error: 'Ce code a déjà été utilisé.', errorCode: 'ALREADY_USED' };
    }
    if (status === 'revoked') {
      return { valid: false, error: 'Ce code a été révoqué par le cabinet médical.', errorCode: 'REVOKED' };
    }

    return {
      valid: true,
      data: { createdAt: data.createdAt?.toDate?.() || new Date(), status }
    };
  } catch (error) {
    console.error('Erreur vérification token Firebase:', error);
    return { valid: false, error: 'Erreur de connexion. Réessayez.', errorCode: 'FIREBASE_ERROR' };
  }
}

async function _validateTokenFirebase(tokenId: string): Promise<TokenValidationResult> {
  try {
    const tokenRef = doc(db, 'tokens', tokenId);
    const tokenSnap = await getDoc(tokenRef);

    if (!tokenSnap.exists()) {
      return { valid: false, error: 'Ce token n\'existe pas ou a expiré.', errorCode: 'NOT_FOUND' };
    }

    const data = tokenSnap.data();
    if (data.status === 'used') {
      return { valid: false, error: 'Ce token a déjà été utilisé.', errorCode: 'ALREADY_USED' };
    }
    if (data.status === 'revoked') {
      return { valid: false, error: 'Ce token a été révoqué.', errorCode: 'REVOKED' };
    }

    await updateDoc(tokenRef, { status: 'used', usedAt: serverTimestamp() });

    return {
      valid: true,
      data: { createdAt: data.createdAt?.toDate?.() || new Date(), status: 'used' as TokenStatus }
    };
  } catch (error) {
    console.error('Erreur validation token Firebase:', error);
    return { valid: false, error: 'Erreur de connexion. Réessayez.', errorCode: 'FIREBASE_ERROR' };
  }
}

export default {
  checkTokenStatus,
  validateToken,
  markTokenAsUsed,
  extractTokenFromUrl,
  getTokenFromCurrentUrl
};
