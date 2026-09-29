"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./senttra-feedback.module.css";

const phases: Record<string, { label: string; words: string[] }> = {
  queued: { label: "Tu consulta está en cola", words: ["Esperando turno…"] },
  transcribing: { label: "Pasando tu voz a texto", words: ["Transcribiendo…", "Pasando voz a texto…"] },
  planning: { label: "Interpretando tu consulta", words: ["Pensando…", "Atando cabos…", "Afinando el pedido…"] },
  querying: { label: "Consultando el historial", words: ["Buscando coincidencias…", "Revisando los registros…"] },
  replying: { label: "Preparando la respuesta", words: ["Ordenando la respuesta…", "Dándole forma…"] },
  applying: { label: "Actualizando el video y la vista", words: ["Ajustando la vista…"] },
  voice: { label: "Preparando la respuesta hablada", words: ["Dándole voz…", "Preparando el audio…"] },
};
const fallback = { label: "Procesando tu consulta", words: ["Un momento…"] };

export function assistantPhaseLabel(phase: string) {
  return (phases[phase] ?? fallback).label;
}

function useElapsedSeconds() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return elapsed;
}

export function MicrophoneIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" />
    <path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3.5M9 21.5h6" />
  </svg>;
}

export function SenttraActivity({ listening = false, children }: { listening?: boolean; children?: ReactNode }) {
  return <div aria-hidden="true" className={`${styles.orb} ${listening ? styles.listeningOrb : ""}`}>
    <div className={styles.aura} />
    <svg viewBox="0 0 120 120" fill="none" className={styles.orbDrawing}>
      <circle cx="60" cy="60" r="47" stroke="currentColor" strokeOpacity=".14" strokeWidth=".7" />
      <g className={styles.orbit}>
        <circle cx="60" cy="60" r="47" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="60 235" />
        <circle cx="107" cy="60" r="2.5" fill="currentColor" />
      </g>
      <g className={styles.innerOrbit}>
        <circle cx="60" cy="60" r="35" stroke="currentColor" strokeOpacity=".48" strokeWidth=".8" strokeDasharray="44 13 5 13" />
      </g>
      <circle cx="60" cy="60" r="23" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeOpacity=".3" />
      {!children && <><rect x="55" y="55" width="10" height="10" rx="2" fill="currentColor" transform="rotate(45 60 60)" /><circle cx="60" cy="60" r="13" stroke="currentColor" strokeOpacity=".3" /></>}
    </svg>
    {children && <span className={styles.orbIcon}>{children}</span>}
  </div>;
}

export function AssistantProgress({ phase }: { phase: string }) {
  const elapsed = useElapsedSeconds();
  const stage = phases[phase] ?? fallback;
  const word = stage.words[Math.floor(elapsed / 3) % stage.words.length];
  return <div className={styles.progress} data-assistant-progress data-phase={phase}>
    <div className={styles.progressVisual}><SenttraActivity /></div>
    <div className={styles.progressCopy}>
      <p className={styles.eyebrow}>Senttra está con tu consulta</p>
      <p className={styles.progressTitle} aria-hidden="true"><span key={`${phase}:${word}`} className={styles.changingWord}>{word}</span></p>
      <p className={styles.progressDetail} role="status">{stage.label}</p>
      <div className={styles.progressMeta} aria-hidden="true"><span className={styles.liveDot} /><span>{elapsed >= 20 ? "Sigo trabajando en tu pedido" : "En proceso"}</span><span className={styles.elapsed}>{elapsed} s</span></div>
    </div>
  </div>;
}

export function VideoLoading({ label, reconnecting = false }: { label: string; reconnecting?: boolean }) {
  const elapsed = useElapsedSeconds();
  return <div className={styles.videoLoading} data-video-loading role="status">
    <div className={styles.videoGrid} aria-hidden="true" />
    <div className={styles.videoScan} aria-hidden="true" />
    <div className={styles.videoLoadingContent}>
      <div className={styles.videoOrb}><SenttraActivity /></div>
      <p className={styles.videoLoadingTitle}>{label}</p>
      <p className={styles.videoLoadingDetail}>{elapsed >= 12 ? "La señal está tardando. Seguimos intentando…" : reconnecting ? "Recuperando la conexión con la cámara" : "La imagen aparecerá cuando esté lista"}</p>
    </div>
    <span className={styles.videoCorner} aria-hidden="true" />
  </div>;
}
