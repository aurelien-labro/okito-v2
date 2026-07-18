"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chat vocal via les API natives du navigateur — zéro backend, zéro coût.
 *
 * - Reconnaissance : Web Speech API (SpeechRecognition), fr-FR. Supportée par
 *   Chrome/Edge/Safari ; absente de Firefox → `supported=false`, le bouton
 *   micro s'affiche désactivé avec une explication.
 * - Lecture des réponses : speechSynthesis (quand la question a été dictée).
 *
 * Le canal téléphonique client reste Vapi ; ce hook ne concerne que le
 * micro du dashboard patron.
 */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInput {
  /** Transcription partielle (affichée en direct dans le champ). */
  onInterim?: (text: string) => void;
  /** Transcription finale — c'est le moment d'envoyer la question. */
  onFinal: (text: string) => void;
}

export function useVoiceInput({ onInterim, onFinal }: UseVoiceInput) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const handlers = useRef({ onInterim, onFinal });
  handlers.current = { onInterim, onFinal };

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => recRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;

    let finalText = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      handlers.current.onInterim?.(finalText + interim);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = finalText.trim();
      if (text) handlers.current.onFinal(text);
    };
    rec.onerror = () => {
      // no-speech, not-allowed… : on referme proprement, onend suit toujours.
    };

    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, toggle };
}

/** Lit une réponse à voix haute (fr-FR). Coupe toute lecture en cours. */
export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

// --- Voix Jarvis serveur (vague 5) -------------------------------------------
//
// Enregistrement micro via MediaRecorder (tous navigateurs, Firefox compris)
// → l'audio part au serveur (/jarvis-brief/:id/voice-chat) qui transcrit
// (Deepgram) et répond en audio (ElevenLabs). Remplace la reco navigateur
// quand l'API voix est configurée ; sinon le fallback Web Speech reste.

/** Mime d'enregistrement préféré, aligné sur ceux acceptés par l'API. */
function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mime of ["audio/webm", "audio/ogg", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

export interface UseMicRecorder {
  /** Audio complet encodé base64 + son mime — prêt pour l'API voice-chat. */
  onAudio: (audioBase64: string, mime: string) => void;
  onError?: (message: string) => void;
}

export function useMicRecorder({ onAudio, onError }: UseMicRecorder) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const handlers = useRef({ onAudio, onError });
  handlers.current = { onAudio, onError };

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        pickRecordingMime() !== undefined,
    );
    return () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
    };
  }, []);

  const start = useCallback(async () => {
    if (recRef.current) return;
    const mime = pickRecordingMime();
    if (!mime) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      handlers.current.onError?.("Accès micro refusé — autorise le micro pour parler à Jarvis.");
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      recRef.current = null;
      setRecording(false);
      void new Blob(chunks, { type: mime }).arrayBuffer().then((buf) => {
        const bytes = new Uint8Array(buf);
        if (bytes.length === 0) return;
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        handlers.current.onAudio(btoa(binary), mime);
      });
    };
    recRef.current = rec;
    setRecording(true);
    rec.start();
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else void start();
  }, [start, stop]);

  return { supported, recording, toggle };
}

/** Joue un audio base64 (réponse voice-chat). Coupe la lecture précédente. */
let currentAudio: HTMLAudioElement | null = null;
export function playAudioBase64(audioBase64: string, mime: string): void {
  if (typeof window === "undefined") return;
  currentAudio?.pause();
  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const audio = new Audio(url);
  currentAudio = audio;
  audio.onended = () => URL.revokeObjectURL(url);
  void audio.play();
}
