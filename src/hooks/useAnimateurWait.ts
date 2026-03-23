import { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import type { SessionState } from '../types/groupeParole';

interface UseAnimateurWaitProps {
  groupeId: string;
  liveKitParticipants: Participant[];
  firestoreSession?: SessionState;
  createurUid: string;
  sessionStarted: boolean; // Salle ouverte (J=0)
  isTestGroup?: boolean;
  onTimedOut?: () => void;
}

export function useAnimateurWait({
  liveKitParticipants,
  firestoreSession,
  createurUid,
  sessionStarted,
  isTestGroup,
  onTimedOut
}: UseAnimateurWaitProps) {
  const [waitingForAnimateur, setWaitingForAnimateur] = useState(false);
  const [waitCountdownSec, setWaitCountdownSec] = useState(180); // 3 mins max
  const [canPropose, setCanPropose] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!sessionStarted || isTestGroup) {
      setWaitingForAnimateur(false);
      return;
    }

    const effectiveUid = firestoreSession?.currentAnimateurUid || createurUid;
    
    // Vérifier si l'animateur est dans la salle
    const animateurPresent = liveKitParticipants.some(p => p.identity === effectiveUid);
    
    if (animateurPresent) {
      if (waitingForAnimateur) {
        // Animateur arrivé !
        setWaitingForAnimateur(false);
        setWaitCountdownSec(180);
        clearInterval(timerRef.current);
      }
      return;
    }

    // Si on n'attendait pas encore, on démarre
    if (!waitingForAnimateur && !timedOut) {
      setWaitingForAnimateur(true);
      setWaitCountdownSec(180);
      setCanPropose(false);
      
      timerRef.current = setInterval(() => {
        setWaitCountdownSec(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setTimedOut(true);
            onTimedOut?.();
            return 0;
          }
          if (prev === 60) {
            // A partir d'1 minute restante (2min écoulées), on permet à qq de se proposer
            setCanPropose(true);
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(timerRef.current);
  }, [
    sessionStarted, 
    liveKitParticipants, 
    firestoreSession?.currentAnimateurUid, 
    createurUid, 
    waitingForAnimateur, 
    timedOut, 
    isTestGroup
  ]);

  return { waitingForAnimateur, waitCountdownSec, canPropose, timedOut };
}
