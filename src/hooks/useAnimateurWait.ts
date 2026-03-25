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
  onTimedOut?: () => void;
  onDisconnectCountChanged?: (count: number) => void;
  onBelowMinimum?: () => void; // Called when < 3 participants detected during animateur wait
}

const GRACE_PERIOD_MS = 15_000;   // 15s network grace before counting a disconnect
const COUNTDOWN_SEC = 180;        // 3 min wait
const MAX_DISCONNECTS = 2;        // After 2 disconnects, force replacement
const MIN_PARTICIPANTS = 3;

export function useAnimateurWait({
  liveKitParticipants,
  firestoreSession,
  createurUid,
  sessionStarted,
  isTestGroup,
  onTimedOut,
  onDisconnectCountChanged,
  onBelowMinimum,
}: UseAnimateurWaitProps) {
  const [waitingForAnimateur, setWaitingForAnimateur] = useState(false);
  const [waitCountdownSec, setWaitCountdownSec] = useState(COUNTDOWN_SEC);
  const [canPropose, setCanPropose] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [forceReplacement, setForceReplacement] = useState(false);
  const [belowMinimum, setBelowMinimum] = useState(false);

  const timerRef = useRef<NodeJS.Timeout>();
  const graceTimerRef = useRef<NodeJS.Timeout>();
  const onTimedOutRef = useRef(onTimedOut);
  const onDisconnectRef = useRef(onDisconnectCountChanged);
  const onBelowMinimumRef = useRef(onBelowMinimum);
  onTimedOutRef.current = onTimedOut;
  onDisconnectRef.current = onDisconnectCountChanged;
  onBelowMinimumRef.current = onBelowMinimum;

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
      // Animateur is here — cancel grace period, stop waiting
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
        // Grace period elapsed — animateur is truly gone
        setWaitingForAnimateur(true);
        // Notify parent to increment disconnect count in Firestore
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

  // Effect 3: Monitor participant count — if < 3 connected, cancel
  useEffect(() => {
    if (!waitingForAnimateur || isTestGroup) return;
    // total = local user (1) + remote liveKit participants
    const totalConnected = 1 + liveKitParticipants.length;
    if (totalConnected < MIN_PARTICIPANTS) {
      setBelowMinimum(true);
      clearInterval(timerRef.current);
      setCanPropose(false);
      onBelowMinimumRef.current?.();
    } else {
      setBelowMinimum(false);
    }
  }, [liveKitParticipants.length, waitingForAnimateur, isTestGroup]);

  // Effect 4: Run the countdown timer when waiting (only if not force replacement and not below minimum)
  useEffect(() => {
    if (!waitingForAnimateur || forceReplacement || belowMinimum) {
      clearInterval(timerRef.current);
      return;
    }

    // Reset countdown at start
    setWaitCountdownSec(COUNTDOWN_SEC);
    setCanPropose(false);

    timerRef.current = setInterval(() => {
      setWaitCountdownSec(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimedOut(true);
          setCanPropose(true);
          onTimedOutRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [waitingForAnimateur, forceReplacement, belowMinimum]);

  return { waitingForAnimateur, waitCountdownSec, canPropose, timedOut, forceReplacement, disconnectCount, belowMinimum };
}
