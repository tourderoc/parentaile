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
 */
export async function getLiveKitToken(groupeId: string): Promise<LiveKitTokenResponse> {
  const callable = httpsCallable<{ groupeId: string }, LiveKitTokenResponse>(
    functions,
    'getLiveKitToken'
  );
  const result = await callable({ groupeId });
  return result.data;
}
