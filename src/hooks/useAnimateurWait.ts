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
  const onTimedOutRef = useRef(onTimedOut);
  onTimedOutRef.current = onTimedOut;

  // Effect 1: Detect whether we should be waiting for the animateur
  useEffect(() => {
    if (!sessionStarted || isTestGroup) {
      setWaitingForAnimateur(false);
      return;
    }

    const effectiveUid = firestoreSession?.currentAnimateurUid || createurUid;
    const animateurPresent = liveKitParticipants.some(p => p.identity === effectiveUid);

    if (animateurPresent) {
      // Animateur is here — stop waiting
      setWaitingForAnimateur(false);
      setWaitCountdownSec(180);
      setCanPropose(false);
    } else if (!timedOut) {
      // Animateur absent and not yet timed out — start waiting
      setWaitingForAnimateur(true);
    }
  }, [
    sessionStarted,
    liveKitParticipants,
    firestoreSession?.currentAnimateurUid,
    createurUid,
    isTestGroup,
    timedOut
  ]);

  // Effect 2: Run the countdown timer independently when waitingForAnimateur is true
  useEffect(() => {
    if (!waitingForAnimateur) {
      // Reset when no longer waiting
      clearInterval(timerRef.current);
      return;
    }

    // Reset countdown at start
    setWaitCountdownSec(180);
    setCanPropose(false);

    timerRef.current = setInterval(() => {
      setWaitCountdownSec(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimedOut(true);
          setWaitingForAnimateur(false);
          onTimedOutRef.current?.();
          return 0;
        }
        if (prev === 60) {
          // After 2 minutes, allow someone to propose as animateur
          setCanPropose(true);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [waitingForAnimateur]);

  return { waitingForAnimateur, waitCountdownSec, canPropose, timedOut };
}
