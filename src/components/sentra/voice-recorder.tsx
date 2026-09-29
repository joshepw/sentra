"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MicrophoneIcon, SenttraActivity } from "./assistant-feedback";
import styles from "./senttra-feedback.module.css";

export type RecordedVoice = { audio: string; mime: string };
type Phase = "idle" | "requesting" | "recording" | "encoding";
type Capture = {
  cancelled: boolean; stream?: MediaStream; recorder?: MediaRecorder; reader?: FileReader;
  timer?: ReturnType<typeof setInterval>; detach?: () => void;
};
const MAX_BYTES = 4 * 1024 * 1024;

function release(capture: Capture) {
  if (capture.timer) clearInterval(capture.timer);
  capture.detach?.();
  capture.stream?.getTracks().forEach(track => track.stop());
}

function VoiceMeter({ stream }: { stream: MediaStream | null }) {
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = area.current;
    if (!root || !stream) return;
    const bars = [...root.querySelectorAll<HTMLElement>("[data-voice-bar]")];
    let context: AudioContext | null = null, source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null, frame = 0, closed = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    try {
      context = new AudioContext();
      analyser = context.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = .72;
      source = context.createMediaStreamSource(stream); source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize), spectrum = new Uint8Array(analyser.frequencyBinCount);
      const levels = bars.map(() => .06);
      let last = 0, energy = 0;
      const draw = (now: number) => {
        if (closed || !analyser) return;
        if (now - last >= (motion.matches ? 150 : 32)) {
          last = now;
          analyser.getByteTimeDomainData(samples); analyser.getByteFrequencyData(spectrum);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
          const target = Math.min(1, Math.max(0, (rms - .005) * 5));
          energy += (target - energy) * .35;
          root.style.setProperty("--voice-energy", energy.toFixed(3));
          root.dataset.soundLevel = energy.toFixed(3);
          bars.forEach((bar, index) => {
            const distance = Math.abs(index - (bars.length - 1) / 2);
            const bin = 1 + Math.floor(distance * 2);
            const frequency = (spectrum[bin] + spectrum[bin + 1]) / 510;
            const height = .06 + Math.min(.94, energy * (1.1 - distance / bars.length) * (.35 + frequency));
            levels[index] += (height - levels[index]) * .45;
            bar.style.setProperty("--bar-level", levels[index].toFixed(3));
          });
        }
        frame = requestAnimationFrame(draw);
      };
      void context.resume().catch(() => {});
      frame = requestAnimationFrame(draw);
    } catch {
      // Recording remains usable when the browser cannot supply a visual meter.
      root.dataset.soundLevel = "0";
    }
    return () => {
      closed = true; cancelAnimationFrame(frame); source?.disconnect(); analyser?.disconnect();
      if (context && context.state !== "closed") void context.close().catch(() => {});
      root.style.setProperty("--voice-energy", "0"); root.dataset.soundLevel = "0";
      bars.forEach(bar => bar.style.setProperty("--bar-level", ".06"));
    };
  }, [stream]);
  return <div ref={area} className={styles.voiceMeter} data-voice-meter>
    <div className={styles.recordOrb}><SenttraActivity listening><MicrophoneIcon size={30} /></SenttraActivity></div>
    <div className={styles.wave} aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <span key={index} className={styles.waveBar} data-voice-bar />)}</div>
  </div>;
}

export function VoiceRecorder({ disabled, onSend, onActivityChange, onError, onInteraction }: {
  disabled: boolean; onSend: (voice: RecordedVoice) => void;
  onActivityChange: (active: boolean) => void; onError: (message: string) => void; onInteraction?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle"), [seconds, setSeconds] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const capture = useRef<Capture | null>(null), mounted = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), heading = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = capture.current; capture.current = null;
      if (current) {
        current.cancelled = true; current.reader?.abort();
        if (current.recorder?.state === "recording") current.recorder.stop();
        release(current);
      }
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (phase !== "idle" && !element?.open) element?.showModal();
    else if (phase === "idle" && element?.open) {
      element.close();
      if (!disabled) trigger.current?.focus();
    }
  }, [phase, disabled]);
  const close = (current: Capture) => {
    release(current);
    if (capture.current !== current) return;
    capture.current = null;
    if (mounted.current) { setPhase("idle"); setStream(null); onActivityChange(false); }
  };
  const cancel = () => {
    const current = capture.current;
    if (!current) return;
    current.cancelled = true; current.reader?.abort();
    if (current.recorder?.state === "recording") current.recorder.stop();
    close(current);
  };
  const fail = (current: Capture, message: string) => {
    if (capture.current !== current || !mounted.current) { release(current); return; }
    cancel(); onError(message);
  };
  const start = async () => {
    if (capture.current || disabled) return;
    onError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError("Este navegador no permite grabar voz. Podés escribir la consulta."); return;
    }
    const current: Capture = { cancelled: false }; capture.current = current;
    setPhase("requesting"); setSeconds(0); onActivityChange(true);
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true }); current.stream = audio;
      if (!mounted.current || capture.current !== current || current.cancelled) { release(current); return; }
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined); current.recorder = recorder;
      const chunks: Blob[] = []; let bytes = 0;
      const ended = () => fail(current, "Se interrumpió el micrófono. Probá grabar de nuevo.");
      audio.getAudioTracks().forEach(track => track.addEventListener("ended", ended, { once: true }));
      current.detach = () => audio.getAudioTracks().forEach(track => track.removeEventListener("ended", ended));
      recorder.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes > MAX_BYTES && recorder.state === "recording") recorder.stop();
      };
      recorder.onerror = () => fail(current, "No se pudo continuar la grabación. Probá de nuevo.");
      recorder.onstop = () => {
        release(current);
        if (!mounted.current || current.cancelled || capture.current !== current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size > MAX_BYTES) { fail(current, "La grabación supera el límite. Probá con una consulta más corta."); return; }
        if (!blob.size) { fail(current, "No se pudo capturar audio. Probá grabar de nuevo."); return; }
        setPhase("encoding"); setStream(null);
        const reader = new FileReader(); current.reader = reader;
        reader.onerror = () => fail(current, "No se pudo preparar el audio. Probá grabar de nuevo.");
        reader.onload = () => {
          if (!mounted.current || current.cancelled || capture.current !== current) return;
          const sound = { audio: String(reader.result).split(",", 2)[1], mime: blob.type };
          close(current); onSend(sound);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start(500); setStream(audio); setPhase("recording");
      const started = performance.now();
      current.timer = setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000);
        setSeconds(Math.min(59, elapsed));
        if (elapsed >= 59 && recorder.state === "recording") recorder.stop();
      }, 250);
    } catch { fail(current, "No se pudo usar el micrófono. Revisá el permiso del navegador o escribí la consulta."); }
  };
  const send = () => {
    const current = capture.current;
    if (current?.recorder?.state !== "recording") return;
    onInteraction?.();
    setPhase("encoding"); current.recorder.stop();
  };
  return <>
    <button ref={trigger} type="button" className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs transition-colors hover:border-accent disabled:cursor-default disabled:opacity-40" disabled={disabled || phase !== "idle"} onClick={() => void start()} aria-haspopup="dialog"><MicrophoneIcon size={17} /><span>Grabar voz</span></button>
    <dialog ref={dialog} className={styles.recordDialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); cancel(); }}>
      <div className={styles.recordBrand}><span className={styles.liveDot} />SENTTRA · VOZ</div>
      <button type="button" className={styles.recordClose} aria-label="Cancelar grabación" onClick={cancel}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      <div className={styles.recordBody}>
        <p className={styles.recordState} role="status">{phase === "recording" && <span className={styles.recordDot} />}{phase === "recording" ? "Grabando tu voz" : phase === "encoding" ? "Preparando tu audio" : "Activando el micrófono"}</p>
        <h2 id={heading} className={styles.recordTitle}>{phase === "recording" ? "Te escucho." : phase === "encoding" ? "Preparando tu audio." : "Un momento…"}</h2>
        <p className={styles.recordHint}>{phase === "requesting" ? "Si el navegador te pide permiso, permití usar el micrófono para empezar." : "Hablá con naturalidad. Decime qué querés encontrar o qué querés ver."}</p>
        <VoiceMeter stream={stream} />
        <p className={styles.recordTime} role="timer" aria-live="off">0:{String(seconds).padStart(2, "0")} <span className={styles.recordLimit}>/ 0:59</span></p>
        <div className={styles.recordActions}>
          <button type="button" className={styles.cancelRecording} onClick={cancel}>Cancelar</button>
          <button type="button" className={styles.sendRecording} disabled={phase !== "recording"} onClick={send}>Enviar voz <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
        </div>
        <p className={styles.recordPrivacy}>Cancelar descarta este audio. Al llegar a 59 s se envía.</p>
      </div>
    </dialog>
  </>;
}
