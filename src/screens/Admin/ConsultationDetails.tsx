import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ArrowLeft, Video, X, Clock, Loader2, Check, AlertCircle, History, MessageSquare, Bot, User, Mic, StopCircle, Send, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { nanoid } from 'nanoid';
import { createConsultationNotification } from '../../lib/notifications';
import OpenAI from 'openai';
import { VoiceRecorder } from '../../lib/voiceRecorder';
import { Textarea } from "../../components/ui/textarea";

interface Consultation {
  id: string;
  date: Date;
  rdv_date?: Date;
  category: string;
  status: string;
  texte: string;
  meetingUrl?: string;
  rdv_time?: string;
  slotId?: string;
  userId: string;
  pseudo: string;
  email?: string;
  presence?: {
    online: boolean;
    lastSeen: Date;
    inMeeting: boolean;
  };
  summary?: {
    parent?: string;
    practitioner?: string;
    generatedAt?: Date;
  };
  attendance?: {
    status: 'present' | 'absent' | 'late';
    joinedAt?: Date;
    leftAt?: Date;
  };
}

interface PastConsultation {
  id: string;
  date: Date;
  status: string;
  texte: string;
  summary?: {
    parent?: string;
    practitioner?: string;
  };
  attendance?: {
    status: 'present' | 'absent' | 'late';
  };
}

export const ConsultationDetails = () => {
  const navigate = useNavigate();
  const { consultationId } = useParams<{ consultationId: string }>();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [pastConsultations, setPastConsultations] = useState<PastConsultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [editingParentSummary, setEditingParentSummary] = useState(false);
  const [editedParentSummary, setEditedParentSummary] = useState<string>("");
  const [sendingSummary, setSendingSummary] = useState(false);
  const voiceRecorder = useRef<VoiceRecorder | null>(null);

  useEffect(() => {
    if (!consultationId) {
      navigate('/admin');
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'messages', consultationId),
      async (docSnapshot) => {
        if (!docSnapshot.exists()) {
          navigate('/admin');
          return;
        }

        const consultationData = {
          id: docSnapshot.id,
          ...docSnapshot.data(),
          date: docSnapshot.data().date?.toDate(),
          rdv_date: docSnapshot.data().rdv_date?.toDate()
        } as Consultation;

        setConsultation(consultationData);

        if (consultationData.userId) {
          const pastConsultationsQuery = query(
            collection(db, 'messages'),
            where('userId', '==', consultationData.userId),
            where('status', 'in', ['terminee', 'annule']),
            orderBy('date', 'desc')
          );

          const pastConsultationsSnapshot = await getDocs(pastConsultationsQuery);
          const pastConsultationsData = pastConsultationsSnapshot.docs
            .filter(doc => doc.id !== consultationId)
            .map(doc => ({
              id: doc.id,
              ...doc.data(),
              date: doc.data().date?.toDate()
            })) as PastConsultation[];

          setPastConsultations(pastConsultationsData);
        }

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [consultationId, navigate]);

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
            processVoiceSummary(text);
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

  const processVoiceSummary = async (text: string) => {
    if (!consultation) return;

    try {
      setIsProcessingVoice(true);
      setError(null);

      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      const practitionerCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Reformule ce résumé de consultation dicté par un professionnel de manière claire et structurée, en gardant un ton professionnel et technique."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const parentCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Transforme ce résumé technique en un message bienveillant et accessible pour le parent, en utilisant un langage simple et rassurant."
          },
          {
            role: "user",
            content: practitionerCompletion.choices[0].message.content || ''
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const parentSummary = parentCompletion.choices[0].message.content;
      const practitionerSummary = practitionerCompletion.choices[0].message.content;

      if (parentSummary && practitionerSummary) {
        setEditedParentSummary(parentSummary);
        setEditingParentSummary(true);

        await updateDoc(doc(db, 'messages', consultation.id), {
          summary: {
            parent: parentSummary,
            practitioner: practitionerSummary,
            generatedAt: serverTimestamp()
          }
        });
      }

    } catch (error) {
      console.error('Error processing voice summary:', error);
      setError('Une erreur est survenue lors du traitement du résumé vocal');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleConfirm = async () => {
    if (!consultation) return;

    try {
      setProcessing(true);
      setError(null);

      const meetingUrl = `https://meet.jit.si/parentaile-${nanoid(10)}`;
      await updateDoc(doc(db, 'messages', consultation.id), {
        meetingUrl,
        status: 'lien_genere'
      });

      await createConsultationNotification(
        consultation.userId,
        consultation.id,
        consultation.rdv_date!,
        consultation.rdv_time!,
        'scheduled'
      );
    } catch (error) {
      console.error('Error confirming consultation:', error);
      setError('Une erreur est survenue lors de la confirmation');
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkAsComplete = async () => {
    if (!consultation) return;

    try {
      setProcessing(true);
      setError(null);

      await updateDoc(doc(db, 'messages', consultation.id), {
        status: 'terminee',
        completedAt: serverTimestamp()
      });

      await createConsultationNotification(
        consultation.userId,
        consultation.id,
        consultation.rdv_date!,
        consultation.rdv_time!,
        'custom',
        undefined,
        undefined,
        'Votre consultation est maintenant terminée. Merci de votre participation.'
      );
    } catch (error) {
      console.error('Error marking consultation as complete:', error);
      setError('Une erreur est survenue');
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!consultation) return;

    try {
      setGeneratingSummary(true);
      setError(null);

      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      });

      const parentCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Génère un résumé bienveillant et constructif de la consultation pour le parent."
          },
          {
            role: "user",
            content: consultation.texte
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const practitionerCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Génère un résumé professionnel et technique de la consultation pour le praticien."
          },
          {
            role: "user",
            content: consultation.texte
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const parentSummary = parentCompletion.choices[0].message.content;
      const practitionerSummary = practitionerCompletion.choices[0].message.content;

      if (parentSummary && practitionerSummary) {
        setEditedParentSummary(parentSummary);
        setEditingParentSummary(true);

        await updateDoc(doc(db, 'messages', consultation.id), {
          summary: {
            parent: parentSummary,
            practitioner: practitionerSummary,
            generatedAt: serverTimestamp()
          }
        });
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      setError('Une erreur est survenue lors de la génération du résumé');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSendNotification = async (type: 'waiting' | 'delay') => {
    if (!consultation) return;

    try {
      setProcessing(true);
      setError(null);

      const message = type === 'waiting' 
        ? 'Dr Lassoued vous attend pour la téléconsultation'
        : 'Dr Lassoued aura quelques minutes de retard, merci de patienter';

      await createConsultationNotification(
        consultation.userId,
        consultation.id,
        consultation.rdv_date!,
        consultation.rdv_time!,
        'custom',
        undefined,
        undefined,
        message
      );
    } catch (error) {
      console.error('Error sending notification:', error);
      setError('Une erreur est survenue lors de l\'envoi de la notification');
    } finally {
      setProcessing(false);
    }
  };

  const handleSendSummary = async () => {
    if (!consultation) return;

    try {
      setSendingSummary(true);
      setError(null);

      await updateDoc(doc(db, 'messages', consultation.id), {
        summary: {
          ...consultation.summary,
          parent: editedParentSummary,
          sentToParent: true,
          sentAt: serverTimestamp()
        }
      });

      await createConsultationNotification(
        consultation.userId,
        consultation.id,
        consultation.rdv_date!,
        consultation.rdv_time!,
        'summary'
      );

      setEditingParentSummary(false);
    } catch (error) {
      console.error('Error sending summary:', error);
      setError('Une erreur est survenue lors de l\'envoi du résumé');
    } finally {
      setSendingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Consultation non trouvée</h1>
          <Link to="/admin">
            <Button>Retour à l'administration</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour à l'administration
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">
            Détails de la consultation
          </h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList>
            <TabsTrigger value="summary">Résumé</TabsTrigger>
            <TabsTrigger value="history">Historique</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-4">Informations générales</h2>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          consultation.status === 'lien_genere'
                            ? 'bg-blue-100 text-blue-800'
                            : consultation.status === 'confirme'
                            ? 'bg-green-100 text-green-800'
                            : consultation.status === 'terminee'
                            ? 'bg-gray-100 text-gray-800'
                            : consultation.status === 'annule'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {consultation.status === 'lien_genere'
                            ? 'Lien généré'
                            : consultation.status === 'confirme'
                            ? 'Confirmé'
                            : consultation.status === 'terminee'
                            ? 'Terminé'
                            : consultation.status === 'annule'
                            ? 'Annulé'
                            : 'En attente'}
                        </span>
                        {consultation.presence?.online && (
                          <span className="flex items-center gap-1 text-sm text-green-600">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            En ligne
                          </span>
                        )}
                        {consultation.presence?.inMeeting && (
                          <span className="flex items-center gap-1 text-sm text-blue-600">
                            <Video className="w-4 h-4" />
                            En consultation
                          </span>
                        )}
                      </div>
                      <p>
                        <span className="font-medium">Date de la demande:</span>{' '}
                        {format(consultation.date, 'dd MMMM yyyy à HH:mm', { locale: fr })}
                      </p>
                      {consultation.rdv_date && (
                        <p>
                          <span className="font-medium">Rendez-vous prévu:</span>{' '}
                          {format(consultation.rdv_date, 'dd MMMM yyyy', { locale: fr })} à{' '}
                          {consultation.rdv_time}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Parent:</span>{' '}
                        {consultation.pseudo}
                      </p>
                      {consultation.email && (
                        <p>
                          <span className="font-medium">Email:</span>{' '}
                          <a href={`mailto:${consultation.email}`} className="text-primary hover:underline">
                            {consultation.email}
                          </a>
                        </p>
                      )}
                      {consultation.meetingUrl && (
                        <p>
                          <span className="font-medium">Lien visio:</span>{' '}
                          <a
                            href={consultation.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {consultation.meetingUrl}
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium">Message</h3>
                  <p className="whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                    {consultation.texte}
                  </p>
                </div>

                {consultation.summary && (
                  <div className="mt-6 space-y-4">
                    <h3 className="font-medium">Résumés générés</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Pour le parent</h4>
                        {editingParentSummary ? (
                          <div className="space-y-4">
                            <Textarea
                              value={editedParentSummary}
                              onChange={(e) => setEditedParentSummary(e.target.value)}
                              className="min-h-[200px]"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setEditingParentSummary(false)}
                                disabled={sendingSummary}
                              >
                                Annuler
                              </Button>
                              <Button
                                onClick={handleSendSummary}
                                disabled={sendingSummary}
                                className="bg-primary hover:bg-primary/90"
                              >
                                {sendingSummary ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Envoi...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4 mr-2" />
                                    Envoyer au parent
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm bg-gray-50 p-4 rounded-lg">
                              {consultation.summary.parent}
                            </p>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditedParentSummary(consultation.summary?.parent || '');
                                setEditingParentSummary(true);
                              }}
                              className="flex items-center gap-2"
                            >
                              <Pencil className="w-4 h-4" />
                              Modifier
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Pour le praticien</h4>
                        <p className="text-sm bg-gray-50 p-4 rounded-lg">
                          {consultation.summary.practitioner}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Actions</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {consultation.status !== 'terminee' && (
                    <>
                      <div className="space-y-4">
                        <h3 className="font-medium">Notifications</h3>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleSendNotification('waiting')}
                            disabled={processing}
                            variant="outline"
                          >
                            En attente du parent
                          </Button>
                          <Button
                            onClick={() => handleSendNotification('delay')}
                            disabled={processing}
                            variant="outline"
                          >
                            Retard praticien
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-medium">Gestion</h3>
                        <div className="flex gap-2">
                          {consultation.status !== 'lien_genere' && consultation.status !== 'terminee' && (
                            <Button
                              onClick={handleConfirm}
                              disabled={processing}
                              className="bg-primary hover:bg-primary/90"
                            >
                              <Video className="w-4 h-4 mr-2" />
                              Générer le lien visio
                            </Button>
                          )}
                          
                          {(consultation.status === 'confirme' || consultation.status === 'lien_genere') && (
                            <Button
                              onClick={handleMarkAsComplete}
                              disabled={processing}
                              variant="outline"
                              className="flex items-center gap-2"
                            >
                              <Check className="w-4 h-4" />
                              Marquer comme terminée
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {consultation.status === 'terminee' && !consultation.summary && (
                    <div className="col-span-2 space-y-4">
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
                            disabled={isProcessingVoice}
                          >
                            <Mic className="w-5 h-5" />
                            Dicter le résumé
                          </Button>
                        )}

                        {isProcessingVoice && (
                          <div className="flex items-center gap-2 text-primary">
                            <Bot className="w-5 h-5" />
                            <span>Traitement par l'IA en cours...</span>
                          </div>
                        )}
                      </div>

                      <div className="text-center">
                        <span className="text-sm text-gray-500">ou</span>
                      </div>

                      <Button
                        onClick={handleGenerateSummary}
                        disabled={generatingSummary}
                        variant="outline"
                        className="w-full flex items-center gap-2 justify-center"
                      >
                        {generatingSummary ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Génération...
                          </>
                        ) : (
                          <>
                            <Bot className="w-4 h-4" />
                            Générer les résumés automatiquement
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-6">Historique des consultations</h2>
              
              {pastConsultations.length > 0 ? (
                <div className="space-y-6">
                  {pastConsultations.map((consultation) => (
                    <div key={consultation.id} className="border-b pb-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="font-medium">
                            {format(consultation.date, 'dd MMMM yyyy', { locale: fr })}
                          </p>
                          <p className="text-sm text-gray-500">
                            {consultation.attendance?.status === 'present'
                              ? 'Présent'
                              : consultation.attendance?.status === 'absent'
                              ? 'Absent'
                              : consultation.attendance?.status === 'late'
                              ? 'En retard'
                              : 'Non renseigné'}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          consultation.status === 'terminee'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {consultation.status === 'terminee' ? 'Terminée' : 'Annulée'}
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Message</h4>
                          <p className="text-sm bg-gray-50 p-4 rounded-lg">
                            {consultation.texte}
                          </p>
                        </div>

                        {consultation.summary && (
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2">Résumé parent</h4>
                              <p className="text-sm bg-gray-50 p-4 rounded-lg">
                                {consultation.summary.parent}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium mb-2">Résumé praticien</h4>
                              <p className="text-sm bg-gray-50 p-4 rounded-lg">
                                {consultation.summary.practitioner}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Aucun historique de consultation pour ce parent
                </p>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};