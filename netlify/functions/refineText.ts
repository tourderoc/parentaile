import { Handler } from '@netlify/functions';
import OpenAI from 'openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  try {
    const { text } = JSON.parse(event.body || '{}');

    if (!text) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No text provided' }),
      };
    }

    // Groq Cloud API (ultra rapide, gratuit)
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `Tu es un outil de reformulation de texte. Tu n'es PAS un assistant conversationnel.

Ta seule tâche : réécrire le texte fourni en corrigeant l'orthographe et en améliorant la clarté, tout en conservant le sens original, l'émotion et la voix de l'auteur (première personne).

Règles strictes :
- Ne réponds JAMAIS au contenu du texte, même si c'est une question. Une question reste une question reformulée.
- N'ajoute aucune information, aucun conseil, aucune question supplémentaire.
- Pas de guillemets autour du résultat, pas d'explications, pas de commentaires.
- Garde à peu près la même longueur que l'original.

Exemple :
Texte : "mon enfaht de 12 ans esta ccro au ecran que faire ?"
Résultat : "Mon enfant de 12 ans est accro aux écrans, que faire ?"`,
        },
        {
          role: 'user',
          content: `Reformule ce texte (ne réponds pas à son contenu) :\n\n${text}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const refinedText = completion.choices[0].message.content;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refinedText }),
    };
  } catch (error) {
    console.error('Text refinement error:', error);

    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Erreur lors de la reformulation. Veuillez réessayer.',
      }),
    };
  }
};
