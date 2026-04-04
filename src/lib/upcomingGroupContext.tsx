import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { onGroupesParole } from './groupeParoleService';
import type { GroupeParole } from '../types/groupeParole';

// ============================================
// TYPES
// ============================================

export type Urgency = 'none' | 'calm' | 'warm' | 'urgent';

export interface UpcomingGroupContextType {
  /** Le groupe le plus proche (imminent ou en cours) */
  upcomingGroup: GroupeParole | null;
  /** Minutes restantes avant le debut (negatif = en cours) */
  minutesLeft: number;
  /** Niveau d'urgence visuelle */
  urgency: Urgency;
  /** Masquer la carte pour ce groupe (dismiss) */
  dismiss: () => void;
}

// ============================================
// CONTEXT
// ============================================

const UpcomingGroupContext = createContext<UpcomingGroupContextType>({
  upcomingGroup: null,
  minutesLeft: 0,
  urgency: 'none',
  dismiss: () => {},
});

export const useUpcomingGroup = () => useContext(UpcomingGroupContext);

// ============================================
// HELPERS
// ============================================

function getUrgency(minutesLeft: number): Urgency {
  // En cours (jusqu'a 60 min apres le debut)
  if (minutesLeft <= 0) return 'urgent';
  // Moins de 5 min
  if (minutesLeft <= 5) return 'urgent';
  // 5-15 min (salle ouverte)
  if (minutesLeft <= 15) return 'warm';
  // 15-30 min
  if (minutesLeft <= 30) return 'calm';
  return 'none';
}

function findUpcomingGroup(groupes: GroupeParole[], uid: string): { group: GroupeParole | null; minutesLeft: number } {
  const now = Date.now();

  // Filtrer : groupes ou le user est participant, pas un test group, ET non annulés
  const myGroups = groupes.filter(g =>
    g.status !== 'cancelled' &&
    g.status !== 'completed' &&
    g.participants.some(p => p.uid === uid && !p.banni)
  );

  let best: GroupeParole | null = null;
  let bestMinutes = Infinity;

  for (const g of myGroups) {
    const diff = (g.dateVocal.getTime() - now) / 60000;

    // Fenetre : 30 min avant → 60 min apres le debut
    if (diff > 30) continue;
    if (diff < -60) continue;

    // Skip si session terminee (par status OU par sessionState)
    // Le double check couvre le cas ou cancelGroup() ecrit sessionState mais pas status
    if (g.status === 'cancelled' || g.status === 'completed') continue;
    if (g.sessionState?.sessionActive === false) continue;

    // Filet de securite : si dateVocal est passee depuis plus de 5 min
    // et que la session n'a jamais demarree, considerer le groupe comme mort
    if (diff < -5 && g.status !== 'in_progress' && !g.sessionState) continue;

    // Prendre le plus proche / le plus urgent
    if (diff < bestMinutes) {
      bestMinutes = diff;
      best = g;
    }
  }

  return { group: best, minutesLeft: Math.ceil(bestMinutes) };
}

// ============================================
// PROVIDER
// ============================================

export const UpcomingGroupProvider = ({ children }: { children: React.ReactNode }) => {
  const [uid, setUid] = useState<string | null>(null);
  const [groupes, setGroupes] = useState<GroupeParole[]>([]);
  const [upcomingGroup, setUpcomingGroup] = useState<GroupeParole | null>(null);
  const [minutesLeft, setMinutesLeft] = useState(0);
  const [urgency, setUrgency] = useState<Urgency>('none');
  const [dismissedGroupId, setDismissedGroupId] = useState<string | null>(null);
  const groupesRef = useRef(groupes);
  groupesRef.current = groupes;

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
    });
    return unsub;
  }, []);

  // Groupes listener
  useEffect(() => {
    if (!uid) {
      setGroupes([]);
      return;
    }
    const unsub = onGroupesParole((g) => setGroupes(g));
    return unsub;
  }, [uid]);

  // Recalcul toutes les 30s
  useEffect(() => {
    const recalc = () => {
      if (!uid) {
        setUpcomingGroup(null);
        setUrgency('none');
        return;
      }

      const { group, minutesLeft: ml } = findUpcomingGroup(groupesRef.current, uid);

      if (!group || group.id === dismissedGroupId) {
        setUpcomingGroup(null);
        setUrgency('none');
        return;
      }

      setUpcomingGroup(group);
      setMinutesLeft(ml);
      setUrgency(getUrgency(ml));
    };

    recalc();
    const interval = setInterval(recalc, 30000);
    return () => clearInterval(interval);
  }, [uid, groupes, dismissedGroupId]);

  const dismiss = () => {
    if (upcomingGroup) {
      setDismissedGroupId(upcomingGroup.id);
    }
  };

  return (
    <UpcomingGroupContext.Provider value={{ upcomingGroup, minutesLeft, urgency, dismiss }}>
      {children}
    </UpcomingGroupContext.Provider>
  );
};

export default UpcomingGroupContext;
