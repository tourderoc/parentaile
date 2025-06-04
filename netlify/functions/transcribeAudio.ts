import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json();

    if (!audio) {
      throw new Error('No audio data provided');
    }

    const binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
    const formData = new FormData();
    formData.append('audio', new Blob([binaryAudio], { type: 'audio/webm' }));

    const response = await fetch('https://api.deepgram.com/v1/listen?model=general&language=fr&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Deepgram API error: ${response.statusText}`);
    }

    const data = await response.json();
    const transcription = data.results?.channels[0]?.alternatives[0]?.transcript;

    if (!transcription) {
      throw new Error('No transcription returned from Deepgram');
    }

    return new Response(JSON.stringify({ transcription }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Transcription error:', error);

    return new Response(JSON.stringify({
      error: 'Transcription failed. Please try again.',
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});