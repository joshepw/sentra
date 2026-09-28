"use client";

/* eslint-disable @next/next/no-img-element -- Private thumbnails require browser session cookies. */

import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryPlayer } from "@/components/sentra/history-player";
import { COLOR, TYPE } from "@/lib/edge-replay";
import { historyTime, type Coverage, type HistoryItem, type Playback, type ToolResult } from "@/lib/history-detections";

type Job = { id: string; status: string; phase: string; transcript?: string; reply?: string; error?: string; voice_error?: string; audio_url?: string; tool?: string; result?: ToolResult };
type Message = { id: string; question: string; reply?: string; audio?: string; voiceError?: string };
const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs transition-colors hover:border-accent disabled:cursor-default disabled:opacity-40";
const phases: Record<string, string> = { queued: "Consulta en cola…", transcribing: "Transcribiendo con Whisper…", planning: "Interpretando la consulta…", querying: "Consultando el historial…", replying: "Preparando la respuesta…", voice: "Preparando la voz…" };

function Voice({ source, auto }: { source: string; auto: boolean }) {
  const audio = useRef<HTMLAudioElement>(null), [blocked, setBlocked] = useState(false);
  useEffect(() => { if (auto) void audio.current?.play().catch(() => setBlocked(true)); else audio.current?.pause(); }, [source, auto]);
  return <div className="mt-2"><audio ref={audio} controls preload="none" src={source} className="h-8 max-w-full" aria-label="Respuesta hablada" />{blocked && <p className="mt-1 text-xs text-text-faint">Tocá reproducir para escuchar la respuesta.</p>}</div>;
}

export function HistoryChat({ csrf, onExpired }: { csrf: string; onExpired: () => void }) {
  const [coverage, setCoverage] = useState<Coverage>({ runs: [] }), [runId, setRunId] = useState("");
  const [text, setText] = useState(""), [messages, setMessages] = useState<Message[]>([]), [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [error, setError] = useState(""), [voice, setVoice] = useState(true);
  const [selection, setSelection] = useState<{ playback: Playback; item?: HistoryItem } | null>(null);
  const [recording, setRecording] = useState(false), [recordedSeconds, setRecordedSeconds] = useState(0), [paging, setPaging] = useState(false);
  const abort = useRef<AbortController | null>(null), recorder = useRef<MediaRecorder | null>(null), media = useRef<MediaStream | null>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null), mounted = useRef(true), sending = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; abort.current?.abort(); if (recordTimer.current) clearInterval(recordTimer.current); if (recorder.current?.state === "recording") recorder.current.stop(); media.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/edge/api/history/coverage", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("El índice de detecciones aún no está disponible.");
        const value: Coverage = await response.json();
        if (!controller.signal.aborted) { setCoverage(value); setRunId(previous => previous || value.runs.find(run => run.kind === "archive")?.id || value.runs[0]?.id || ""); }
      } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(load, 15000);
    };
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [onExpired]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, phase]);
  const post = useCallback(async (path: string, body: unknown, signal?: AbortSignal) => {
    const response = await fetch(`/edge/api/history/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body), signal });
    if (response.status === 401) { onExpired(); throw new Error("La sesión venció."); }
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "No se pudo completar la consulta.");
    return value;
  }, [csrf, onExpired]);
  const send = async (question: string, sound?: { audio: string; mime: string }) => {
    if (sending.current || (!question.trim() && !sound)) return;
    sending.current = true; setBusy(true); setPhase(sound ? "transcribing" : "planning"); setError(""); setText("");
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const localId = crypto.randomUUID();
    setMessages(previous => [...previous.slice(-9), { id: localId, question: sound ? "Consulta de voz…" : question }]);
    try {
      let job: Job = await post("chat", { ...(sound ?? { text: question }), run_id: runId || undefined, selected_uid: selection?.playback.track_uid, voice }, controller.signal);
      const deadline = Date.now() + 5 * 60 * 1000;
      let resultReceived = false;
      while (job.status === "queued" || job.status === "working") {
        if (controller.signal.aborted) return;
        setPhase(job.phase);
        if (job.transcript || job.reply) setMessages(previous => previous.map(message => message.id === localId ? { ...message, question: job.transcript ?? message.question, reply: job.reply } : message));
        if (job.result && !resultReceived) { setResult(job.result); resultReceived = true; }
        if (Date.now() > deadline) throw new Error("La consulta sigue demorando. Podés volver a intentar en un momento.");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const response = await fetch(`/edge/api/history/chat/${job.id}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudo recuperar la consulta.");
        job = await response.json();
      }
      if (job.status === "failed") throw new Error(job.error || "No se pudo completar la consulta.");
      setMessages(previous => previous.map(message => message.id === localId ? { ...message, question: job.transcript ?? message.question, reply: job.reply, audio: job.audio_url, voiceError: job.voice_error } : message));
      if (job.result) {
        if (!resultReceived) setResult(job.result);
        if (job.result.playback) setSelection({ playback: job.result.playback });
      }
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
    finally { sending.current = false; if (mounted.current && !controller.signal.aborted) { setBusy(false); setPhase(""); } }
  };
  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError("Este navegador no permite grabar voz. Podés escribir la consulta."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); media.current = stream;
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); recorder.current = active;
      const chunks: Blob[] = []; let seconds = 0, bytes = 0;
      active.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > 4 * 1024 * 1024 && active.state === "recording") active.stop(); } };
      active.onstop = () => {
        if (recordTimer.current) clearInterval(recordTimer.current); stream.getTracks().forEach(track => track.stop());
        if (!mounted.current) return;
        setRecording(false); const blob = new Blob(chunks, { type: active.mimeType });
        if (blob.size > 4 * 1024 * 1024) { setError("La grabación supera el límite. Probá con una consulta más corta."); return; }
        const reader = new FileReader(); reader.onload = () => { if (mounted.current) void send("", { audio: String(reader.result).split(",", 2)[1], mime: blob.type }); }; reader.readAsDataURL(blob);
      };
      active.start(500); setRecording(true); setRecordedSeconds(0);
      recordTimer.current = setInterval(() => { setRecordedSeconds(++seconds); if (seconds >= 59 && active.state === "recording") active.stop(); }, 1000);
    } catch { media.current?.getTracks().forEach(track => track.stop()); setError("No se pudo usar el micrófono. Revisá el permiso del navegador o escribí la consulta."); }
  };
  const more = async () => {
    if (!result?.next_cursor || !result.filters) return; setPaging(true); setError("");
    try {
      const params = new URLSearchParams(Object.entries({ ...result.filters, cursor: result.next_cursor }).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/edge/api/history/${result.counting === "candidate_events" ? "incidents" : "search"}?${params}`, { cache: "no-store" });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("No se pudo cargar la siguiente página.");
      const value: ToolResult = await response.json(); setResult(previous => ({ ...value, items: [...(previous?.items ?? []), ...(value.items ?? [])] }));
    } catch (reason) { setError((reason as Error).message); } finally { setPaging(false); }
  };
  const compare = async (uid: string) => {
    setPaging(true); setError("");
    try {
      const response = await fetch(`/edge/api/history/similar?uid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("No se pudieron comparar las vistas.");
      setResult(await response.json());
    } catch (reason) { setError((reason as Error).message); } finally { setPaging(false); }
  };
  const review = async (uid: string, decision: string) => {
    await post("review", { uid, decision });
    setResult(previous => previous ? { ...previous, items: previous.items?.map(item => item.uid === uid ? { ...item, review: decision } : item) } : previous);
    setSelection(previous => previous?.item?.uid === uid ? { ...previous, item: { ...previous.item, review: decision } } : previous);
  };
  const selectedRun = coverage.runs.find(run => run.id === runId);
  const fraction = selectedRun?.ended && selectedRun.cameras.length ? Math.max(0, Math.min(100, 100 * (Math.min(...selectedRun.cameras.map(camera => camera.last)) - selectedRun.started) / (selectedRun.ended - selectedRun.started))) : 0;
  return <section aria-label="Chat del historial" className="mb-5 rounded-xl border border-[var(--border)] bg-[#0c1b16] p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg text-text">Consultá las cámaras</h2><p className="mt-1 text-xs text-text-faint">Buscá por texto o voz y abrí el video de cada resultado.</p></div><label className="flex items-center gap-2 text-xs text-text-faint"><input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} />Responder con voz</label></div>
    <div className="mb-3 flex flex-wrap items-center gap-3"><label className="flex flex-wrap items-center gap-2 text-xs text-text-faint">Tramo para consultas sin fecha<select aria-label="Tramo de análisis" className="max-w-full rounded-lg border border-[var(--border)] bg-bg-input px-2 py-2 text-text" value={runId} onChange={event => setRunId(event.target.value)}>{!coverage.runs.length && <option value="">Esperando análisis</option>}{coverage.runs.map(run => <option key={run.id} value={run.id}>{run.title}</option>)}</select></label>{selectedRun && <span className="text-xs text-text-faint">{selectedRun.status === "complete" ? "Análisis completo" : selectedRun.kind === "live" ? "Detecciones nuevas del vivo" : `${selectedRun.status === "waiting" ? "Pausado; prioridad al vivo" : selectedRun.status === "failed" || selectedRun.status === "interrupted" ? "Análisis interrumpido" : "Analizando"} · ${fraction.toFixed(1)}%`} · {selectedRun.cameras.length} cámaras</span>}</div>
    {messages.length > 0 && <div ref={log} aria-live="polite" className="mb-4 max-h-72 space-y-3 overflow-y-auto rounded-lg bg-[#07130e] p-3">{messages.map((message, index) => <div key={message.id}><p className="text-sm text-accent">Vos: {message.question}</p>{message.reply && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text">{message.reply}</p>}{message.audio && <Voice source={message.audio} auto={voice && index === messages.length - 1} />}{message.voiceError && <p className="mt-1 text-xs text-warning">{message.voiceError}</p>}</div>)}{busy && <p className="text-xs text-text-faint" role="status">{phases[phase] ?? "Consultando…"}</p>}</div>}
    <form onSubmit={event => { event.preventDefault(); void send(text); }} className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="history-question">Consulta de cámaras</label><input id="history-question" autoComplete="off" maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder="Mostrame las pailas rojas de este tramo" className="min-w-[180px] flex-1 rounded-lg border border-[var(--border)] bg-bg-input px-3 py-3 text-sm text-text outline-none focus:border-accent" disabled={recording} /><button type="submit" className={`${button} border-accent/50 text-accent`} disabled={busy || recording || !text.trim()}>Enviar</button><button type="button" className={`${button} ${recording ? "border-warning text-warning" : ""}`} disabled={busy} onClick={() => recording ? recorder.current?.stop() : void startRecording()}>{recording ? `Enviar voz · ${recordedSeconds}s` : "Grabar voz"}</button></form>
    <div className="mt-2 flex flex-wrap gap-2">{[["Pailas rojas", "Mostrame las pailas rojas de este tramo"], ["Vueltas en U", "Mostrame las vueltas en U de este tramo"], ["Cruces en rojo", "Mostrame los cruces en rojo de este tramo"], ["Cobertura", "Qué cámaras y horas tienen detecciones guardadas"]].map(([label, question]) => <button key={label} className="cursor-pointer rounded-md px-2 py-1 text-xs text-text-faint hover:bg-[#123a2a] hover:text-accent disabled:opacity-40" disabled={busy || recording} onClick={() => void send(question)}>{label}</button>)}</div>
    {error && <p role="alert" className="mt-3 text-sm text-warning">{error}</p>}
    {result && <div className="mt-4 border-t border-[var(--border)] pt-4" aria-label="Resultados de la consulta">
      {result.total !== undefined && <p className="mb-2 text-sm">{result.total} {result.counting === "candidate_events" ? "incidencias para revisar" : "apariciones de vehículos"}{result.next_cursor ? ` · mostrando ${result.items?.length ?? 0}` : ""}</p>}
      {result.coverage && <p className="mb-3 text-xs leading-relaxed text-text-faint">Resultados de las cámaras y horas ya analizadas. {result.counting !== "candidate_events" && "Una misma unidad puede aparecer en distintas cámaras o seguimientos."} {result.coverage.runs.some(run => run.kind === "archive" && run.status !== "complete") && "El análisis del tramo sigue incompleto."}</p>}
      {(result.note || result.reason) && <p className="mb-3 text-xs leading-relaxed text-warning">{result.note ?? result.reason}</p>}
      {result.items?.length === 0 && <p className="py-3 text-sm text-text-faint">Sin coincidencias en el historial procesado para esos filtros.</p>}
      <div className="grid max-h-[34rem] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{result.items?.map(item => <article key={item.uid} className="flex gap-3 rounded-lg border border-[var(--border)] bg-[#09150f] p-3">
        {item.thumbnail_url && <img src={item.thumbnail_url} alt={`${item.type ?? "Vehículo"} ${item.color ?? ""}`} loading="lazy" className="h-20 w-24 shrink-0 rounded-md object-contain" />}
        <div className="min-w-0 flex-1"><p className="text-sm text-text">{item.kind ? item.kind === "uturn" ? "Posible vuelta en U" : "Posible cruce en rojo" : `${TYPE[item.type ?? ""] ?? item.type ?? "Vehículo"} · ${COLOR[item.color ?? ""] ?? item.color ?? "Color sin determinar"}`}</p><p className="mt-1 text-xs text-text-faint">{item.title}</p><p className="mt-1 text-xs text-text-faint">{historyTime(item.at ?? item.best_time ?? item.first ?? item.playback.at)}</p>{item.kind && <p className="mt-1 text-xs text-warning">{item.review === "confirmed" ? "Confirmada en revisión" : item.review === "dismissed" ? "Descartada" : "Pendiente de revisión"}</p>}{item.similarity !== undefined && <p className="mt-1 text-xs text-warning">Similitud visual: {item.similarity.toFixed(3)}</p>}<div className="mt-2 flex flex-wrap gap-2"><button className={button} onClick={() => setSelection({ playback: item.playback, item })}>Ver video</button>{!item.kind && <button className={button} disabled={paging || busy} onClick={() => void compare(item.uid)}>Otras cámaras</button>}</div></div>
      </article>)}</div>
      {result.next_cursor && <button className={`${button} mt-3`} disabled={paging} onClick={() => void more()}>{paging ? "Cargando…" : "Ver más resultados"}</button>}
      {result.runs && <div className="space-y-2 text-xs text-text-faint">{result.runs.map(run => <p key={run.id}>{run.title} · {run.cameras.length} cámaras · {run.status === "complete" ? "Completo" : "Parcial"} · {historyTime(run.started)}{run.ended ? ` a ${historyTime(run.ended)}` : " en adelante"}</p>)}</div>}
      {result.cameras && <div className="flex flex-wrap gap-2 text-xs">{result.cameras.map(camera => <span key={camera.camera} className={`rounded-md border border-[var(--border)] px-2 py-1 ${camera.receiving ? "text-accent" : "text-warning"}`}>{camera.title}: {camera.receiving ? "con señal" : "sin señal"}</span>)}</div>}
    </div>}
    {selection && <HistoryPlayer key={`${selection.playback.camera}:${selection.playback.at}:${selection.playback.track_uid ?? ""}`} playback={selection.playback} item={selection.item} onClose={() => setSelection(null)} onExpired={onExpired} onReview={review} />}
  </section>;
}
