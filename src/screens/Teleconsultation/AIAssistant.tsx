import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { ArrowLeft, Mic, StopCircle, Bot, Loader2, CheckCircle } from "lucide-react";
import OpenAI from "openai";
import { auth, db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

interface ConsultationData {
  pseudo: string | null;
  childAge: string | null;
  category: string | null;
  email: string | null;
  message: string | null;
}

const REQUIRED_FIELDS = ['pseudo', 'childAge', 'category', 'email'] as const;

const QUESTIONS = {
  pseudo: "Pouvez-vous me dire comment vous souhaitez être appelé(e) (prénom ou pseudo) ?",
  childAge: "Quel est l'âge de votre enfant ?",
  category: "Quel est le sujet principal de votre demande (crises, sommeil, scolarité, angoisses…) ?",
  email: "Merci de me donner votre adresse e-mail pour que je puisse vous répondre."
};

const CATEGORIES = [
  'crises', 'sommeil', 'scolarité', 'angoisses', 'fatigue parentale'
] as const;

export const AIAssistant = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<keyof typeof QUESTIONS | null>(null);
  const [consultationData, setConsultationData] = useState<ConsultationData>({
    pseudo: null,
    childAge: null,
    category: null,
    email: null,
    message: null
  });
  const [showSummary, setShowSummary] = useState(false);
  const [userResponse, setUserResponse] = useState("");
  const [isVoiceProcessingComplete, setIsVoiceProcessingComplete] = useState(false);
  
  const recognition = useRef<SpeechRecognition | null>(null);
  const finalTranscript = useRef<string>('');

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
        await processText(finalTranscript.current);
        setIsVoiceProcessingComplete(true);
      }
    }
  };

  const extractInformation = async (text: string): Promise<Partial<ConsultationData>> => {
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
            content: `Analyze the following text and extract these information if present:
              - pseudo/name (how the person wants to be called)
              - child's age
              - main category (must be one of: ${CATEGORIES.join(', ')})
              - email address
              
              Return ONLY a JSON object with these fields (null if not found):
              {
                "pseudo": string | null,
                "childAge": string | null,
                "category": string | null,
                "email": string | null
              }`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content || '{}');
    } catch (error) {
      console.error('Error extracting information:', error);
      return {};
    }
  };

  const processText = async (text: string) => {
    setIsProcessing(true);
    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      // First, refine the message
      const refinement = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Reformule ce message de manière claire et structurée, tout en préservant l'émotion et le sens original."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const refinedMessage = refinement.choices[0].message.content;
      
      // Extract information from the text
      const extractedInfo = await extractInformation(text);
      
      setConsultationData(prev => ({
        ...prev,
        ...extractedInfo,
        message: refinedMessage || null
      }));

      // Find the first missing required field
      const missingField = REQUIRED_FIELDS.find(field => !extractedInfo[field]);
      if (missingField) {
        setCurrentQuestion(missingField);
      } else {
        setShowSummary(true);
      }

    } catch (error) {
      console.error('Error processing text:', error);
      setError('Une erreur est survenue lors du traitement du texte.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUserResponse = async () => {
    if (!currentQuestion || !userResponse.trim()) return;

    let isValid = true;
    let value = userResponse.trim();

    // Validate response based on the field
    switch (currentQuestion) {
      case 'email':
        isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        break;
      case 'childAge':
        isValid = !isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 18;
        break;
      case 'category':
        isValid = CATEGORIES.includes(value.toLowerCase() as typeof CATEGORIES[number]);
        break;
    }

    if (!isValid) {
      setError(`Réponse invalide pour ${currentQuestion}. Veuillez réessayer.`);
      return;
    }

    setConsultationData(prev => ({
      ...prev,
      [currentQuestion]: value
    }));

    setUserResponse("");
    setError(null);

    // Find next missing field
    const nextMissingField = REQUIRED_FIELDS.find(
      field => field !== currentQuestion && !consultationData[field]
    );

    if (nextMissingField) {
      setCurrentQuestion(nextMissingField);
    } else {
      setShowSummary(true);
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      setError("Vous devez être connecté pour enregistrer votre message.");
      return;
    }

    const missingFields = REQUIRED_FIELDS.filter(field => !consultationData[field]);
    if (missingFields.length > 0) {
      setError("Certaines informations sont manquantes. Veuillez compléter tous les champs.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await addDoc(collection(db, 'messages'), {
        texte: consultationData.message,
        categorie: consultationData.category,
        pseudo: consultationData.pseudo,
        date: serverTimestamp(),
        userId: auth.currentUser.uid,
        status: 'en_attente',
        email: consultationData.email,
        childAge: consultationData.childAge
      });

      navigate('/teleconsultation/confirmation');
    } catch (error) {
      console.error('Error saving message:', error);
      setError("Une erreur est survenue lors de l'enregistrement du message.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/teleconsultation/preparation")}
          className="mb-6 text-primary"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à la préparation
        </Button>

        <Card className="p-6 md:p-8">
          <h1 className="text-3xl font-bold text-primary text-center mb-8">
            Assistant IA
          </h1>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {!showSummary && !isVoiceProcessingComplete && (
              <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed rounded-lg">
                {isRecording ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-lg font-medium">Enregistrement en cours...</span>
                    </div>
                    <div className="w-full max-w-md bg-white rounded-lg p-4 mt-2">
                      <p className="text-gray-600 italic">{transcript}</p>
                    </div>
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
            )}

            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-primary">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Traitement en cours...</span>
              </div>
            )}

            {currentQuestion && !showSummary && (
              <div className="space-y-4 bg-white p-6 rounded-lg">
                <div className="flex items-center gap-2 text-primary">
                  <Bot className="w-5 h-5" />
                  <p className="font-medium">{QUESTIONS[currentQuestion]}</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleUserResponse()}
                    placeholder="Votre réponse..."
                  />
                  <Button
                    onClick={handleUserResponse}
                    disabled={!userResponse.trim()}
                    className="bg-primary hover:bg-primary/90"
                  >
                    Valider
                  </Button>
                </div>
              </div>
            )}

            {showSummary && (
              <div className="space-y-6 bg-white p-6 rounded-lg">
                <div className="flex items-center gap-2 text-primary mb-4">
                  <CheckCircle className="w-6 h-6" />
                  <h2 className="text-xl font-medium">Récapitulatif de votre demande</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">Votre message :</h3>
                    <p className="bg-gray-50 p-4 rounded-lg">{consultationData.message}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-medium mb-2">Pseudo :</h3>
                      <p>{consultationData.pseudo}</p>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Âge de l'enfant :</h3>
                      <p>{consultationData.childAge} ans</p>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Catégorie :</h3>
                      <p>{consultationData.category}</p>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Email :</h3>
                      <p>{consultationData.email}</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-4 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowSummary(false);
                        setCurrentQuestion(REQUIRED_FIELDS[0]);
                        setConsultationData({
                          pseudo: null,
                          childAge: null,
                          category: null,
                          email: null,
                          message: consultationData.message
                        });
                      }}
                    >
                      Modifier
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isSaving}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        'Valider ma demande'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};