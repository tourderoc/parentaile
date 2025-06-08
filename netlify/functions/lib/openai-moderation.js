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
            apiKey: process.env.OPENAI_API_KEY,
        });
        const body = JSON.parse(event.body || '{}');
        const moderation = await openai.moderations.create({
            input: body.input
        });
        return {
            statusCode: 200,
            body: JSON.stringify(moderation)
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
//# sourceMappingURL=openai-moderation.js.map