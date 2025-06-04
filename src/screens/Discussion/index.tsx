import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, orderBy, addDoc, serverTimestamp, onSnapshot, doc, updateDoc, arrayUnion, increment, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Send, Bot, Loader2, Mic, StopCircle, Keyboard, Pencil } from 'lucide-react';
import { moderateMessage } from '../../lib/moderateMessage';
import { VoiceRecorder } from '../../lib/voiceRecorder';
import { useInputMethodStore } from '../../lib/inputMethodStore';
import { createNotification } from '../../lib/notifications';

interface Post {
  id: string;
  content: string;
  category: string;
  authorId: string;
  authorPseudo: string;
  createdAt: Date;
  participants: string[];
  responseCount: number;
}

interface Response {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  authorPseudo: string;
  createdAt: Date;
}

export const Discussion = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [post, setPost] = useState<Post | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [newResponse, setNewResponse] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModeration, setShowModeration] = useState(false);
  const [moderatedText, setModeratedText] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const voiceRecorder = useRef<VoiceRecorder | null>(null);
  const { method: inputMethod, setMethod: setInputMethod } = useInputMethodStore();
  const [responseState, setResponseState] = useState<'initial' | 'moderated' | 'submitting'>('initial');

  useEffect(() => {
    if (!postId) {
      navigate('/partager');
      return;
    }

    const fetchPost = async () => {
      try {
        const postDoc = await getDoc(doc(db, 'posts', postId));
        if (!postDoc.exists()) {
          navigate('/partager');
          return;
        }

        setPost({
          id: postDoc.id,
          ...postDoc.data(),
          createdAt: postDoc.data().createdAt?.toDate() || new Date()
        } as Post);

        const responsesQuery = query(
          collection(db, 'responses'),
          where('postId', '==', postId),
          orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(responsesQuery, (snapshot) => {
          const responsesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date()
          })) as Response[];

          setResponses(responsesData);
        });

        setLoading(false);
        return unsubscribe;
      } catch (error) {
        console.error('Error fetching post:', error);
        navigate('/partager');
      }
    };

    fetchPost();
  }, [postId, navigate]);

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
            setNewResponse('');
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
            setNewResponse(text);
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

  const stopRecording = async () => {
    if (voiceRecorder.current) {
      voiceRecorder.current.stop();
    }
  };

  const handleModeration = async (text: string) => {
    setIsProcessing(true);
    setModerationError(null);
    setModeratedText(null);
    
    try {
      const result = await moderateMessage(text, true);
      
      if (result.error) {
        setModerationError(result.error);
      } else if (result.text) {
        setModeratedText(result.text);
      }
      
      setResponseState('moderated');
    } catch (error) {
      console.error('Error during moderation:', error);
      setModerationError("Une erreur est survenue lors de la modération du message.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser || !post || !moderatedText) {
      return;
    }

    try {
      setIsSubmitting(true);

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userPseudo = userDoc.exists() ? userDoc.data().pseudo : 'Anonyme';

      await addDoc(collection(db, 'responses'), {
        postId: post.id,
        content: moderatedText,
        authorId: auth.currentUser.uid,
        authorPseudo: userPseudo,
        createdAt: serverTimestamp()
      });

      // Update post participants
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, {
        participants: arrayUnion(auth.currentUser.uid),
        responseCount: increment(1)
      });

      // Create notifications
      if (post.authorId !== auth.currentUser.uid) {
        await createNotification({
          userId: post.authorId,
          title: 'Nouvelle réponse à votre message',
          message: `${userPseudo} a répondu à votre message`,
          type: 'info',
          postId: post.id,
          link: `/discussion/${post.id}`
        });
      }

      const uniqueParticipants = new Set(post.participants);
      uniqueParticipants.delete(auth.currentUser.uid);
      uniqueParticipants.delete(post.authorId);

      for (const participantId of uniqueParticipants) {
        await createNotification({
          userId: participantId,
          title: 'Nouvelle réponse dans une discussion',
          message: `${userPseudo} a ajouté une réponse à une discussion à laquelle vous participez`,
          type: 'info',
          postId: post.id,
          link: `/discussion/${post.id}`
        });
      }

      setNewResponse('');
      setModeratedText(null);
      setResponseState('initial');
    } catch (error) {
      console.error('Error submitting response:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!newResponse.trim()) {
      return;
    }
    await handleModeration(newResponse);
  };

  const handleRewrite = () => {
    setNewResponse('');
    setModerationError(null);
    setModeratedText(null);
    setResponseState('initial');
  };

  if (loading || !post) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const categoryLabel = {
    fatigue: 'Fatigue',
    education: 'Éducation',
    sante: 'Santé',
    developpement: 'Développement',
    alimentation: 'Alimentation',
    sommeil: 'Sommeil',
  }[post.category] || 'Discussion';

  const backLink = location.state?.from === '/my-forum' ? '/my-forum' : '/partager';
  const backText = location.state?.from === '/my-forum' ? 'Retour à mes messages' : 'Retour au forum';

  return (
    <div className="min-h-screen bg-[var(--color-pink)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <Link to={backLink}>
                <Button variant="ghost" className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  {backText}
                </Button>
              </Link>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-primary mb-6">
            Discussion : {categoryLabel}
          </h1>

          <Card className="p-6 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold">
                  {post.authorPseudo.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium">{post.authorPseudo}</h3>
                    <p className="text-sm text-gray-500">
                      {formatDistanceToNow(post.createdAt, { addSuffix: true, locale: fr })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    post.category === 'fatigue' ? 'bg-red-100 text-red-800' :
                    post.category === 'education' ? 'bg-blue-100 text-blue-800' :
                    post.category === 'sante' ? 'bg-green-100 text-green-800' :
                    post.category === 'developpement' ? 'bg-purple-100 text-purple-800' :
                    post.category === 'alimentation' ? 'bg-yellow-100 text-yellow-800' :
                    post.category === 'sommeil' ? 'bg-indigo-100 text-indigo-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {categoryLabel}
                  </span>
                </div>
                <p className="text-gray-700">{post.content}</p>
              </div>
            </div>
          </Card>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Réponses</h2>
            <div className="space-y-4">
              {responses.map((response) => (
                <Card key={response.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">
                        {response.authorPseudo.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{response.authorPseudo}</span>
                        <span className="text-sm text-gray-500">
                          {formatDistanceToNow(response.createdAt, { addSuffix: true, locale: fr })}
                        </span>
                      </div>
                      <p className="text-gray-700">{response.content}</p>
                    </div>
                  </div>
                </Card>
              ))}

              {responses.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  Aucune réponse pour le moment
                </p>
              )}
            </div>
          </div>

          {auth.currentUser && (
            <div className="space-y-4">
              {responseState === 'initial' && (
                <div className="flex justify-center gap-4 mb-4">
                  <Button
                    variant={inputMethod === 'text' ? 'default' : 'outline'}
                    onClick={() => setInputMethod('text')}
                    className="flex items-center gap-2"
                  >
                    <Keyboard className="w-4 h-4" />
                    Répondre par texte
                  </Button>
                  <Button
                    variant={inputMethod === 'voice' ? 'default' : 'outline'}
                    onClick={() => setInputMethod('voice')}
                    className="flex items-center gap-2"
                  >
                    <Mic className="w-4 h-4" />
                    Répondre par voix
                  </Button>
                </div>
              )}

              {responseState === 'initial' && inputMethod === 'voice' && (
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
              )}

              {responseState === 'initial' && inputMethod === 'text' && (
                <div className="space-y-4">
                  <Textarea
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    placeholder="Votre réponse..."
                    className="min-h-[100px]"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleTextSubmit}
                      disabled={!newResponse.trim() || isProcessing}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Traitement...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Valider
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                  {error}
                </div>
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

              {responseState === 'moderated' && moderatedText && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 text-primary">
                    <Bot className="w-5 h-5" />
                    <h3 className="font-medium">Message modéré</h3>
                  </div>
                  <p className="text-gray-700">{moderatedText}</p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={handleRewrite}
                    >
                      Réécrire
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
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
          )}

          {!auth.currentUser && (
            <div className="text-center py-4">
              <p className="text-gray-600 mb-4">
                Connectez-vous pour répondre à cette discussion
              </p>
              <Link to="/">
                <Button className="bg-primary hover:bg-primary/90">
                  Se connecter
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Discussion;