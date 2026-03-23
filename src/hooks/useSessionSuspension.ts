import { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import type { SessionState } from '../types/groupeParole';

interface UseSessionSuspensionProps {
  groupeId: string;
  localUid: string;
  liveKitParticipants: Participant[]; // Seulement les AUTRES participants
  firestoreSession?: SessionState;
  effectiveAnimateurUid: string;
  isEffectiveAnimateur: boolean;
  onSuspend: (reason: 'animateur_left' | 'below_minimum') => void;
  onResume: () => void;
  onAutoEnd: () => void;
}

export function useSessionSuspension({
  localUid,
  liveKitParticipants,
  firestoreSession,
  effectiveAnimateurUid,
  isEffectiveAnimateur,
  onSuspend,
  onResume,
  onAutoEnd
}: UseSessionSuspensionProps) {
  const [countdownSec, setCountdownSec] = useState(180);
  const [canPropose, setCanPropose] = useState(false);
  const graceTimerRef = useRef<NodeJS.Timeout>();
  const suspendTimerRef = useRef<NodeJS.Timeout>();
  
  const suspended = firestoreSession?.suspended || false;
  const suspensionReason = firestoreSession?.suspensionReason;
  const maxReached = (firestoreSession?.suspensionCount || 0) >= 2;

  // Detection des conditions de suspension
  useEffect(() => {
    if (!firestoreSession?.sessionActive) return;
    
    // Le total est "moi" + "les autres" (liveKitParticipants = remote participants)
    const totalCount = 1 + liveKitParticipants.length;
    
    const animateurPresent = localUid === effectiveAnimateurUid 
      ? true 
      : liveKitParticipants.some(p => p.identity === effectiveAnimateurUid);

    const isBelowMinimum = totalCount < 3;
    const isAnimateurLeft = !animateurPresent;

    // S'il n'y a PAS de probleme
    if (!isBelowMinimum && !isAnimateurLeft) {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = undefined;
      }
      if (suspended && isEffectiveAnimateur) {
        // C'est l'animateur effectif qui trigger onResume pour tout le monde -> eviter data races
        onResume();
      }
      return;
    }

    // Condition critique détectée et pas encore suspendu
    if (!suspended && !graceTimerRef.current) {
      // Démarrer la grâce réseau 30s
      graceTimerRef.current = setTimeout(() => {
        // La tolérance de 30s est écoulée. Quelqu'un doit trigger la suspension.
        onSuspend(isAnimateurLeft ? 'animateur_left' : 'below_minimum');
      }, 30000);
    }
    
    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    }
  }, [
    firestoreSession?.sessionActive, 
    liveKitParticipants, 
    liveKitParticipants.length,
    effectiveAnimateurUid, 
    localUid, 
    suspended, 
    isEffectiveAnimateur,
    onSuspend,
    onResume
  ]);

  // Si on est en suspension, on gère le décompte 3 minutes (UI only pr les autres, trigger d'action au sub-zero)
  useEffect(() => {
    if (suspended) {
      setCountdownSec(180);
      setCanPropose(false);
      
      suspendTimerRef.current = setInterval(() => {
        setCountdownSec(prev => {
          if (prev <= 1) {
            clearInterval(suspendTimerRef.current);
            // La suspension est finie et problème non résolu : arrêt automatique
            onAutoEnd();
            return 0;
          }
          if (prev <= 120) {
            // Après 1min (soit 60s écoulées, reste 120s), on permet à un autre parent d'animer
            setCanPropose(true);
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (suspendTimerRef.current) clearInterval(suspendTimerRef.current);
    }

    return () => {
      if (suspendTimerRef.current) clearInterval(suspendTimerRef.current);
    };
  }, [suspended, onAutoEnd]);

  return { suspended, suspensionReason, countdownSec, canPropose, maxReached };
}
