import { db } from './firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { ThemeGroupe, StructureEtape } from '../types/groupeParole';

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
