import emojiRegex from 'emoji-regex';
import { createChatCompletion } from './openai';

const SYSTEM_PROMPT = `Tu es un modérateur bienveillant qui aide à reformuler les messages des parents tout en préservant leur sens et leur émotion.

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
   - autres

6. Format de réponse JSON OBLIGATOIRE :
   - Si le message est incompréhensible : 
     {
       "error": "Votre message semble difficile à comprendre. Pouvez-vous le reformuler ?"
     }
   - Si le message est valide : 
     {
       "text": "Message reformulé",
       "category": "catégorie_détectée"
     }`;

export interface ModerationResult {
  error?: string;
  text?: string;
  category?: string;
}

export const moderateMessage = async (message: string, isResponse: boolean = false): Promise<ModerationResult> => {
  try {
    // Check if message is too short or just emojis
    const regex = emojiRegex();
    const messageWithoutEmojis = message.replace(regex, '').trim();
    if (messageWithoutEmojis.length < 2) {
      return {
        error: "Votre message semble difficile à comprendre. Pouvez-vous le reformuler ?"
      };
    }

    const systemPrompt = isResponse ? 
      `${SYSTEM_PROMPT}\n\nNote: Ce message est une réponse à un autre message. Assure-toi qu'il reste dans le contexte d'une réponse bienveillante.` :
      SYSTEM_PROMPT;

    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Modère ce message et retourne un objet JSON selon le format spécifié : ${message}`
      }
    ];

    const completion = await createChatCompletion(messages, "gpt-3.5-turbo", 500);
    const response = JSON.parse(completion.choices[0].message.content || '{}');
    
    if (response.error) {
      return { error: response.error };
    }

    return { 
      text: response.text,
      category: response.category
    };
  } catch (error) {
    console.error('Error moderating message:', error);
    return {
      error: "Une erreur est survenue lors de la modération du message. Veuillez réessayer."
    };
  }
};
