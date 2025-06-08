"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const openai_1 = __importDefault(require("openai"));
const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY, // Utilisation sécurisée de la clé
        });
        const body = JSON.parse(event.body || '{}');
        const completion = await openai.chat.completions.create({
            model: body.model || "gpt-3.5-turbo",
            messages: body.messages,
            max_tokens: body.max_tokens || 100
        });
        return {
            statusCode: 200,
            body: JSON.stringify(completion)
        };
    }
    catch (error) {
        console.error('OpenAI API error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=openai-chat.js.map