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
    const { description, theme } = JSON.parse(event.body || '{}');

    if (!description || !theme) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Description and theme are required' }),
      };
    }

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant pour une application de groupes de parole entre parents.
Génère un titre TRÈS COURT (2 à 5 mots maximum, 30 caractères max) qui résume la situation du parent.
Le titre doit être direct et parlant, comme une expression du quotidien.
Exemples : "Crises de colère", "Mon enfant me tyrannise", "Refus scolaire", "Nuits sans sommeil", "Opposition constante", "Jalousie entre frères".
Réponds uniquement avec le titre, sans guillemets, sans ponctuation finale, sans explications.`,
        },
        {
          role: 'user',
          content: `Thème : ${theme}\nSituation : ${description}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 20,
    });

    const title = completion.choices[0].message.content?.trim() || '';

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    };
  } catch (error) {
    console.error('Title suggestion error:', error);

    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Erreur lors de la suggestion de titre.',
      }),
    };
  }
};
