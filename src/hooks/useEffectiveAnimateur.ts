import { useMemo } from 'react';
import type { SessionState } from '../types/groupeParole';

interface UseEffectiveAnimateurProps {
  firestoreSession?: SessionState;
  createurUid: string;
  localUid: string;
}

export function useEffectiveAnimateur({
  firestoreSession,
  createurUid,
  localUid
}: UseEffectiveAnimateurProps) {
  const effectiveAnimateurUid = useMemo(() => {
    return firestoreSession?.currentAnimateurUid || createurUid;
  }, [firestoreSession?.currentAnimateurUid, createurUid]);

  const isEffectiveAnimateur = effectiveAnimateurUid === localUid;
  const isReplacementAnimateur = !!firestoreSession?.replacementUsed && isEffectiveAnimateur;

  return {
    effectiveAnimateurUid,
    isEffectiveAnimateur,
    isReplacementAnimateur,
  };
}
