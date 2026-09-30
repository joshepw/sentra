"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { containedVideo } from "@/lib/live-detections";
import { vehicleName } from "@/lib/edge-replay";
import { historyFrameAt, historyTime, type HistoryFrame, type HistoryItem, type Playback, type ToolResult } from "@/lib/history-detections";
import type { MediaCommand } from "@/lib/viewer-actions";
import { VideoLoading } from "@/components/sentra/assistant-feedback";

type Segment = { id: string; started: number; ended: number; url: string; state: string };
const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:border-accent disabled:opacity-40";
export type PlayerControl = { control: (command: MediaCommand) => Promise<void>; ready: () => Promise<void> };

export function HistoryPlayer({ playback, title, item, onClose, onExpired, onReview, boxes, onBoxes, controlRef }: {
  playback: Playback; title?: string; item?: HistoryItem; onClose: () => void; onExpired: () => void;
  onReview: (uid: string, decision: string) => Promise<void>;
  boxes: boolean; onBoxes: (boxes: boolean) => void; controlRef: Ref<PlayerControl>;
}) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), caption = useRef<HTMLSpanElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]), [segment, setSegment] = useState<Segment | null>(null);
  const [initial, setInitial] = useState(playback.source === "camera_time" ? playback.at : playback.at - 4), [error, setError] = useState("");
  const [frames, setFrames] = useState<HistoryFrame[]>([]), [focus, setFocus] = useState<{ local_id: number; session: string } | null>(null);
  const [analysis, setAnalysis] = useState(playback.run_id);
  const [position, setPosition] = useState(playback.at), [reviewing, setReviewing] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [paused, setPaused] = useState(false), [controlling, setControlling] = useState(false);
  const wantPlaying = useRef(true), commandId = useRef(0);
  const loadFailure = useRef<string | null>(null);
  const loadedPlayback = useRef<Playback | null>(null);
  const seekAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { commandId.current++; seekAbort.current?.abort(); }, []);
  const control = async (command: MediaCommand) => {
    const element = video.current;
    if (!element || !segment || element.readyState < 1) throw new Error("no_video");
    const id = ++commandId.current;
    seekAbort.current?.abort();
    if (command.operation === "pause") { wantPlaying.current = false; element.pause(); setPaused(true); return; }
    if (command.operation === "play") {
      try { await element.play(); wantPlaying.current = true; setPaused(false); }
      catch { throw new Error("playback_blocked"); }
      return;
    }
    if (!Number.isSafeInteger(command.seconds) || !command.seconds || Math.abs(command.seconds) > 31 * 86400) throw new Error("unavailable_time");
    const target = segment.started + element.currentTime + command.seconds;
    const playing = !element.paused;
    let row = segments.find(candidate => candidate.started <= target && target < candidate.ended);
    if (!row) {
      const abort = new AbortController(); seekAbort.current = abort;
      const timeout = setTimeout(() => abort.abort(), 10000);
      try {
        const params = new URLSearchParams({ camera: playback.camera, at: String(target) });
        const response = await fetch(`/edge/api/history/recording?${params}`, { cache: "no-store", signal: abort.signal });
        if (response.status === 401) { onExpired(); throw new Error("no_video"); }
        if (!response.ok) throw new Error("playback_blocked");
        const resolved: ToolResult = await response.json(), destination = resolved.playback;
        if (!resolved.available || !destination || destination.camera !== playback.camera
          || Math.abs(destination.at - target) > .00001 || !destination.segment_id) throw new Error("unavailable_time");
        const window = new URLSearchParams({ camera: playback.camera, start: String(target - 70), end: String(target + 120) });
        const archive = await fetch(`/edge/api/live/archive?${window}`, { cache: "no-store", signal: abort.signal });
        if (archive.status === 401) { onExpired(); throw new Error("no_video"); }
        if (!archive.ok) throw new Error("playback_blocked");
        const data: { segments: Segment[] } = await archive.json();
        row = data.segments.find(candidate => candidate.id === destination.segment_id && candidate.started <= target && target < candidate.ended);
        if (!row) throw new Error("unavailable_time");
        if (id !== commandId.current || abort.signal.aborted || !video.current) throw new Error("no_video");
        setSegments(data.segments); setAnalysis(destination.run_id);
      } catch (reason) {
        if (abort.signal.aborted) throw new Error(id !== commandId.current ? "no_video" : "playback_blocked");
        throw reason;
      } finally { clearTimeout(timeout); }
    }
    wantPlaying.current = playing; setPaused(!playing);
    setError("");
    if (row.id === segment.id) element.currentTime = target - row.started;
    else { setInitial(target); setFrames([]); setFocus(null); setSegment(row); }
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (id !== commandId.current || !video.current) throw new Error("no_video");
      const active = video.current;
      if (active.dataset.segment === row.id && active.readyState >= 2 && !active.seeking && Math.abs(active.currentTime - (target - row.started)) < .6) return;
      if (active.error) break;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error("playback_blocked");
  };
  const ready = async () => {
    const id = commandId.current, deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (id !== commandId.current) throw new Error("no_video");
      if (loadedPlayback.current !== playback) { await new Promise(resolve => setTimeout(resolve, 40)); continue; }
      if (loadFailure.current) throw new Error(loadFailure.current);
      const element = video.current;
      if (element?.error) throw new Error("playback_blocked");
      if (element && element.readyState >= 2 && !element.seeking
        && (playback.source !== "camera_time" || element.dataset.segment === playback.segment_id)
        && Math.abs(Number(element.dataset.started) + element.currentTime - playback.at) < .6) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error("playback_blocked");
  };
  useImperativeHandle(controlRef, () => ({ control, ready }));
  const manualControl = async (command: MediaCommand) => {
    setControlling(true);
    try { await control(command); }
    catch (reason) { setError((reason as Error).message === "unavailable_time" ? "No hay grabación disponible para ese instante." : "No se pudo completar el control del video."); }
    finally { setControlling(false); }
  };
  useEffect(() => {
    const abort = new AbortController();
    loadFailure.current = null;
    const load = async () => {
      try {
        const trajectoryStart = item?.details?.trajectory?.[0]?.[0];
        const lead = playback.source === "camera_time" ? playback.at
          : item?.kind === "uturn" ? Math.max(playback.at - 60, Math.min(playback.at - 12, (trajectoryStart ?? playback.at) - 1)) : playback.at - 4;
        const params = new URLSearchParams({ camera: playback.camera, start: String(playback.at - 70), end: String(playback.at + 120) });
        const response = await fetch(`/edge/api/live/archive?${params}`, { cache: "no-store", signal: abort.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudo abrir la grabación.");
        const data: { segments: Segment[] } = await response.json();
        const row = playback.source === "camera_time"
          ? data.segments.find(s => s.id === playback.segment_id && s.started <= playback.at && s.ended > playback.at)
          : data.segments.find(s => s.started <= lead && s.ended > lead)
            ?? data.segments.find(s => s.started <= playback.at && s.ended > playback.at);
        if (!row) { loadFailure.current = "unavailable_time"; throw new Error("No hay video guardado para este instante."); }
        if (!abort.signal.aborted) {
          setError("");
          setSegments(data.segments); setSegment(row); setAnalysis(playback.run_id); setInitial(Math.max(row.started, lead));
          // A repeated request for the same camera/time can reuse this player.
          if (playback.source === "camera_time") {
            wantPlaying.current = true; setPaused(false);
            if (video.current?.dataset.segment === row.id) {
              video.current.currentTime = playback.at - row.started;
              void video.current.play().catch(() => setNeedsPlay(true));
            }
          }
          loadedPlayback.current = playback;
        }
      } catch (reason) { if (!abort.signal.aborted) { loadFailure.current ||= "playback_blocked"; loadedPlayback.current = playback; setError((reason as Error).message); } }
    };
    void load(); return () => abort.abort();
  }, [playback, item?.kind, item?.details?.trajectory, onExpired]);
  useEffect(() => {
    const runId = analysis;
    if (!segment || !runId) return;
    const abort = new AbortController();
    const load = async () => {
      try {
        const params = new URLSearchParams({ run_id: runId, camera: playback.camera, start: String(segment.started), end: String(segment.ended) });
        if (playback.track_uid && runId === playback.run_id) params.set("uid", playback.track_uid);
        const response = await fetch(`/edge/api/history/frames?${params}`, { cache: "no-store", signal: abort.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudieron cargar las cajas de este tramo.");
        const data: { frames: HistoryFrame[]; focus: typeof focus } = await response.json();
        if (!abort.signal.aborted) { setFrames(data.frames); setFocus(data.focus); }
      } catch (reason) { if (!abort.signal.aborted) setError((reason as Error).message); }
    };
    void load(); return () => abort.abort();
  }, [segment, playback, analysis, onExpired]);
  useEffect(() => {
    const element = video.current, layer = canvas.current, label = caption.current;
    if (!element || !layer || !label || !segment) return;
    const context = layer.getContext("2d"); if (!context) return;
    let stopped = false, callback = 0, animation = 0;
    const draw = (mediaTime = element.currentTime) => {
      const rect = layer.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
      context.resetTransform(); context.clearRect(0, 0, layer.width, layer.height); context.scale(ratio, ratio);
      layer.dataset.boxes = "0";
      if (!boxes || element.seeking || element.readyState < 2) { label.textContent = boxes ? "Sincronizando…" : "Cajas ocultas"; return; }
      const at = segment.started + mediaTime, frame = analysis ? historyFrameAt(frames, at) : null;
      if (!frame) { label.textContent = "Sin detecciones indexadas para este instante"; return; }
      const area = containedVideo(rect.width, rect.height, element.videoWidth, element.videoHeight);
      if (!area || frame.width !== element.videoWidth || frame.height !== element.videoHeight) return;
      context.font = "600 11px ui-monospace, monospace"; context.textBaseline = "top";
      for (const object of frame.objects) {
        const selected = focus?.local_id === object.id && focus.session === frame.session;
        const [x1, y1, x2, y2] = object.box, x = area.x + x1 * area.width, y = area.y + y1 * area.height;
        context.strokeStyle = selected ? "#ffdb68" : "#57f1aa"; context.lineWidth = selected ? 3 : 1.5;
        context.strokeRect(x, y, (x2 - x1) * area.width, (y2 - y1) * area.height);
        const attrs = object.attributes, name = attrs ? vehicleName(attrs.type, attrs.color, object.class_id) : object.label;
        const text = `${name} #${object.id}`; const labelY = Math.max(area.y, y - 18);
        context.fillStyle = "#00150deb"; context.fillRect(x, labelY, context.measureText(text).width + 8, 17);
        context.fillStyle = selected ? "#ffdb68" : "#a8fbd0"; context.fillText(text, x + 4, labelY + 2);
      }
      const trajectory = item?.details?.trajectory;
      const inIncident = trajectory?.length && trajectory[0][0] <= segment.ended && trajectory[trajectory.length - 1][0] >= segment.started;
      const band = inIncident ? item?.details?.stop_band : undefined;
      if (band?.length === 4) {
        context.strokeStyle = "#ffbd59"; context.setLineDash([5, 4]);
        context.strokeRect(area.x + band[0] / 1280 * area.width, area.y + band[1] / 720 * area.height, (band[2] - band[0]) / 1280 * area.width, (band[3] - band[1]) / 720 * area.height);
        context.setLineDash([]);
      }
      const trail = inIncident ? trajectory?.filter(p => p[0] <= at) : undefined;
      if (trail && trail.length > 1) {
        context.strokeStyle = "#ffdb68"; context.lineWidth = 2; context.beginPath();
        trail.forEach((point, index) => { const x = area.x + point[1] * area.width, y = area.y + point[2] * area.height; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
      }
      layer.dataset.boxes = String(frame.objects.length); layer.dataset.observation = String(frame.captured_at); layer.dataset.time = String(at);
      const light = ({ R: "rojo", A: "amarillo", G: "verde", "?": "no determinado" } as Record<string, string>)[frame.signal?.state ?? "?"];
      label.textContent = `${frame.objects.length} objetos · semáforo ${light}`;
    };
    const redraw = () => draw();
    const onFrame: VideoFrameRequestCallback = (_now, data) => { draw(data.mediaTime); if (!stopped) callback = element.requestVideoFrameCallback(onFrame); };
    if (element.requestVideoFrameCallback) callback = element.requestVideoFrameCallback(onFrame);
    else { const tick = () => { draw(); if (!stopped) animation = requestAnimationFrame(tick); }; animation = requestAnimationFrame(tick); }
    const resize = new ResizeObserver(redraw); resize.observe(layer);
    for (const event of ["seeking", "seeked", "pause", "loadeddata"]) element.addEventListener(event, redraw);
    draw();
    return () => { stopped = true; resize.disconnect(); if (callback) element.cancelVideoFrameCallback(callback); if (animation) cancelAnimationFrame(animation); for (const event of ["seeking", "seeked", "pause", "loadeddata"]) element.removeEventListener(event, redraw); };
  }, [frames, focus, segment, boxes, item, analysis]);
  const advance = () => {
    if (!segment) return;
    const next = segments[segments.findIndex(row => row.id === segment.id) + 1];
    if (!next || Math.abs(next.started - segment.ended) > .15) { setError(next ? "Hay un corte entre estos tramos. La reproducción se detuvo." : "Fin de esta ventana de video."); return; }
    setSegment(next); setInitial(next.started); setFrames([]);
  };
  const review = async (decision: string) => {
    if (!item) return; setReviewing(true);
    try { await onReview(item.uid, decision); } catch (reason) { setError((reason as Error).message); } finally { setReviewing(false); }
  };
  const play = () => {
    const element = video.current;
    if (element && wantPlaying.current) void element.play().catch(() => { if (video.current === element && !element.error) { setNeedsPlay(true); setPaused(true); } });
  };
  return <section aria-label="Video del resultado" className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-accent/40 bg-[#08130f] text-text">
    <div className="flex shrink-0 items-start justify-between gap-2 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm text-accent">{item?.title ?? title ?? playback.camera} · grabación</p><p className="mt-1 text-[10px] text-text-faint">{historyTime(position)} · Honduras</p></div><button className={button} onClick={onClose}>Cerrar video</button></div>
    {error && <p role="status" className="shrink-0 px-3 pb-2 text-xs text-warning">{error}</p>}
    {!segment && !error && <div className="relative min-h-0 flex-1 bg-black"><VideoLoading label="Abriendo la grabación" /></div>}
    {segment && <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      <video key={segment.id} ref={video} src={segment.url} data-result-video data-segment={segment.id} data-started={segment.started} controls autoPlay={!paused} muted playsInline className="h-full w-full object-contain"
        onLoadedMetadata={() => { if (video.current) video.current.currentTime = Math.min(Math.max(0, initial - segment.started), Math.max(0, video.current.duration - .1)); }}
        onLoadStart={() => setBuffering(true)} onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)}
        onLoadedData={() => { setBuffering(false); play(); }} onPlaying={() => { setNeedsPlay(false); setBuffering(false); }}
        onPlay={() => { wantPlaying.current = true; setPaused(false); }}
        onPause={event => { if (event.currentTarget === video.current && !event.currentTarget.ended && event.currentTarget.readyState >= 2) { wantPlaying.current = false; setPaused(true); setBuffering(false); } }}
        onError={() => { loadFailure.current = "playback_blocked"; setBuffering(false); setError("No se pudo reproducir la grabación. Cerrá el video y volvé a abrirlo."); }}
        onTimeUpdate={() => setPosition(segment.started + (video.current?.currentTime ?? 0))} onEnded={advance} />
      <canvas ref={canvas} data-history-overlay aria-label="Cajas históricas" className="pointer-events-none absolute inset-0 h-full w-full" />
      <span ref={caption} className="pointer-events-none absolute bottom-12 left-2 rounded bg-black/75 px-2 py-1 font-mono text-[10px] text-white" />
      {buffering && !error && <VideoLoading label="Preparando la grabación" />}
    </div>}
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
      <button className={button} disabled={!segment || controlling} onClick={() => void manualControl({ operation: "seek", seconds: -10 })}>−10 s</button>
      <button className={button} disabled={!segment || controlling} onClick={() => void manualControl({ operation: paused || needsPlay ? "play" : "pause" })}>{paused || needsPlay ? "Reanudar" : "Pausar"}</button>
      <button className={`${button} ml-auto`} aria-pressed={boxes} onClick={() => onBoxes(!boxes)}>{boxes ? "Ocultar cajas" : "Mostrar cajas"}</button>
    </div>
    {item?.kind && <details className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-xs"><summary className="cursor-pointer text-text-faint">{item.kind === "uturn" ? "Posible vuelta en U" : "Posible cruce en rojo"} · {item.review === "confirmed" ? "Confirmada en revisión" : item.review === "dismissed" ? "Descartada en revisión" : "Pendiente de revisión"}</summary><div className="mt-2 flex flex-wrap gap-2"><button disabled={reviewing} className={button} onClick={() => void review("confirmed")}>Confirmar incidencia</button><button disabled={reviewing} className={button} onClick={() => void review("dismissed")}>Descartar</button><button disabled={reviewing} className={button} onClick={() => void review("candidate")}>Dejar pendiente</button>{item.clip_url && <a href={item.clip_url} download className={button}>Descargar evidencia</a>}</div></details>}
  </section>;
}
