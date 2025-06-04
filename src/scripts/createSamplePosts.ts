import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const samplePosts = [
  {
    content: "Je suis complètement épuisée depuis la naissance de mon deuxième enfant. Comment gérez-vous le manque de sommeil avec plusieurs enfants ?",
    category: "fatigue",
    authorId: "sample1",
    authorPseudo: "Marie33",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  },
  {
    content: "Mon fils de 3 ans refuse catégoriquement de manger des légumes. J'ai tout essayé : les présenter différemment, les cacher dans d'autres aliments... Des conseils ?",
    category: "alimentation",
    authorId: "sample2",
    authorPseudo: "Thomas_P",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  },
  {
    content: "Ma fille de 2 ans fait des crises de colère impressionnantes en public. Je me sens jugée et démunie. Comment réagissez-vous dans ces situations ?",
    category: "education",
    authorId: "sample3",
    authorPseudo: "Sophie_M",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000))
  },
  {
    content: "Question développement : mon bébé de 9 mois ne rampe pas encore. Est-ce normal ? Devrais-je consulter ?",
    category: "developpement",
    authorId: "sample4",
    authorPseudo: "Lucas_Parent",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000))
  },
  {
    content: "Mon enfant de 4 ans se réveille toutes les nuits en pleurant. Ça dure depuis 2 semaines. Quelqu'un a déjà vécu ça ?",
    category: "sommeil",
    authorId: "sample5",
    authorPseudo: "Emma_L",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
  },
  {
    content: "Je m'inquiète pour les vaccins de mon bébé. Quels sont vos retours d'expérience ? Des effets secondaires à surveiller ?",
    category: "sante",
    authorId: "sample6",
    authorPseudo: "Pierre_Parent",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))
  },
  {
    content: "Entre le travail et les enfants, je n'ai plus une minute à moi. Comment trouvez-vous du temps pour vous ressourcer ?",
    category: "fatigue",
    authorId: "sample7",
    authorPseudo: "Julie_B",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 36 * 60 * 60 * 1000))
  },
  {
    content: "Mon fils commence la maternelle dans un mois. Des conseils pour bien préparer cette transition ?",
    category: "education",
    authorId: "sample8",
    authorPseudo: "Marc_D",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  },
  {
    content: "Je cherche des idées d'activités éducatives pour un enfant de 18 mois. Que faites-vous avec les vôtres ?",
    category: "developpement",
    authorId: "sample9",
    authorPseudo: "Clara_M",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 12 * 60 * 60 * 1000))
  },
  {
    content: "Depuis la naissance de notre deuxième enfant, l'aîné est très jaloux. Comment avez-vous géré cette situation ?",
    category: "education",
    authorId: "sample10",
    authorPseudo: "Alex_Parent",
    createdAt: Timestamp.fromDate(new Date())
  }
];

const createSamplePosts = async () => {
  try {
    for (const post of samplePosts) {
      await addDoc(collection(db, 'posts'), post);
      console.log('Post created successfully');
    }
    console.log('All sample posts created successfully');
  } catch (error) {
    console.error('Error creating sample posts:', error);
  }
};

createSamplePosts();