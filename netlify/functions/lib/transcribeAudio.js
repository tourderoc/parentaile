"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_ts_1 = require("https://deno.land/std@0.168.0/http/server.ts");
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
(0, server_ts_1.serve)(async (req) => {
    var _a, _b, _c;
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
        const transcription = (_c = (_b = (_a = data.results) === null || _a === void 0 ? void 0 : _a.channels[0]) === null || _b === void 0 ? void 0 : _b.alternatives[0]) === null || _c === void 0 ? void 0 : _c.transcript;
        if (!transcription) {
            throw new Error('No transcription returned from Deepgram');
        }
        return new Response(JSON.stringify({ transcription }), {
            headers: Object.assign(Object.assign({}, corsHeaders), { 'Content-Type': 'application/json' }),
        });
    }
    catch (error) {
        console.error('Transcription error:', error);
        return new Response(JSON.stringify({
            error: 'Transcription failed. Please try again.',
        }), {
            status: 500,
            headers: Object.assign(Object.assign({}, corsHeaders), { 'Content-Type': 'application/json' }),
        });
    }
});
//# sourceMappingURL=transcribeAudio.js.map