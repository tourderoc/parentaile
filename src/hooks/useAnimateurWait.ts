import { useState, useEffect, useRef } from 'react';
import { Participant } from 'livekit-client';
import type { SessionState } from '../types/groupeParole';

interface UseAnimateurWaitProps {
  groupeId: string;
  liveKitParticipants: Participant[];
  firestoreSession?: SessionState;
  createurUid: string;
  sessionStarted: boolean;
  isTestGroup?: boolean;
  onTimedOut?: (totalConnected: number) => void;
  onDisconnectCountChanged?: (count: number) => void;
}

const GRACE_PERIOD_MS = 15_000;   // 15s network grace before counting a disconnect
const COUNTDOWN_SEC = 180;        // 3 min wait
const MAX_DISCONNECTS = 2;        // After 2 disconnects, force replacement

export function useAnimateurWait({
  liveKitParticipants,
  firestoreSession,
  createurUid,
  sessionStarted,
  isTestGroup,
  onTimedOut,
  onDisconnectCountChanged,
}: UseAnimateurWaitProps) {
  const [waitingForAnimateur, setWaitingForAnimateur] = useState(false);
  const [waitCountdownSec, setWaitCountdownSec] = useState(COUNTDOWN_SEC);
  const [canPropose, setCanPropose] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [forceReplacement, setForceReplacement] = useState(false);

  const timerRef = useRef<NodeJS.Timeout>();
  const graceTimerRef = useRef<NodeJS.Timeout>();
  const onTimedOutRef = useRef(onTimedOut);
  const onDisconnectRef = useRef(onDisconnectCountChanged);
  // Keep a live ref to participant count so the timer callback reads the latest value
  const liveParticipantsRef = useRef(liveKitParticipants);
  liveParticipantsRef.current = liveKitParticipants;
  onTimedOutRef.current = onTimedOut;
  onDisconnectRef.current = onDisconnectCountChanged;

  // Track disconnect count from Firestore
  const disconnectCount = firestoreSession?.animateurDisconnectCount || 0;

  // Effect 1: Detect animateur presence with 15s grace period
  useEffect(() => {
    if (!sessionStarted || isTestGroup) {
      setWaitingForAnimateur(false);
      clearTimeout(graceTimerRef.current);
      return;
    }

    const effectiveUid = firestoreSession?.currentAnimateurUid || createurUid;
    const animateurPresent = liveKitParticipants.some(p => p.identity === effectiveUid);

    if (animateurPresent) {
      clearTimeout(graceTimerRef.current);
      setWaitingForAnimateur(false);
      setWaitCountdownSec(COUNTDOWN_SEC);
      setCanPropose(false);
      setTimedOut(false);
      return;
    }

    // Animateur absent — start grace period if not already waiting
    if (!waitingForAnimateur && !timedOut && !forceReplacement) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = setTimeout(() => {
        setWaitingForAnimateur(true);
        onDisconnectRef.current?.(disconnectCount + 1);
      }, GRACE_PERIOD_MS);
    }

    return () => clearTimeout(graceTimerRef.current);
  }, [
    sessionStarted,
    liveKitParticipants,
    firestoreSession?.currentAnimateurUid,
    createurUid,
    isTestGroup,
    timedOut,
    forceReplacement,
    waitingForAnimateur,
    disconnectCount,
  ]);

  // Effect 2: Check if max disconnects reached → force replacement immediately
  useEffect(() => {
    if (disconnectCount >= MAX_DISCONNECTS && waitingForAnimateur) {
      clearInterval(timerRef.current);
      setForceReplacement(true);
      setCanPropose(true);
      setWaitCountdownSec(0);
    }
  }, [disconnectCount, waitingForAnimateur]);

  // Effect 3: Run the countdown timer when waiting
  useEffect(() => {
    if (!waitingForAnimateur || forceReplacement) {
      clearInterval(timerRef.current);
      return;
    }

    setWaitCountdownSec(COUNTDOWN_SEC);
    setCanPropose(false);

    timerRef.current = setInterval(() => {
      setWaitCountdownSec(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimedOut(true);
          setCanPropose(true);
          // Pass current connected count so parent can decide: replace or cancel
          const totalConnected = 1 + liveParticipantsRef.current.length;
          onTimedOutRef.current?.(totalConnected);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [waitingForAnimateur, forceReplacement]);

  return { waitingForAnimateur, waitCountdownSec, canPropose, timedOut, forceReplacement, disconnectCount };
}
