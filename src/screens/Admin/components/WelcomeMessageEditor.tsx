import React, { useState, useEffect, useRef } from 'react';
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Pencil, Save, Loader2, Mic, StopCircle, Bot, Send } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import OpenAI from 'openai';

export const WelcomeMessageEditor = () => {
  const [message, setMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  
  const recognition = useRef<SpeechRecognition | null>(null);
  const finalTranscript = useRef<string>('');

  useEffect(() => {
    fetchMessage();
  }, []);

  const fetchMessage = async () => {
    try {
      const messageDoc = await getDoc(doc(db, 'settings', 'welcome_message'));
      if (messageDoc.exists()) {
        setMessage(messageDoc.data().text);
        setIsPublished(messageDoc.data().isPublished || false);
      }
    } catch (error) {
      console.error('Error fetching welcome message:', error);
    }
  };

  const startRecording = () => {
    try {
      if (!('webkitSpeechRecognition' in window)) {
        setError("La reconnaissance vocale n'est pas supportée par votre navigateur.");
        return;
      }

      recognition.current = new webkitSpeechRecognition();
      recognition.current.continuous = true;
      recognition.current.interimResults = true;
      recognition.current.lang = 'fr-FR';

      recognition.current.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript.current += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        setTranscript(finalTranscript.current + interimTranscript);
      };

      recognition.current.onend = () => {
        if (isRecording) {
          recognition.current?.start();
        }
      };

      recognition.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError(`Erreur de reconnaissance vocale: ${event.error}`);
        stopRecording();
      };

      finalTranscript.current = '';
      recognition.current.start();
      setIsRecording(true);
      setError(null);

    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError("Impossible d'accéder au microphone. Veuillez vérifier les permissions.");
    }
  };

  const stopRecording = async () => {
    if (recognition.current) {
      recognition.current.stop();
      setIsRecording(false);
      
      if (finalTranscript.current.trim()) {
        await processWithAI(finalTranscript.current);
      }
    }
  };

  const processWithAI = async (text: string) => {
    setIsProcessing(true);
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
            content: "Tu es un expert en communication bienveillante et poétique. Ta mission est de transformer les messages en textes chaleureux et inspirants pour les parents."
          },
          {
            role: "user",
            content: `Reformule ce message vocal en deux phrases poétiques et bienveillantes pour les visiteurs du site Parent'aile: "${text}"`
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      const refinedMessage = completion.choices[0].message.content;
      if (refinedMessage) {
        setMessage(refinedMessage);
        setIsEditing(true);
      }
    } catch (error: any) {
      console.error('Error processing with AI:', error);
      setError('Une erreur est survenue lors du traitement par l\'IA');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      await setDoc(doc(db, 'settings', 'welcome_message'), {
        text: message,
        updatedAt: new Date(),
        isPublished: false
      });

      setIsEditing(false);
      setIsPublished(false);
    } catch (error) {
      console.error('Error updating welcome message:', error);
      setError('Une erreur est survenue lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    try {
      setIsPublishing(true);
      setError(null);

      await setDoc(doc(db, 'settings', 'welcome_message'), {
        text: message,
        updatedAt: new Date(),
        isPublished: true
      });

      setIsPublished(true);
    } catch (error) {
      console.error('Error publishing welcome message:', error);
      setError('Une erreur est survenue lors de la publication');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Card className="p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Pencil className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-primary">Message d'accueil</h2>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 text-sm text-red-500 bg-red-50 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Voice Recording Section */}
        <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed rounded-lg mb-6">
          {isRecording ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-lg font-medium">Enregistrement en cours...</span>
              </div>
              {transcript && (
                <div className="w-full max-w-md bg-gray-50 rounded-lg p-4 mt-2">
                  <p className="text-gray-600 italic">{transcript}</p>
                </div>
              )}
              <Button
                variant="destructive"
                className="flex items-center gap-2"
                onClick={stopRecording}
              >
                <StopCircle className="w-5 h-5" />
                Arrêter l'enregistrement
              </Button>
            </>
          ) : (
            <Button
              className="flex items-center gap-2"
              onClick={startRecording}
              disabled={isProcessing}
            >
              <Mic className="w-5 h-5" />
              Démarrer l'enregistrement vocal
            </Button>
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 text-primary">
              <Bot className="w-5 h-5" />
              <span>Traitement par l'IA en cours...</span>
            </div>
          )}
        </div>

        {/* Message Editor */}
        {isEditing ? (
          <>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Entrez votre message d'accueil..."
              className="w-full"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !message.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-gray-600">{message}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifier
              </Button>
              <Button
                onClick={handlePublish}
                disabled={isPublishing || !message.trim()}
                className={`flex items-center gap-2 ${isPublished ? 'bg-green-600' : 'bg-primary'} hover:bg-opacity-90`}
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publication...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {isPublished ? 'Publié' : 'Publier'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};