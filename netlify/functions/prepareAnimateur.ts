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
    const { theme, intention, titre } = JSON.parse(event.body || '{}');

    if (!theme && !intention) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'theme ou intention requis' }),
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
          content: `Tu es un assistant bienveillant qui aide les animateurs de groupes de parole entre parents.
Tu dois aider l'animateur a preparer son introduction pour le groupe.

Reponds en JSON avec exactement cette structure :
{
  "introduction": "2-3 phrases naturelles pour ouvrir le groupe, chaleureuses et inclusives",
  "structure": ["Accueil et presentations", "Partage du theme", "Tour de parole", "Echange libre", "Mot de fin"],
  "questions": ["question 1 adaptee au theme", "question 2", "question 3"]
}

Regles :
- Ton chaleureux, naturel, oral (pas scolaire)
- Questions ouvertes, non intrusives, qui invitent au partage
- Structure simple en 5 etapes max
- Reponds UNIQUEMENT avec le JSON, rien d'autre`,
        },
        {
          role: 'user',
          content: `Groupe : "${titre || 'Groupe de parole'}"
Theme : ${theme || 'libre'}
Intention de l'animateur : ${intention || 'Pas d\'intention specifique'}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    const raw = completion.choices[0].message.content || '{}';

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = {
        introduction: raw,
        structure: ['Accueil', 'Partage du theme', 'Tour de parole', 'Echange libre', 'Mot de fin'],
        questions: [],
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (error) {
    console.error('Prepare animateur error:', error);

    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Erreur lors de la preparation. Veuillez reessayer.',
      }),
    };
  }
};
