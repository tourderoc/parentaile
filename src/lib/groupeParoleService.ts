import { db } from './firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import type { GroupeParole, ThemeGroupe, StructureEtape } from '../types/groupeParole';

export interface CreateGroupeData {
  titre: string;
  description: string;
  theme: ThemeGroupe;
  createurUid: string;
  createurPseudo: string;
  dateVocal: Date;
  structureType: 'libre' | 'structuree';
  structure?: StructureEtape[];
}

/**
 * Crée un nouveau groupe de parole dans Firestore.
 * Le créateur est automatiquement ajouté comme premier participant et inscrit au vocal.
 * L'expiration est calculée à dateCreation + 7 jours.
 */
export async function createGroupeParole(data: CreateGroupeData): Promise<string> {
  const dateExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const groupeDoc = {
    titre: data.titre,
    description: data.description,
    theme: data.theme,
    createurUid: data.createurUid,
    createurPseudo: data.createurPseudo,
    dateCreation: serverTimestamp(),
    dateVocal: Timestamp.fromDate(data.dateVocal),
    dateExpiration: Timestamp.fromDate(dateExpiration),
    participantsMax: 5,
    structureType: data.structureType,
    ...(data.structureType === 'structuree' && data.structure
      ? { structure: data.structure }
      : {}),
    participants: [
      {
        uid: data.createurUid,
        pseudo: data.createurPseudo,
        inscritVocal: true,
        dateInscription: Timestamp.now(),
      },
    ],
  };

  const docRef = await addDoc(collection(db, 'groupes'), groupeDoc);
  return docRef.id;
}

/**
 * Écoute en temps réel les groupes de parole non expirés.
 * Retourne une fonction unsubscribe pour arrêter l'écoute.
 */
export function onGroupesParole(
  callback: (groupes: GroupeParole[]) => void
): () => void {
  const q = query(
    collection(db, 'groupes'),
    orderBy('dateCreation', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const now = new Date();
    const groupes: GroupeParole[] = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          titre: d.titre || '',
          description: d.description || '',
          theme: d.theme || 'autre',
          createurUid: d.createurUid || '',
          createurPseudo: d.createurPseudo || '',
          dateCreation: d.dateCreation?.toDate?.() || new Date(),
          dateVocal: d.dateVocal?.toDate?.() || new Date(),
          dateExpiration: d.dateExpiration?.toDate?.() || new Date(),
          participantsMax: d.participantsMax || 5,
          structureType: d.structureType || 'libre',
          structure: d.structure,
          participants: (d.participants || []).map((p: any) => ({
            uid: p.uid,
            pseudo: p.pseudo,
            inscritVocal: p.inscritVocal ?? false,
            dateInscription: p.dateInscription?.toDate?.() || new Date(),
          })),
          messages: [],
        } as GroupeParole;
      })
      .filter((g) => g.dateExpiration > now);

    callback(groupes);
  }, (error) => {
    console.error('Erreur chargement groupes:', error);
    callback([]);
  });
}
