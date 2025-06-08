"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_ts_1 = require("https://deno.land/std@0.168.0/http/server.ts");
const openai_4_28_0_1 = __importDefault(require("https://esm.sh/openai@4.28.0"));
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
(0, server_ts_1.serve)(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    try {
        const { text } = await req.json();
        if (!text) {
            throw new Error('No text provided');
        }
        const openai = new openai_4_28_0_1.default({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that refines and improves parent messages while maintaining their original meaning and emotion. Make the text more clear and structured, but keep it natural and personal."
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
        return new Response(JSON.stringify({ refinedText }), {
            headers: Object.assign(Object.assign({}, corsHeaders), { 'Content-Type': 'application/json' }),
        });
    }
    catch (error) {
        console.error('Text refinement error:', error);
        return new Response(JSON.stringify({
            error: 'Failed to refine text. Please try again.',
        }), {
            status: 500,
            headers: Object.assign(Object.assign({}, corsHeaders), { 'Content-Type': 'application/json' }),
        });
    }
});
//# sourceMappingURL=refineText.js.map