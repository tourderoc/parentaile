import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      throw new Error('No text provided');
    }

    // Groq Cloud API (ultra rapide, gratuit)
    const groq = new OpenAI({
      apiKey: Deno.env.get('GROQ_API_KEY'),
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `Tu es un assistant qui aide les parents à reformuler leurs messages pour leur médecin.
Améliore la clarté et la structure du texte tout en conservant le sens original et l'émotion.
Garde un ton naturel, personnel et bienveillant.
Réponds uniquement avec le texte reformulé, sans explications ni commentaires.`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const refinedText = completion.choices[0].message.content;

    return new Response(
      JSON.stringify({ refinedText }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Text refinement error:', error);

    return new Response(
      JSON.stringify({
        error: 'Erreur lors de la reformulation. Veuillez réessayer.',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});