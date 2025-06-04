import React, { useState } from 'react';
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Loader2 } from 'lucide-react';
import OpenAI from 'openai';

const EXAMPLE_MESSAGE = "Je suis très fatigué aujourd'hui, je n'en peux plus de cette charge mentale…";

export const OpenAITest = () => {
  const [message, setMessage] = useState(EXAMPLE_MESSAGE);
  const [refinedMessage, setRefinedMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefine = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Tu es un assistant bienveillant qui reformule les messages de manière chaleureuse et empathique, tout en restant fidèle au sens original. Limite ta réponse à 20 lignes maximum."
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      setRefinedMessage(completion.choices[0].message.content || '');
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      setError(error.message || 'Une erreur est survenue lors de la reformulation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-primary mb-6">
            Test de l'API OpenAI
          </h1>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message à reformuler
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Entrez votre message..."
                className="min-h-[100px]"
              />
            </div>

            <div className="flex justify-center">
              <Button
                onClick={handleRefine}
                disabled={isLoading || !message.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reformulation en cours...
                  </>
                ) : (
                  'Reformuler le message'
                )}
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                {error}
              </div>
            )}

            {refinedMessage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message reformulé
                </label>
                <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                  {refinedMessage}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};