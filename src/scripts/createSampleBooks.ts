import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const sampleBooks = [
  {
    title: "Petit renard cherche son calme",
    description: "Un voyage poétique et apaisant où Petit Renard apprend à gérer ses émotions grâce à la respiration et la méditation. Une histoire douce qui aide les enfants à trouver leur calme intérieur.",
    short_description: "Un voyage poétique pour apprendre à respirer.",
    age_range: "4-6 ans",
    price: 12.99,
    amazon_link: "https://www.amazon.fr",
    image_url: "https://picsum.photos/400/600",
    themes: ["Émotions", "Nature", "Bien-être"],
    emotions: ["Anxiété", "Calme"],
    added_date: serverTimestamp()
  },
  {
    title: "Boris n'aime pas dormir",
    description: "Boris le petit ours a peur du noir et ne veut pas aller dormir. Une histoire rassurante qui accompagne les enfants dans leur routine du coucher.",
    short_description: "Une histoire rassurante pour apprivoiser le coucher.",
    age_range: "3-5 ans",
    price: 14.99,
    amazon_link: "https://www.amazon.fr",
    image_url: "https://picsum.photos/400/600",
    themes: ["Sommeil", "Peurs", "Famille"],
    emotions: ["Peur", "Sécurité"],
    added_date: serverTimestamp()
  },
  {
    title: "Le dragon des émotions",
    description: "Un dragon magique aide les enfants à comprendre et exprimer leurs émotions. Chaque couleur représente un sentiment différent dans cette histoire interactive.",
    short_description: "Un conte pour mieux comprendre ses émotions.",
    age_range: "6-9 ans",
    price: 16.99,
    amazon_link: "https://www.amazon.fr",
    image_url: "https://picsum.photos/400/600",
    themes: ["Émotions", "Fantaisie"],
    emotions: ["Joie", "Colère", "Tristesse"],
    added_date: serverTimestamp()
  },
  {
    title: "Une colère dans la soupe",
    description: "Quand la colère monte comme une soupe qui déborde, comment faire pour se calmer ? Une métaphore amusante pour parler de la gestion de la colère.",
    short_description: "Quand les émotions s'invitent à table !",
    age_range: "4-6 ans",
    price: 13.99,
    amazon_link: "https://www.amazon.fr",
    image_url: "https://picsum.photos/400/600",
    themes: ["Émotions", "Famille", "Humour"],
    emotions: ["Colère"],
    added_date: serverTimestamp()
  },
  {
    title: "La boîte à câlins",
    description: "Une histoire tendre sur l'importance des câlins et de l'affection dans la famille. Un livre doux qui célèbre l'amour et le réconfort.",
    short_description: "Une histoire tendre sur les besoins affectifs.",
    age_range: "3-5 ans",
    price: 15.99,
    amazon_link: "https://www.amazon.fr",
    image_url: "https://picsum.photos/400/600",
    themes: ["Famille", "Amour", "Émotions"],
    emotions: ["Amour", "Joie"],
    added_date: serverTimestamp()
  }
];

const createSampleBooks = async () => {
  try {
    for (const book of sampleBooks) {
      await addDoc(collection(db, 'livres_enfants'), book);
      console.log('Book created successfully:', book.title);
    }
    console.log('All sample books created successfully');
  } catch (error) {
    console.error('Error creating sample books:', error);
  }
};

createSampleBooks();