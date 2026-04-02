import { useEffect, useRef, useCallback } from 'react';
import { Participant } from 'livekit-client';
import { VOCAL_CONFIG, VocalEvent } from '../machine';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { sendParentNotification } from '../../lib/parentNotificationService';

interface UseParticipantTrackerProps {
  groupeId: string;
  localUid: string;
  liveKitParticipants: Participant[];
  effectiveAnimateurUid: string;
  dispatch: (event: VocalEvent) => void;
}

interface ParticipantGrace {
  /** setTimeout ID for the 30s absence grace */
  timerId: ReturnType<typeof setTimeout>;
  /** Timestamp when absence was first detected */
  absentSince: number;
}

/**
 * Bridge LiveKit participants → VocalEvent.
 *
 * - Calculates participantCount & animateurPresent from LiveKit state
 * - Dispatches CONDITIONS_CHANGED when those values change
 * - Tracks per-participant 30s grace before counting an "exit"
 * - Increments Firestore participantExits/{uid}.count on confirmed exit
 * - Dispatches PARTICIPANT_BANNED when count > MAX_PARTICIPANT_EXITS
 */
export function useParticipantTracker({
  groupeId,
  localUid,
  liveKitParticipants,
  effectiveAnimateurUid,
  dispatch,
}: UseParticipantTrackerProps) {
  const graceMap = useRef(new Map<string, ParticipantGrace>());
  const prevIdentitiesRef = useRef(new Set<string>());
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Filter out the local participant to get only remote ones
  const remoteParticipants = liveKitParticipants.filter(p => !p.isLocal);

  // Derive current identities set of remote participants, ensure valid strings
  const currentIdentities = new Set(
    remoteParticipants.map(p => p.identity).filter(Boolean) as string[]
  );

  // Total count includes local user (1) + remote participants
  const participantCount = 1 + remoteParticipants.length;
  const animateurPresent =
    localUid === effectiveAnimateurUid ||
    currentIdentities.has(effectiveAnimateurUid);

  // ---- Handle confirmed exit: increment Firestore + check ban ----
  const handleConfirmedExit = useCallback(async (uid: string) => {
    if (!uid) return;
    console.log(`[PARTICIPANT_TRACKER] Confirmed exit: ${uid}`);
    try {
      const exitRef = doc(db, 'groupes', groupeId, 'participantExits', uid);
      const snap = await getDoc(exitRef);

      if (snap.exists()) {
        await setDoc(exitRef, { count: increment(1), lastExitAt: new Date() }, { merge: true });
      } else {
        await setDoc(exitRef, { count: 1, lastExitAt: new Date(), banned: false });
      }

      // Re-read to check ban threshold
      const updated = await getDoc(exitRef);
      const data = updated.data();
      if (data && data.count > VOCAL_CONFIG.MAX_PARTICIPANT_EXITS) {
        await setDoc(exitRef, { banned: true }, { merge: true });
        // Sync banni flag in groupe participants array
        try {
          const groupeRef = doc(db, 'groupes', groupeId);
          const groupeSnap = await getDoc(groupeRef);
          if (groupeSnap.exists()) {
            const groupeData = groupeSnap.data();
            const participants = groupeData.participants || [];
            const updatedParticipants = participants.map((p: any) =>
              p.uid === uid ? { ...p, banni: true } : p
            );
            await updateDoc(groupeRef, { participants: updatedParticipants });

            // Notifier le banni
            const groupeTitre: string = groupeData.titre || 'ce groupe';
            sendParentNotification(
              uid,
              'group_banned',
              'Vous avez été exclu du groupe',
              `Vous avez été définitivement banni du groupe "${groupeTitre}" suite à plusieurs départs de la salle.`,
              { groupeId, groupeTitre }
            ).catch(() => {});
          }
        } catch (err) {
          console.error(`[PARTICIPANT_TRACKER] Failed to sync banni flag for ${uid}:`, err);
        }
        dispatchRef.current({ type: 'PARTICIPANT_BANNED', uid });
      }
    } catch (err) {
      console.error(`[PARTICIPANT_TRACKER] Failed to record exit for ${uid}:`, err);
    }
  }, [groupeId]);

  // ---- Detect joins/leaves and manage grace timers ----
  useEffect(() => {
    const prev = prevIdentitiesRef.current;
    const graces = graceMap.current;

    // Participants who left
    prev.forEach(uid => {
      if (!currentIdentities.has(uid) && uid !== localUid && !graces.has(uid)) {
        // Start 30s grace
        const timerId = setTimeout(() => {
          graces.delete(uid);
          handleConfirmedExit(uid);
        }, VOCAL_CONFIG.GRACE_PERIOD_SEC * 1000);

        graces.set(uid, { timerId, absentSince: Date.now() });
      }
    });

    // Participants who (re)joined — cancel grace if pending
    currentIdentities.forEach(uid => {
      const grace = graces.get(uid);
      if (grace) {
        clearTimeout(grace.timerId);
        graces.delete(uid);
        console.log(`[PARTICIPANT_TRACKER] Grace cancelled (returned): ${uid}`);
      }
    });

    prevIdentitiesRef.current = new Set(currentIdentities);
  }, [liveKitParticipants, localUid, handleConfirmedExit, currentIdentities]);

  // ---- Dispatch CONDITIONS_CHANGED on count/animateur changes ----
  // IMPORTANT: Use sentinel values (-1 / null) so the first render ALWAYS dispatches,
  // guaranteeing the machine has accurate participantCount + animateurPresent
  // BEFORE the HOUR_REACHED event fires (which uses these values to choose the reason).
  const prevCountRef = useRef(-1);
  const prevAnimRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (participantCount !== prevCountRef.current || animateurPresent !== prevAnimRef.current) {
      prevCountRef.current = participantCount;
      prevAnimRef.current = animateurPresent;
      dispatchRef.current({
        type: 'CONDITIONS_CHANGED',
        count: participantCount,
        animateurPresent,
      });
    }
  }, [participantCount, animateurPresent]);

  // ---- Cleanup all grace timers on unmount ----
  useEffect(() => {
    return () => {
      graceMap.current.forEach(grace => clearTimeout(grace.timerId));
      graceMap.current.clear();
    };
  }, []);

  return { participantCount, animateurPresent };
}
