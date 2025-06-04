import React, { useState, useRef } from 'react';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Send, Pencil, Mic, StopCircle, Loader2, Bot, Keyboard } from 'lucide-react';
import { moderateMessage } from '../../lib/moderateMessage';
import { VoiceRecorder } from '../../lib/voiceRecorder';

interface CreatePostProps {
  onPostCreated: () => void;
}

const categories = [
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'education', label: 'Éducation' },
  { value: 'sante', label: 'Santé' },
  { value: 'developpement', label: 'Développement' },
  { value: 'alimentation', label: 'Alimentation' },
  { value: 'sommeil', label: 'Sommeil' },
  { value: 'autres', label: 'Autres' }
];

export const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated }) => {
  const [content, setContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('text');
  const [showModeration, setShowModeration] = useState(false);
  const [moderatedText, setModeratedText] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);
  
  const voiceRecorder = useRef<VoiceRecorder | null>(null);

  const startRecording = () => {
    try {
      if (!('webkitSpeechRecognition' in window)) {
        setError("La reconnaissance vocale n'est pas supportée par votre navigateur.");
        return;
      }

      if (!voiceRecorder.current) {
        voiceRecorder.current = new VoiceRecorder({
          onDataAvailable: (blob) => {
            blob.text().then(text => {
              setTranscript(text);
            });
          },
          onStart: () => {
            setIsRecording(true);
            setError(null);
            setTranscript('');
            setContent('');
            setModeratedText(null);
            setModerationError(null);
          },
          onStop: () => {
            setIsRecording(false);
          },
          onError: (error) => {
            console.error('Recording error:', error);
            setError(`Erreur de reconnaissance vocale: ${error.message}`);
            setIsRecording(false);
          },
          onTranscriptionComplete: (text) => {
            setContent(text);
            handleModeration(text);
          },
          isMobile: window.innerWidth <= 768
        });
      }

      voiceRecorder.current.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      setError("Impossible d'accéder au microphone. Veuillez vérifier les permissions.");
    }
  };

  const stopRecording = () => {
    if (voiceRecorder.current) {
      voiceRecorder.current.stop();
    }
  };

  const handleModeration = async (text: string) => {
    setIsProcessing(true);
    setModerationError(null);
    setModeratedText(null);
    
    try {
      const result = await moderateMessage(text);
      
      if (result.error) {
        setModerationError(result.error);
      } else if (result.text) {
        setModeratedText(result.text);
        if (result.category) {
          setSelectedCategory(result.category);
        }
      }
      
      setShowModeration(true);
    } catch (error) {
      console.error('Error during moderation:', error);
      setModerationError("Une erreur est survenue lors de la modération du message.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      setError("Vous devez être connecté pour publier");
      return;
    }

    if (!moderatedText) {
      setError("Le message n'a pas été modéré");
      return;
    }

    if (!selectedCategory) {
      setError("Veuillez sélectionner une catégorie");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userPseudo = userDoc.exists() ? userDoc.data().pseudo : 'Anonyme';

      await addDoc(collection(db, 'posts'), {
        content: moderatedText,
        category: selectedCategory,
        authorId: auth.currentUser.uid,
        authorPseudo: userPseudo,
        createdAt: serverTimestamp(),
        participants: [auth.currentUser.uid],
        responseCount: 0
      });

      setContent("");
      setSelectedCategory(null);
      setModeratedText(null);
      setShowModeration(false);
      onPostCreated();
    } catch (error) {
      console.error("Error creating post:", error);
      setError("Une erreur est survenue lors de la publication");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!content.trim()) {
      setError("Le message ne peut pas être vide");
      return;
    }
    await handleModeration(content);
  };

  const handleRewrite = () => {
    setContent('');
    setModerationError(null);
    setModeratedText(null);
    setSelectedCategory(null);
    setError(null);
    setShowModeration(false);
  };

  return (
    <Card className="p-6 mb-8">
      <div className="space-y-4">
        <div className="flex justify-center gap-4 mb-4">
          <Button
            variant={inputMode === 'text' ? 'default' : 'outline'}
            onClick={() => setInputMode('text')}
            className="flex items-center gap-2"
          >
            <Keyboard className="w-4 h-4" />
            Écrire
          </Button>
          <Button
            variant={inputMode === 'voice' ? 'default' : 'outline'}
            onClick={() => setInputMode('voice')}
            className="flex items-center gap-2"
          >
            <Mic className="w-4 h-4" />
            Parler
          </Button>
        </div>

        {inputMode === 'voice' ? (
          <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed rounded-lg">
            {isRecording ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-lg font-medium">Enregistrement en cours...</span>
                </div>
                {transcript && (
                  <div className="w-full bg-gray-50 rounded-lg p-4">
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
                Démarrer l'enregistrement
              </Button>
            )}
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Exprimez-vous librement..."
            className="min-h-[200px]"
          />
        )}

        {moderationError && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 text-red-600 rounded-lg">
              {moderationError}
            </div>
            <Button
              onClick={handleRewrite}
              variant="outline"
              className="w-full"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Réécrire
            </Button>
          </div>
        )}

        {!moderationError && !moderatedText && inputMode === 'text' && (
          <div className="flex justify-end">
            <Button
              onClick={handleTextSubmit}
              disabled={!content.trim() || isProcessing}
              className="bg-primary hover:bg-primary/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Traitement...
                </>
              ) : (
                'Valider mon message'
              )}
            </Button>
          </div>
        )}

        {moderatedText && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Bot className="w-5 h-5" />
              <h2 className="text-lg font-medium">Message modéré</h2>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
              {moderatedText}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Catégorie
              </label>
              <Select
                value={selectedCategory || ''}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleRewrite}
              >
                Réécrire
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedCategory}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publication...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Publier
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