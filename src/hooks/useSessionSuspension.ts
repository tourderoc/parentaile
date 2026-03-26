import { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import type { SessionState } from '../types/groupeParole';

interface UseSessionSuspensionProps {
  groupeId: string;
  localUid: string;
  liveKitParticipants: Participant[];
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

  // Use refs for callbacks to avoid re-triggering effects on every render
  const onSuspendRef = useRef(onSuspend);
  const onResumeRef = useRef(onResume);
  const onAutoEndRef = useRef(onAutoEnd);
  onSuspendRef.current = onSuspend;
  onResumeRef.current = onResume;
  onAutoEndRef.current = onAutoEnd;

  const suspended = firestoreSession?.suspended || false;
  const suspensionReason = firestoreSession?.suspensionReason;
  const maxReached = (firestoreSession?.suspensionCount || 0) >= 2;

  // Detection des conditions de suspension
  useEffect(() => {
    if (!firestoreSession?.sessionActive) return;

    const totalCount = 1 + liveKitParticipants.length;

    const animateurPresent = localUid === effectiveAnimateurUid
      ? true
      : liveKitParticipants.some(p => p.identity === effectiveAnimateurUid);

    const isBelowMinimum = totalCount < 3;
    const isAnimateurLeft = !animateurPresent && !isBelowMinimum;

    // Pas de probleme
    if (!isBelowMinimum && !isAnimateurLeft) {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = undefined;
      }
      if (suspended && isEffectiveAnimateur) {
        onResumeRef.current();
      }
      return;
    }

    // Condition critique détectée et pas encore suspendu
    if (!suspended && !graceTimerRef.current) {
      graceTimerRef.current = setTimeout(() => {
        graceTimerRef.current = undefined;
        onSuspendRef.current(isAnimateurLeft ? 'animateur_left' : 'below_minimum');
      }, 30000);
    }

    // No cleanup here — we want the grace timer to survive re-renders
    // It is cleared explicitly when conditions improve (above)
  }, [
    firestoreSession?.sessionActive,
    liveKitParticipants,
    liveKitParticipants.length,
    effectiveAnimateurUid,
    localUid,
    suspended,
    isEffectiveAnimateur,
  ]);

  // Cleanup grace timer on unmount only
  useEffect(() => {
    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    };
  }, []);

  // Countdown pendant la suspension
  useEffect(() => {
    if (suspended) {
      setCountdownSec(180);
      setCanPropose(false);

      suspendTimerRef.current = setInterval(() => {
        setCountdownSec(prev => {
          if (prev <= 1) {
            clearInterval(suspendTimerRef.current);
            onAutoEndRef.current();
            return 0;
          }
          if (prev <= 120) {
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
  }, [suspended]);

  return { suspended, suspensionReason, countdownSec, canPropose, maxReached };
}
