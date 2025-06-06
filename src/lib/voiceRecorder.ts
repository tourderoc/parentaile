import AudioRecorder from 'audio-recorder-polyfill';
import { createChatCompletion } from './openai';

interface VoiceRecorderOptions {
  onDataAvailable?: (data: Blob) => void;
  onStart?: () => void;
  onStop?: () => void;
  onError?: (error: Error) => void;
  onTranscriptionComplete?: (text: string) => void;
  isMobile?: boolean;
}

export class VoiceRecorder {
  private recognition: SpeechRecognition | null = null;
  private options: VoiceRecorderOptions;
  private isRecording = false;
  private accumulatedText = '';
  private silenceTimer: NodeJS.Timeout | null = null;
  private lastSpeechTime: number = 0;

  constructor(options: VoiceRecorderOptions) {
    this.options = options;
  }

  async start() {
    try {
      if (this.isRecording) return;
      this.isRecording = true;
      this.accumulatedText = '';
      this.lastSpeechTime = Date.now();
      await this.startSpeechRecognition();
      this.options.onStart?.();
      this.startSilenceDetection();
    } catch (error) {
      this.options.onError?.(error as Error);
      this.isRecording = false;
    }
  }

  stop() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this.recognition) {
      this.recognition.stop();
    }

    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }

    const finalText = this.accumulatedText.trim();
    if (finalText) {
      this.processWithAI(finalText);
    }

    this.options.onStop?.();
  }

  private startSilenceDetection() {
    this.silenceTimer = setInterval(() => {
      const silenceDuration = Date.now() - this.lastSpeechTime;
      if (silenceDuration > 15000) { // 15 seconds
        this.stop();
      }
    }, 1000);
  }

  private async processWithAI(text: string) {
    try {
      const messages = [
        {
          role: "system",
          content: "Voici un texte dicté par un parent. Reformule ce texte de manière claire, fluide et bienveillante.\n\nGarde le sens et l'intention du parent.\n\nNe change pas l'idée exprimée.\n\nNe donne pas ton avis, pas de commentaire, pas d'interprétation, pas de jugement.\n\nNe rajoute rien qui n'est pas dans le texte.\n\nCorrige seulement si c'est nécessaire pour rendre le texte compréhensible (syntaxe, répétitions, fautes très gênantes).\n\n🎯 Objectif : respecter les mots du parent tout en améliorant la lisibilité du message."
        },
        {
          role: "user",
          content: text
        }
      ];

      const completion = await createChatCompletion(messages, "gpt-3.5-turbo", 500);
      const refinedText = completion.choices[0].message.content;
      if (refinedText) {
        this.options.onTranscriptionComplete?.(refinedText);
      }
    } catch (error) {
      this.options.onError?.(new Error('Error processing with AI: ' + error));
    }
  }

  private async startSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported');
    }

    this.recognition = new webkitSpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'fr-FR';

    this.recognition.onstart = () => {
      this.lastSpeechTime = Date.now();
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      this.lastSpeechTime = Date.now();
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.accumulatedText += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Only show live transcription on desktop
      if (!this.options.isMobile) {
        const currentText = this.accumulatedText + interimTranscript;
        const blob = new Blob([currentText], { type: 'text/plain' });
        this.options.onDataAvailable?.(blob);
      }
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        setTimeout(() => {
          if (this.isRecording) {
            this.recognition?.start();
          }
        }, 100);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        this.lastSpeechTime = Date.now();
        return;
      }
      
      this.options.onError?.(new Error(`Speech recognition error: ${event.error}`));
    };

    this.recognition.start();
  }
}
