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
Génère un titre court (maximum 60 caractères), bienveillant et engageant pour un groupe de parole.
Le titre doit donner envie aux autres parents de rejoindre le groupe.
Réponds uniquement avec le titre, sans guillemets, sans explications.`,
        },
        {
          role: 'user',
          content: `Thème : ${theme}\nDescription de la situation : ${description}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 60,
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
