import { Handler } from '@netlify/functions';
import OpenAI from 'openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: 'ok',
    };
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
          content: `Tu es un assistant qui aide les parents à reformuler leurs messages pour leur médecin.
Améliore la clarté et la structure du texte tout en conservant le sens original et l'émotion.
Garde un ton naturel, personnel et bienveillant.
Réponds uniquement avec le texte reformulé, sans explications ni commentaires.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.7,
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
