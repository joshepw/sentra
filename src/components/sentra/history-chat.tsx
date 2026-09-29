"use client";

/* eslint-disable @next/next/no-img-element -- Private thumbnails require browser session cookies. */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { HistoryPlayer, type PlayerControl } from "@/components/sentra/history-player";
import { EdgeTrafficChart } from "@/components/sentra/edge-traffic-chart";
import { CorridorMap } from "@/components/sentra/corridor-map";
import { AssistantProgress, assistantPhaseLabel } from "@/components/sentra/assistant-feedback";
import { VoiceRecorder } from "@/components/sentra/voice-recorder";
import { COLOR, TYPE } from "@/lib/edge-replay";
import { historyTime, type Coverage, type HistoryItem, type Playback, type ToolResult } from "@/lib/history-detections";
import type { ViewerState, ViewerAction, ViewChanges, ActionFailure } from "@/lib/viewer-actions";

type Job = { id: string; status: string; phase: string; transcript?: string; reply?: string; error?: string; voice_error?: string; audio_url?: string; tool?: string; result?: ToolResult; action?: ViewerAction };
type Message = { id: string; question: string; reply?: string; audio?: string; voiceError?: string };
const CameraMap = memo(CorridorMap);
const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs transition-colors hover:border-accent disabled:cursor-default disabled:opacity-40";

function Voice({ source, auto }: { source: string; auto: boolean }) {
  const audio = useRef<HTMLAudioElement>(null), [blocked, setBlocked] = useState(false);
  const played = useRef("");
  useEffect(() => { if (auto && played.current !== source) { played.current = source; void audio.current?.play().catch(() => setBlocked(true)); } else if (!auto) audio.current?.pause(); }, [source, auto]);
  return <div><audio ref={audio} controls preload="none" src={source} className="h-7 w-48 max-w-full" aria-label="Respuesta hablada" />{blocked && <p className="text-[10px] text-text-faint">Tocá reproducir para escuchar.</p>}</div>;
}

export function HistoryChat({ csrf, onExpired, viewer, onView, cameras, children, deferTraffic }: {
  csrf: string; onExpired: () => void; viewer: ViewerState; onView: (changes: ViewChanges) => void;
  cameras: { key: string; title: string; receiving: boolean }[]; children: ReactNode; deferTraffic: boolean;
}) {
  const [coverage, setCoverage] = useState<Coverage>({ runs: [] });
  const liveRun = coverage.runs.find(run => run.kind === "live");
  // Omitting the run would let the backend choose an older archive by default.
  const runId = liveRun?.id ?? "live";
  const mapCameras = useMemo(() => cameras.map(camera => ({ id: camera.key, nombre: camera.title, n_giro: 0, n_rojo: 0 })), [cameras]);
  const [text, setText] = useState(""), [messages, setMessages] = useState<Message[]>([]), [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [error, setError] = useState(""), [voice, setVoice] = useState(true);
  const [selection, setSelection] = useState<{ playback: Playback; item?: HistoryItem } | null>(null);
  const [recording, setRecording] = useState(false), [paging, setPaging] = useState(false);
  const abort = useRef<AbortController | null>(null), mounted = useRef(true), sending = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerControl>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const localRevision = useRef(0), conversation = useRef("");
  const current = useRef({ viewer, result, selection, runId });
  useEffect(() => { current.current = { viewer, result, selection, runId }; }, [viewer, result, selection, runId]);
  const revision = () => `${current.current.viewer.revision}:${localRevision.current}`;
  const choose = (value: typeof selection) => {
    localRevision.current++; current.current.selection = value; setSelection(value);
  };
  const showResult = (value: ToolResult) => {
    localRevision.current++; current.current.result = value; setResult(value); choose(null);
    if (typeof value.filters?.camera === "string") onView({ camera: value.filters.camera, all: false });
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; abort.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/edge/api/history/coverage", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("El índice de detecciones aún no está disponible.");
        const value: Coverage = await response.json();
        if (!controller.signal.aborted) setCoverage(value);
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
    if (!response.ok) throw Object.assign(new Error(value.error || "No se pudo completar la consulta."), { status: response.status });
    return value;
  }, [csrf, onExpired]);
  const send = async (question: string, sound?: { audio: string; mime: string }) => {
    if (sending.current || (!question.trim() && !sound)) return;
    sending.current = true; setBusy(true); setPhase(sound ? "transcribing" : "planning"); setError(""); setText("");
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const localId = crypto.randomUUID();
    setMessages(previous => [...previous.slice(-9), { id: localId, question: sound ? "Consulta de voz…" : question }]);
    try {
      const snapshot = current.current, expectedRevision = revision();
      conversation.current ||= crypto.randomUUID();
      const visible = snapshot.result?.items ?? [];
      let job: Job = await post("chat", { ...(sound ?? { text: question }), run_id: snapshot.runId || undefined,
        selected_uid: snapshot.selection?.item?.uid ?? snapshot.selection?.playback.incident_uid ?? snapshot.selection?.playback.track_uid,
        context_id: conversation.current, voice,
        viewer: { ...snapshot.viewer, revision: expectedRevision, result_ids: visible.slice(0, 1000).map(item => item.uid), filters: snapshot.result?.filters ?? {} },
      }, controller.signal);
      // send runs only from form, microphone and shortcut events; never during render.
      // eslint-disable-next-line react-hooks/purity -- Event-driven polling deadline.
      const deadline = performance.now() + 5 * 60 * 1000;
      let resultReceived = false;
      let actionReceipt: { status: "applied" | "stale" | "failed"; reason?: ActionFailure } | null = null;
      const receive = (value: ToolResult) => {
        if (revision() !== expectedRevision) throw new Error("La vista cambió durante la consulta. Repetila con la selección actual.");
        if (value.playback) choose({ playback: value.playback }); else showResult(value);
        resultReceived = true;
      };
      while (["queued", "working", "waiting_action"].includes(job.status)) {
        if (controller.signal.aborted) return;
        setPhase(job.phase);
        const { transcript, reply } = job;
        if (transcript || reply) setMessages(previous => previous.map(message => message.id === localId ? { ...message, question: transcript ?? message.question, reply } : message));
        if (job.result && !resultReceived) receive(job.result);
        // eslint-disable-next-line react-hooks/purity -- Elapsed time in the same event-driven poll.
        if (performance.now() > deadline) throw new Error("La consulta sigue demorando. Podés volver a intentar en un momento.");
        if (job.status === "waiting_action" && job.action) {
          if (!actionReceipt) {
            actionReceipt = { status: "stale" };
            if (job.action.revision === revision()) {
              try {
                const action = job.action;
                if (action.kind === "media" || action.kind === "navigate") {
                  if (current.current.selection?.item?.uid !== action.uid) throw new Error("no_video");
                  if (action.kind === "navigate") await navigate(action.direction);
                  else {
                    if (!player.current) throw new Error("no_video");
                    await player.current.control(action);
                    if (action.revision !== revision()) throw new Error("stale");
                  }
                } else flushSync(() => {
                  if (action.kind === "view") {
                    onView(action.changes);
                    if (action.changes.close_video || action.changes.mode) choose(null);
                  } else if (action.kind === "open_video") {
                    const item = current.current.result?.items?.find(row => row.uid === action.uid)
                      ?? (current.current.selection?.item?.uid === action.uid ? current.current.selection.item : undefined);
                    choose({ playback: action.playback, item }); onView({ camera: action.playback.camera, all: false });
                  } else throw new Error("Acción desconocida.");
                });
                actionReceipt = { status: "applied" };
              } catch (reason) {
                const code = (reason as Error).message;
                actionReceipt = job.action.revision !== revision() ? { status: "stale" } : {
                  status: "failed", ...(["no_more_results", "no_video", "unavailable_time", "playback_blocked"].includes(code) ? { reason: code as ActionFailure } : {}),
                };
              }
            }
          }
          try { job = await post(`chat/${job.id}/applied`, actionReceipt, controller.signal); continue; }
          catch (reason) { if ((reason as { status?: number }).status !== 429) throw reason; }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        const response = await fetch(`/edge/api/history/chat/${job.id}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudo recuperar la consulta.");
        job = await response.json();
      }
      if (job.status === "failed") throw new Error(job.error || "No se pudo completar la consulta.");
      const { transcript, reply, audio_url, voice_error } = job;
      setMessages(previous => previous.map(message => message.id === localId ? { ...message, question: transcript ?? message.question, reply, audio: audio_url, voiceError: voice_error } : message));
      if (job.result) {
        if (!resultReceived) receive(job.result);
      }
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
    finally { sending.current = false; if (mounted.current && !controller.signal.aborted) { setBusy(false); setPhase(""); } }
  };
  const loadPage = async (source: ToolResult) => {
      const params = new URLSearchParams(Object.entries({ ...source.filters, cursor: source.next_cursor }).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/edge/api/history/${source.counting === "candidate_events" ? "incidents" : "search"}?${params}`, { cache: "no-store" });
      if (response.status === 401) { onExpired(); throw new Error("La sesión venció."); }
      if (!response.ok) throw new Error("No se pudo cargar la siguiente página.");
      const value: ToolResult = await response.json();
      return { ...value, items: [...(source.items ?? []), ...(value.items ?? [])] };
  };
  const more = async () => {
    const source = current.current.result, expected = revision();
    if (!source?.next_cursor || !source.filters) return; setPaging(true); setError("");
    try {
      const value = await loadPage(source);
      if (revision() !== expected) return;
      localRevision.current++; current.current.result = value; setResult(value);
    } catch (reason) { setError((reason as Error).message); } finally { setPaging(false); }
  };
  const navigate = async (direction: "next" | "previous") => {
    const source = current.current.result, uid = current.current.selection?.item?.uid, expected = revision();
    const index = source?.items?.findIndex(item => item.uid === uid) ?? -1;
    if (!source || index < 0) throw new Error("no_video");
    const target = index + (direction === "next" ? 1 : -1);
    let value = source;
    if (target === source.items?.length && source.next_cursor) value = await loadPage(source);
    if (revision() !== expected) throw new Error("stale");
    const item = value.items?.[target];
    if (!item) throw new Error("no_more_results");
    flushSync(() => {
      if (value !== source) { current.current.result = value; setResult(value); }
      choose({ playback: item.playback, item }); onView({ camera: item.camera, all: false });
    });
  };
  const manualNavigate = async (direction: "next" | "previous") => {
    setPaging(true); setError("");
    try { await navigate(direction); }
    catch (reason) { setError((reason as Error).message === "no_more_results" ? "No hay otro resultado en esa dirección." : "La vista cambió o no se pudo abrir el siguiente resultado."); }
    finally { setPaging(false); }
  };
  const compare = async (uid: string) => {
    setPaging(true); setError("");
    try {
      const response = await fetch(`/edge/api/history/similar?uid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("No se pudieron comparar las vistas.");
      showResult(await response.json());
    } catch (reason) { setError((reason as Error).message); } finally { setPaging(false); }
  };
  const review = async (uid: string, decision: string) => {
    await post("review", { uid, decision });
    setResult(previous => previous ? { ...previous, items: previous.items?.map(item => item.uid === uid ? { ...item, review: decision } : item) } : previous);
    setSelection(previous => previous?.item?.uid === uid ? { ...previous, item: { ...previous.item, review: decision } } : previous);
  };
  const selectedIndex = result?.items?.findIndex(item => item.uid === selection?.item?.uid) ?? -1;
  const latest = messages.at(-1);
  const cameraTitle = (key: string) => cameras.find(camera => camera.key === key)?.title ?? key;
  const filters = result?.filters;
  return <section aria-label="Chat del historial" className="flex min-h-0 flex-1 flex-col pt-2">
      {filters && <div aria-label="Filtros de la búsqueda" className="mb-2 flex shrink-0 gap-2 overflow-x-auto whitespace-nowrap px-3 text-[11px] text-accent sm:px-5">
        <span>{filters.camera ? cameraTitle(String(filters.camera)) : "Todas las cámaras"}</span>
        {filters.type && <span>· {TYPE[String(filters.type)] ?? filters.type}</span>}{filters.color && <span>· {COLOR[String(filters.color)] ?? filters.color}</span>}
        {filters.kind && <span>· {filters.kind === "uturn" ? "Vueltas en U" : "Cruces en rojo"}</span>}
        {filters.review && <span>· {filters.review === "confirmed" ? "Confirmadas" : filters.review === "dismissed" ? "Descartadas" : "Pendientes"}</span>}
        {filters.start && filters.end && <span>· {historyTime(filters.start)} a {historyTime(filters.end)}</span>}
      </div>}
    <div aria-label="Mapa y tráfico del corredor" className="mb-3 flex h-[clamp(100px,15dvh,128px)] shrink-0 snap-x snap-mandatory gap-3 overflow-x-auto px-3 sm:grid sm:h-[clamp(112px,21dvh,220px)] sm:grid-cols-[minmax(0,1fr)_minmax(240px,32%)] sm:overflow-visible sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="h-full min-h-0 min-w-0 basis-[88%] shrink-0 snap-start" aria-label="Mapa del corredor"><CameraMap cams={mapCameras} sel={Math.max(0, cameras.findIndex(camera => camera.key === viewer.camera))} onPick={index => { choose(null); onView({ camera: cameras[index].key, all: false }); }} admin={false} api="" token="" loadSavedLayout={false} compact /></div>
      <div className="h-full min-h-0 min-w-0 basis-[88%] shrink-0 snap-start"><EdgeTrafficChart camera={viewer.camera} title={cameraTitle(viewer.camera)} run={liveRun} onExpired={onExpired} defer={deferTraffic} /></div>
    </div>
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(120px,2.2fr)_minmax(64px,1fr)] gap-3 px-3 pb-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1">
      <div className="min-h-0 min-w-0" aria-label="Panel de video">
        {selection ? <HistoryPlayer key={`${selection.playback.camera}:${selection.playback.at}:${selection.playback.track_uid ?? selection.playback.incident_uid ?? ""}`} controlRef={player} playback={selection.playback} item={selection.item} onClose={() => choose(null)} onExpired={onExpired} onReview={review} boxes={viewer.boxes} onBoxes={boxes => onView({ boxes })} /> : <div className="h-full min-h-0 overflow-y-auto rounded-xl" data-camera-view>{children}</div>}
      </div>
      <aside aria-label="Resultados de la consulta" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0c1b16]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm">{result?.total !== undefined ? `${result.total} ${result.counting === "candidate_events" ? "incidencias" : "apariciones"}` : "Resultados"}</h2>
          {selectedIndex >= 0 && <div className="flex items-center gap-2"><span className="text-xs text-accent">{selectedIndex + 1} / {result?.total ?? result?.items?.length}</span><button className={button} aria-label="Resultado anterior" disabled={busy || paging || selectedIndex === 0} onClick={() => void manualNavigate("previous")}>←</button><button className={button} aria-label="Siguiente resultado" disabled={busy || paging || (selectedIndex === (result?.items?.length ?? 0) - 1 && !result?.next_cursor)} onClick={() => void manualNavigate("next")}>→</button></div>}
        </div>
        {busy && <div className="shrink-0 px-3 pt-2 lg:pt-3"><AssistantProgress phase={phase} /></div>}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" data-result-list>
          {!result && !busy && <div className="space-y-3 py-3 text-sm text-text-faint"><p>Buscá vehículos o incidencias por texto o voz.</p><div className="flex flex-wrap gap-2">{[["Pailas rojas", "Mostrame las pailas rojas"], ["Vueltas en U", "Mostrame las vueltas en U"], ["Cruces en rojo", "Mostrame los cruces en rojo"], ["Cobertura", "Qué cámaras y horas tienen detecciones guardadas"]].map(([label, question]) => <button key={label} className={button} disabled={busy || recording} onClick={() => void send(question)}>{label}</button>)}</div><p className="text-xs leading-relaxed">Después podés decir “abrí el segundo”, “siguiente resultado” o “retrocedé diez segundos”.</p></div>}
          {result?.coverage && <p className="hidden text-[11px] leading-relaxed text-text-faint lg:block">{result.counting !== "candidate_events" && "Una misma unidad puede aparecer más de una vez. "}{result.coverage.runs.some(run => run.kind === "archive" && run.status !== "complete") ? "Cobertura parcial: solo los momentos analizados." : "Resultados de los momentos analizados."}</p>}
          {(result?.note || result?.reason) && <p className="text-xs leading-relaxed text-warning">{result.note ?? result.reason}</p>}
          {result?.items?.length === 0 && <p className="py-3 text-sm text-text-faint">Sin coincidencias en el historial procesado para esos filtros.</p>}
          {result?.items?.map((item, index) => <article key={item.uid} data-result-number={index + 1} aria-current={selection?.item?.uid === item.uid ? "true" : undefined} className={`flex gap-3 rounded-lg border p-2 lg:p-3 ${selection?.item?.uid === item.uid ? "border-accent/60 bg-[#123a2a]/50" : "border-[var(--border)] bg-[#09150f]"}`}>
            {item.thumbnail_url && <img src={item.thumbnail_url} alt={`${item.type ?? "Vehículo"} ${item.color ?? ""}`} loading="lazy" className="h-16 w-20 shrink-0 rounded-md object-contain" />}
            <div className="min-w-0 flex-1"><p className="text-sm text-text"><span className="mr-1 font-mono text-accent">{index + 1}.</span>{item.kind ? item.kind === "uturn" ? "Posible vuelta en U" : "Posible cruce en rojo" : `${TYPE[item.type ?? ""] ?? item.type ?? "Vehículo"} · ${COLOR[item.color ?? ""] ?? item.color ?? "Color sin determinar"}`}</p><p className="mt-1 text-xs text-text-faint">{item.title}</p><p className="mt-1 text-xs text-text-faint">{historyTime(item.at ?? item.best_time ?? item.first ?? item.playback.at)}</p>{item.kind && <p className="mt-1 text-xs text-warning">{item.review === "confirmed" ? "Confirmada en revisión" : item.review === "dismissed" ? "Descartada" : "Pendiente de revisión"}</p>}{item.similarity !== undefined && <p className="mt-1 text-xs text-warning">Similitud visual: {item.similarity.toFixed(3)}</p>}<div className="mt-2 flex flex-wrap gap-2"><button className={button} onClick={() => { choose({ playback: item.playback, item }); onView({ camera: item.camera, all: false }); }}>Ver video</button>{!item.kind && <button className={button} disabled={paging || busy} onClick={() => void compare(item.uid)}>Otras cámaras</button>}</div></div>
          </article>)}
          {result?.next_cursor && <button className={`${button} w-full`} disabled={paging || busy} onClick={() => void more()}>{paging ? "Cargando…" : "Ver más resultados"}</button>}
          {result?.runs?.map(run => <p key={run.id} className="text-xs text-text-faint">{run.title} · {run.cameras.length} cámaras · {run.status === "complete" ? "Completo" : "Parcial"} · {historyTime(run.started)}{run.ended ? ` a ${historyTime(run.ended)}` : " en adelante"}</p>)}
          {result?.cameras?.map(camera => <p key={camera.camera} className={`text-xs ${camera.receiving ? "text-accent" : "text-warning"}`}>{camera.title}: {camera.receiving ? "con señal" : "sin señal"}</p>)}
        </div>
      </aside>
    </div>
    <footer className="relative shrink-0 border-t border-[var(--border)] bg-[#0c1b16] px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5" aria-label="Asistente de cámaras">
      <div hidden={!transcriptOpen} ref={log} id="history-transcript" className="absolute inset-x-3 bottom-full z-20 max-h-[30dvh] space-y-3 overflow-y-auto rounded-t-xl border border-[var(--border)] bg-[#07130e] p-3 shadow-xl sm:inset-x-5">
        {!messages.length && <p className="text-xs text-text-faint">Tus consultas aparecerán acá.</p>}
        {messages.map(message => <div key={message.id}><p className="text-sm text-accent">Vos: {message.question}</p>{message.reply && <p className="mt-1 whitespace-pre-wrap text-sm text-text">{message.reply}</p>}{message.voiceError && <p className="text-xs text-warning">{message.voiceError}</p>}</div>)}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button className="cursor-pointer text-xs text-text-faint hover:text-accent" aria-expanded={transcriptOpen} aria-controls="history-transcript" onClick={() => setTranscriptOpen(value => !value)}>{transcriptOpen ? "Ocultar conversación" : "Conversación"}{messages.length ? ` · ${messages.length}` : ""}</button>
        <label className="flex items-center gap-1 text-[11px] text-text-faint"><input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} />Responder con voz</label>
        {latest?.audio && <Voice source={latest.audio} auto={voice && !recording && !busy} />}
        <p aria-live={busy ? "off" : "polite"} className="min-w-0 basis-full truncate text-xs text-text-faint lg:basis-auto lg:flex-1">{busy ? assistantPhaseLabel(phase) : latest?.reply ?? "Pedile a Senttra qué querés ver."}</p>
      </div>
      {error && <p role="alert" className="mb-2 text-xs text-warning">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); void send(text); }} className="flex gap-2"><label className="sr-only" htmlFor="history-question">Consulta de cámaras</label><input id="history-question" autoComplete="off" maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder="Buscá o controlá el video…" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-bg-input px-3 py-3 text-sm text-text outline-none focus:border-accent" disabled={recording} /><button type="submit" className={`${button} border-accent/50 text-accent`} disabled={busy || recording || !text.trim()}>Enviar</button><VoiceRecorder disabled={busy} onSend={sound => void send("", sound)} onActivityChange={setRecording} onError={setError} /></form>
    </footer>
  </section>;
}
