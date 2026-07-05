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
