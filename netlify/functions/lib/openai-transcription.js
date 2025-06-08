"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const openai_1 = __importDefault(require("openai"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
        const body = JSON.parse(event.body || '{}');
        // Si l'audio est fourni comme URL, téléchargez-le d'abord
        let audioFile;
        if (body.audioUrl) {
            const response = await (0, node_fetch_1.default)(body.audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            audioFile = buffer;
        }
        else if (body.audioBase64) {
            // Si l'audio est fourni en base64, convertissez-le en buffer
            audioFile = Buffer.from(body.audioBase64, 'base64');
        }
        else {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No audio provided' })
            };
        }
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: body.model || "whisper-1",
            language: body.language
        });
        return {
            statusCode: 200,
            body: JSON.stringify(transcription)
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
//# sourceMappingURL=openai-transcription.js.map