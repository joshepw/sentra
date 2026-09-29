"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useAssistantVoice(onExpired: () => void) {
  const [muted, setMuted] = useState(false), [unavailable, setUnavailable] = useState(false);
  const mutedRef = useRef(false), context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null), request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    request.current?.abort(); request.current = null;
    if (source.current) { source.current.stop(); source.current.disconnect(); source.current = null; }
  }, []);
  const unlock = useCallback(() => {
    if (mutedRef.current) return;
    const expected = generation.current;
    try {
      context.current ??= new AudioContext();
      // Resume during the submit/microphone gesture, before awaiting the server.
      void context.current.resume().catch(() => {
        if (generation.current === expected) setUnavailable(true);
      });
      const silent = context.current.createBufferSource();
      silent.buffer = context.current.createBuffer(1, 1, context.current.sampleRate);
      silent.connect(context.current.destination); silent.onended = () => silent.disconnect(); silent.start();
    } catch { setUnavailable(true); }
  }, []);
  const prepare = useCallback(() => {
    stop(); setUnavailable(false); unlock(); return generation.current;
  }, [stop, unlock]);
  const fail = useCallback((expected: number) => {
    if (expected === generation.current && !mutedRef.current) setUnavailable(true);
  }, []);
  const play = useCallback(async (url: string, expected: number) => {
    const valid = () => expected === generation.current && !mutedRef.current;
    const audio = context.current;
    if (!valid()) return;
    if (!audio) { fail(expected); return; }
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (!valid()) return;
      if (response.status === 401) { stop(); onExpired(); return; }
      if (!response.ok) throw new Error("Voice unavailable");
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      if (!valid()) return;
      // A microphone interruption can suspend an already unlocked context.
      await audio.resume();
      if (!valid()) return;
      const next = audio.createBufferSource(); next.buffer = buffer; next.connect(audio.destination);
      next.onended = () => { next.disconnect(); if (source.current === next) source.current = null; };
      source.current = next; next.start(); setUnavailable(false);
    } catch { if (!controller.signal.aborted) fail(expected); }
    finally { if (request.current === controller) request.current = null; }
  }, [fail, onExpired, stop]);
  const toggle = () => {
    stop(); mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); setUnavailable(false);
    if (!mutedRef.current) unlock();
  };
  useEffect(() => () => {
    stop();
    const audio = context.current; context.current = null;
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  }, [stop]);
  return { muted, unavailable, toggle, prepare, unlock, stop, play, fail };
}

export type AssistantVoice = ReturnType<typeof useAssistantVoice>;

export function VoiceMuteButton({ voice }: { voice: AssistantVoice }) {
  const label = voice.muted ? "Activar voz" : "Silenciar voz";
  return <button type="button" onClick={voice.toggle} aria-label={label} aria-pressed={voice.muted}
    title={voice.unavailable ? "Voz no disponible para esta respuesta" : label}
    className={`relative -my-2 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/5 ${voice.muted ? "text-text-faint" : "text-accent"}`}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {voice.muted ? <path d="m16 9 6 6m0-6-6 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>}
    </svg>
    {voice.unavailable && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-warning" aria-hidden="true" />}
  </button>;
}
