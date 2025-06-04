import { collection, doc, getDoc, getDocs, query, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface AIPrompt {
  id: string;
  name: string;
  function: string;
  content: string;
  defaultContent: string;
  updatedAt: Date;
}

const defaultPrompts = {
  'fiche_livre_amazon': {
    name: 'Extraction Amazon',
    function: 'boutique',
    content: `Tu es un assistant qui aide à remplir une fiche produit pour un livre destiné à des parents ou à des enfants.

À partir du lien Amazon que je vais te fournir, lis la page et extrait uniquement les informations utiles pour pré-remplir une fiche de boutique.
Ne fais aucun résumé personnel, ne reformule pas.

📌 Extrait uniquement les éléments suivants (sous forme d'objet JSON) :

titre : titre exact du livre tel qu'il apparaît sur Amazon (sans sous-titre marketing)
description : description du livre (section éditeur, résumé, ou quatrième de couverture)
age : tranche d'âge cible si elle est indiquée (ex : "6–9 ans", "à partir de 3 ans")
auteur : nom de l'auteur (si présent)
imageUrl : laisser vide (l'image sera fournie manuellement)

❌ Ne récupère pas l'image Amazon ni le prix. Ignore tout ce qui concerne la livraison ou les formats Kindle.

✅ Fournis uniquement un objet JSON clair et complet`,
    defaultContent: `Tu es un assistant qui aide à remplir une fiche produit pour un livre destiné à des parents ou à des enfants.

À partir du lien Amazon que je vais te fournir, lis la page et extrait uniquement les informations utiles pour pré-remplir une fiche de boutique.
Ne fais aucun résumé personnel, ne reformule pas.

📌 Extrait uniquement les éléments suivants (sous forme d'objet JSON) :

titre : titre exact du livre tel qu'il apparaît sur Amazon (sans sous-titre marketing)
description : description du livre (section éditeur, résumé, ou quatrième de couverture)
age : tranche d'âge cible si elle est indiquée (ex : "6–9 ans", "à partir de 3 ans")
auteur : nom de l'auteur (si présent)
imageUrl : laisser vide (l'image sera fournie manuellement)

❌ Ne récupère pas l'image Amazon ni le prix. Ignore tout ce qui concerne la livraison ou les formats Kindle.

✅ Fournis uniquement un objet JSON clair et complet`
  },
  'moderation_forum': {
    name: 'Modération Forum',
    function: 'forum',
    content: `Tu es un modérateur bienveillant qui aide à reformuler les messages des parents tout en préservant leur sens et leur émotion.

Règles STRICTES à suivre :

1. Si le message n'a pas de sens (suite de lettres aléatoires, texte incohérent) :
   - Retourner un objet JSON avec une propriété "error"

2. Pour les mots violents/inappropriés :
   - Remplacer par des émojis appropriés (😡, 😢, 🤯, etc.)
   - Ne jamais supprimer le message
   - Le rendre publiable sans violence directe

3. Correction orthographique :
   - Corriger uniquement les fautes qui gênent la compréhension
   - Garder le style simple/familier de l'auteur
   - Ne pas réécrire complètement

4. INTERDIT :
   - Pas de commentaires ni d'analyses
   - Pas de conseils ni de suggestions
   - Pas de formules comme "je vous conseille" ou "il semble que"

5. Détecter la catégorie du message parmi :
   - fatigue
   - education
   - sante
   - developpement
   - alimentation
   - sommeil
   - autres`,
    defaultContent: `Tu es un modérateur bienveillant qui aide à reformuler les messages des parents tout en préservant leur sens et leur émotion.

Règles STRICTES à suivre :

1. Si le message n'a pas de sens (suite de lettres aléatoires, texte incohérent) :
   - Retourner un objet JSON avec une propriété "error"

2. Pour les mots violents/inappropriés :
   - Remplacer par des émojis appropriés (😡, 😢, 🤯, etc.)
   - Ne jamais supprimer le message
   - Le rendre publiable sans violence directe

3. Correction orthographique :
   - Corriger uniquement les fautes qui gênent la compréhension
   - Garder le style simple/familier de l'auteur
   - Ne pas réécrire complètement

4. INTERDIT :
   - Pas de commentaires ni d'analyses
   - Pas de conseils ni de suggestions
   - Pas de formules comme "je vous conseille" ou "il semble que"

5. Détecter la catégorie du message parmi :
   - fatigue
   - education
   - sante
   - developpement
   - alimentation
   - sommeil
   - autres`
  },
  'inactive_posts': {
    name: 'Nettoyage posts inactifs',
    function: 'forum',
    content: `Tu es une IA chargée d'évaluer la pertinence d'un post publié sur un forum parental. Le post a été publié il y a plus d'une semaine et n'a reçu aucune réponse. 
Évalue s'il est encore utile de le conserver. Supprime-le s'il est vide, incompréhensible, hors sujet ou sans intérêt pour d'autres parents.

Réponds uniquement par : CONSERVER ou SUPPRIMER.

Contenu du post :
"{{contenu_du_post}}"`,
    defaultContent: `Tu es une IA chargée d'évaluer la pertinence d'un post publié sur un forum parental. Le post a été publié il y a plus d'une semaine et n'a reçu aucune réponse. 
Évalue s'il est encore utile de le conserver. Supprime-le s'il est vide, incompréhensible, hors sujet ou sans intérêt pour d'autres parents.

Réponds uniquement par : CONSERVER ou SUPPRIMER.

Contenu du post :
"{{contenu_du_post}}"`
  }
};

export const initializeDefaultPrompts = async () => {
  try {
    for (const [id, prompt] of Object.entries(defaultPrompts)) {
      const promptRef = doc(db, 'prompts', id);
      const promptDoc = await getDoc(promptRef);
      
      if (!promptDoc.exists()) {
        await setDoc(promptRef, {
          ...prompt,
          id,
          updatedAt: new Date()
        });
      }
    }
  } catch (error) {
    console.error('Error initializing default prompts:', error);
  }
};

export const getPrompt = async (promptId: string): Promise<string> => {
  try {
    const promptRef = doc(db, 'prompts', promptId);
    const promptDoc = await getDoc(promptRef);
    
    if (promptDoc.exists()) {
      return promptDoc.data().content;
    }
    
    return defaultPrompts[promptId as keyof typeof defaultPrompts]?.content || '';
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return defaultPrompts[promptId as keyof typeof defaultPrompts]?.content || '';
  }
};

export const getAllPrompts = async (): Promise<AIPrompt[]> => {
  try {
    await initializeDefaultPrompts();
    
    const promptsRef = collection(db, 'prompts');
    const promptsSnapshot = await getDocs(query(promptsRef));
    
    return promptsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      updatedAt: doc.data().updatedAt?.toDate()
    })) as AIPrompt[];
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return [];
  }
};

export const updatePrompt = async (promptId: string, content: string): Promise<void> => {
  try {
    const promptRef = doc(db, 'prompts', promptId);
    await updateDoc(promptRef, {
      content,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error updating prompt:', error);
    throw error;
  }
};