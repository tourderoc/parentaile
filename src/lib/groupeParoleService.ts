import { db } from './firebase';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  onSnapshot,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import type { GroupeParole, MessageGroupe, ThemeGroupe, StructureEtape } from '../types/groupeParole';

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
          messageCount: d.messageCount || 0,
        } as GroupeParole;
      })
      .filter((g) => g.dateExpiration > now);

    callback(groupes);
  }, (error) => {
    console.error('Erreur chargement groupes:', error);
    callback([]);
  });
}

/**
 * Écoute en temps réel un seul groupe de parole.
 */
export function onGroupeParole(
  groupeId: string,
  callback: (groupe: GroupeParole | null) => void
): () => void {
  return onSnapshot(doc(db, 'groupes', groupeId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const d = snapshot.data();
    callback({
      id: snapshot.id,
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
      messageCount: d.messageCount || 0,
    } as GroupeParole);
  }, (error) => {
    console.error('Erreur chargement groupe:', error);
    callback(null);
  });
}

/**
 * Écoute en temps réel les messages d'un groupe (sous-collection).
 */
export function onGroupeMessages(
  groupeId: string,
  callback: (messages: MessageGroupe[]) => void
): () => void {
  const q = query(
    collection(db, 'groupes', groupeId, 'messages'),
    orderBy('dateEnvoi', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const messages: MessageGroupe[] = snapshot.docs.map((d) => ({
      id: d.id,
      auteurUid: d.data().auteurUid || '',
      auteurPseudo: d.data().auteurPseudo || '',
      contenu: d.data().contenu || '',
      dateEnvoi: d.data().dateEnvoi?.toDate?.() || new Date(),
    }));
    callback(messages);
  }, (error) => {
    console.error('Erreur chargement messages:', error);
    callback([]);
  });
}

/**
 * Envoie un message dans un groupe.
 */
export async function sendGroupeMessage(
  groupeId: string,
  message: { auteurUid: string; auteurPseudo: string; contenu: string }
): Promise<string> {
  const docRef = await addDoc(collection(db, 'groupes', groupeId, 'messages'), {
    auteurUid: message.auteurUid,
    auteurPseudo: message.auteurPseudo,
    contenu: message.contenu,
    dateEnvoi: serverTimestamp(),
  });

  await updateDoc(doc(db, 'groupes', groupeId), {
    messageCount: increment(1),
  });

  return docRef.id;
}

/**
 * Supprime un message d'un groupe (modération par le créateur).
 */
export async function deleteGroupeMessage(
  groupeId: string,
  messageId: string
): Promise<void> {
  await deleteDoc(doc(db, 'groupes', groupeId, 'messages', messageId));
  await updateDoc(doc(db, 'groupes', groupeId), {
    messageCount: increment(-1),
  });
}

/**
 * Rejoint un groupe de parole.
 */
export async function rejoindreGroupe(
  groupeId: string,
  participant: { uid: string; pseudo: string }
): Promise<void> {
  await updateDoc(doc(db, 'groupes', groupeId), {
    participants: arrayUnion({
      uid: participant.uid,
      pseudo: participant.pseudo,
      inscritVocal: true,
      dateInscription: Timestamp.now(),
    }),
  });
}

/**
 * Quitte un groupe de parole.
 */
export async function quitterGroupe(
  groupeId: string,
  participantUid: string
): Promise<void> {
  const snapshot = await getDoc(doc(db, 'groupes', groupeId));
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  const updatedParticipants = (data.participants || []).filter(
    (p: any) => p.uid !== participantUid
  );
  await updateDoc(doc(db, 'groupes', groupeId), {
    participants: updatedParticipants,
  });
}
