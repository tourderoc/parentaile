import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { auth } from './firebase';

interface LiveKitTokenResponse {
  token: string;
  roomName: string;
  wsUrl: string;
  isAnimateur: boolean;
  pseudo: string;
}

const BACKEND = import.meta.env.VITE_STORAGE_BACKEND || 'firebase';
const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;

/**
 * Obtient un token LiveKit pour rejoindre la salle vocale.
 * Backend: VPS (POST /groupes/{id}/token) ou Firebase Cloud Function.
 * Vérifications côté serveur : inscription, fenêtre temporelle, ban.
 */
export async function getLiveKitToken(groupeId: string, pseudo?: string, mood?: string, password?: string): Promise<LiveKitTokenResponse> {
  if (BACKEND === 'vps') {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Connexion requise');

    const res = await fetch(`${VPS_URL}/groupes/${groupeId}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': VPS_KEY,
      },
      body: JSON.stringify({
        uid,
        ...(pseudo ? { pseudo } : {}),
        ...(mood ? { mood } : {}),
      }),
    });

    if (!res.ok) {
      let detail = `Erreur ${res.status}`;
      try {
        const err = await res.json();
        detail = err.detail || detail;
      } catch { /* ignore */ }
      throw new Error(detail);
    }

    return res.json();
  }

  const callable = httpsCallable<{ groupeId: string; pseudo?: string; mood?: string; password?: string }, LiveKitTokenResponse>(
    functions,
    'getLiveKitToken'
  );
  const result = await callable({
    groupeId,
    ...(pseudo ? { pseudo } : {}),
    ...(mood ? { mood } : {}),
    ...(password ? { password } : {})
  });
  return result.data;
}
