import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

interface LiveKitTokenResponse {
  token: string;
  roomName: string;
  wsUrl: string;
  isAnimateur: boolean;
  pseudo: string;
}

/**
 * Appelle la Cloud Function pour obtenir un token LiveKit.
 * Vérifie côté serveur : auth, inscription, fenêtre temporelle.
 * Pour les groupes test, passe le mot de passe optionnel.
 */
export async function getLiveKitToken(groupeId: string, pseudo?: string, mood?: string, password?: string): Promise<LiveKitTokenResponse> {
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
