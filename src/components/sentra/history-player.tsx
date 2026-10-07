"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { containedVideo } from "@/lib/live-detections";
import { vehicleName } from "@/lib/edge-replay";
import { historyFrameAt, historyTime, type HistoryFrame, type HistoryIncident, type HistoryItem, type Playback, type ToolResult } from "@/lib/history-detections";
import type { MediaCommand, PlaybackDiagnostics } from "@/lib/viewer-actions";
import { VideoLoading } from "@/components/sentra/assistant-feedback";
import { HISTORY_PREFETCH_SECONDS, historyBufferReady } from "@/lib/history-playback";

type Segment = { id: string; started: number; ended: number; url: string; state: string };
const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:border-accent disabled:opacity-40";
const MEDIA_WAIT_MS = 45000;
function followingSegment(rows: Segment[], row: Segment) {
  const next = rows[rows.findIndex(candidate => candidate.id === row.id) + 1];
  return next && Math.abs(next.started - row.ended) <= .15 ? next : undefined;
}
export type PlayerControl = { control: (command: MediaCommand) => Promise<void>; ready: () => Promise<void>; diagnostics: () => PlaybackDiagnostics };

export function HistoryPlayer({ playback, title, item, onClose, onExpired, onReview, boxes, onBoxes, controlRef }: {
  playback: Playback; title?: string; item?: HistoryItem; onClose: () => void; onExpired: () => void;
  onReview: (uid: string, decision: string) => Promise<void>;
  boxes: boolean; onBoxes: (boxes: boolean) => void; controlRef: Ref<PlayerControl>;
}) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), caption = useRef<HTMLSpanElement>(null);
  const firstVideo = useRef<HTMLVideoElement>(null), secondVideo = useRef<HTMLVideoElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]), [segment, setSegment] = useState<Segment | null>(null);
  const [error, setError] = useState("");
  const [mediaSlots, setMediaSlots] = useState<[Segment | null, Segment | null]>([null, null]);
  const slotRows = useRef<[Segment | null, Segment | null]>([null, null]), activeSlot = useRef(0);
  const activeRow = useRef<Segment | null>(null), archiveRows = useRef<Segment[]>([]);
  const holding = useRef(true), prepared = useRef<string | null>(null), pendingCommand = useRef<number | null>(null);
  const seekGoal = useRef<{ id: string; time: number; assigned: boolean } | null>(null);
  const internalPauses = useRef(new WeakSet<HTMLVideoElement>());
  const [frames, setFrames] = useState<HistoryFrame[]>([]), [focus, setFocus] = useState<{ local_id: number; session: string } | null>(null);
  const [incidents, setIncidents] = useState<HistoryIncident[]>([]);
  const [analysis, setAnalysis] = useState(playback.run_id);
  const [position, setPosition] = useState(playback.at), [reviewing, setReviewing] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [paused, setPaused] = useState(false), [controlling, setControlling] = useState(false);
  const wantPlaying = useRef(true), commandId = useRef(0);
  const loadFailure = useRef<string | null>(null);
  const loadedPlayback = useRef<Playback | null>(null);
  const seekAbort = useRef<AbortController | null>(null);
  const trace = useRef<Partial<PlaybackDiagnostics>>({ stage: "loading" }), began = useRef(0);
  const holdVideo = useCallback((element: HTMLVideoElement) => {
    if (!element.paused) { internalPauses.current.add(element); element.pause(); }
  }, []);
  const resume = useCallback((element: HTMLVideoElement) => {
    if (!wantPlaying.current || !element.paused) return;
    void element.play().catch(reason => {
      if (video.current === element && !element.error && reason?.name !== "AbortError") {
        wantPlaying.current = false; setNeedsPlay(true); setPaused(true);
      }
    });
  }, []);
  const pump = useCallback(() => {
    const element = video.current, row = activeRow.current;
    if (!element || !row || element.dataset.segment !== row.id || element.error) return;
    const goal = seekGoal.current;
    if (goal && !goal.assigned && element.readyState >= 1) {
      goal.assigned = true;
      const at = Math.min(Math.max(0, goal.time), Math.max(0, element.duration - .01));
      if (Math.abs(element.currentTime - at) > .005) element.currentTime = at;
    }
    const next = followingSegment(archiveRows.current, row);
    const remaining = row.ended - row.started - (goal?.time ?? element.currentTime);
    // Only one following recording; start early enough to cross minute boundaries.
    if (wantPlaying.current && next && remaining <= HISTORY_PREFETCH_SECONDS) {
      const spare = 1 - activeSlot.current;
      if (slotRows.current[spare]?.id !== next.id) {
        const updated: [Segment | null, Segment | null] = [...slotRows.current]; updated[spare] = next;
        slotRows.current = updated; setMediaSlots(updated);
      }
    }
    if (element.readyState < 2 || element.seeking || (goal && (!goal.assigned || Math.abs(element.currentTime - goal.time) > .1))) return;
    if (!holding.current) { prepared.current = row.id; return; }
    const nextElement = next && slotRows.current[1 - activeSlot.current]?.id === next.id
      ? (activeSlot.current ? firstVideo.current : secondVideo.current) : null;
    if (wantPlaying.current && !historyBufferReady(element, next ? nextElement : undefined)) { holdVideo(element); return; }
    prepared.current = row.id; setBuffering(false);
    // Confirm the exact seek before releasing playback, including targets 0.18 s from the end.
    if (pendingCommand.current !== null) return;
    holding.current = false; seekGoal.current = null; resume(element);
  }, [holdVideo, resume]);
  const selectSegment = useCallback((row: Segment, at: number, rows = archiveRows.current) => {
    archiveRows.current = rows;
    const existing = slotRows.current.findIndex(candidate => candidate?.id === row.id);
    const index = existing < 0 ? activeSlot.current : existing;
    const changed = activeRow.current?.id !== row.id;
    const slots: [Segment | null, Segment | null] = changed ? [null, null] : [...slotRows.current];
    slots[index] = row; slotRows.current = slots; activeSlot.current = index; activeRow.current = row;
    const element = index === 0 ? firstVideo.current : secondVideo.current;
    video.current = element; holding.current = true; prepared.current = null;
    if (changed) {
      const spare = index === 0 ? secondVideo.current : firstVideo.current;
      if (spare?.hasAttribute("src")) { holdVideo(spare); spare.removeAttribute("src"); spare.load(); }
    }
    seekGoal.current = { id: row.id, time: Math.max(0, at - row.started), assigned: false };
    if (element) holdVideo(element);
    const reusable = element?.dataset.segment === row.id && Math.abs(element.currentTime - (at - row.started)) < .005
      && historyBufferReady(element, followingSegment(rows, row) ? null : undefined);
    setBuffering(!reusable); setMediaSlots(slots); setSegment(row);
    if (element?.dataset.segment === row.id && element.error) {
      trace.current.failure = "media_error"; loadFailure.current = "playback_blocked"; setBuffering(false);
      setError("No se pudo reproducir la grabación. Cerrá el video y volvé a abrirlo.");
    }
    pump();
  }, [holdVideo, pump]);
  const cancelCommands = useCallback(() => { commandId.current++; seekAbort.current?.abort(); }, []);
  useEffect(() => {
    const first = firstVideo.current, second = secondVideo.current;
    const timer = setInterval(pump, 80);
    return () => {
      clearInterval(timer); cancelCommands();
      for (const element of [first, second]) if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
    };
  }, [pump, cancelCommands]);
  const begin = (stage: PlaybackDiagnostics["stage"], target?: number) => {
    began.current = performance.now(); trace.current = { stage, ...(target === undefined ? {} : { target_at: target }) };
  };
  const diagnostics = (): PlaybackDiagnostics => {
    const element = video.current;
    return { camera: playback.camera, stage: "loading", ...trace.current,
      elapsed_ms: Math.min(300000, Math.max(0, Math.round(performance.now() - began.current))),
      ...(element ? { segment_id: element.dataset.segment, current_time: element.currentTime,
        at: Number(element.dataset.started) + element.currentTime, ready_state: element.readyState,
        network_state: element.networkState, media_error: element.error?.code ?? 0, paused: element.paused, seeking: element.seeking,
        ...(Number.isFinite(element.duration) ? { duration: element.duration } : {}),
      } : {}),
    };
  };
  function fail(code: string, failure: PlaybackDiagnostics["failure"]): never {
    trace.current.failure = failure; throw new Error(code);
  }
  const control = async (command: MediaCommand) => {
    begin(command.operation === "seek" ? "lookup" : command.operation);
    const element = video.current;
    if (!element || !segment) return fail("no_video", "no_video");
    const id = ++commandId.current;
    seekAbort.current?.abort();
    if (command.operation === "pause") { wantPlaying.current = false; element.pause(); setPaused(true); pump(); return; }
    if (command.operation === "play") {
      wantPlaying.current = true; setPaused(false); holding.current = true; prepared.current = null; pendingCommand.current = id;
      try {
        const deadline = Date.now() + MEDIA_WAIT_MS;
        while (prepared.current !== segment.id && Date.now() < deadline) {
          if (id !== commandId.current || !video.current) fail("no_video", "cancelled");
          if (element.error) fail("playback_blocked", "media_error");
          pump(); await new Promise(resolve => setTimeout(resolve, 40));
        }
        if (prepared.current !== segment.id) fail("playback_timeout", "load_timeout");
        try { await element.play(); }
        catch { fail("playback_blocked", "autoplay_denied"); }
      } finally { if (pendingCommand.current === id) { pendingCommand.current = null; pump(); } }
      return;
    }
    if (!Number.isSafeInteger(command.seconds) || !command.seconds || Math.abs(command.seconds) > 31 * 86400) throw new Error("unavailable_time");
    const target = segment.started + (element.readyState ? element.currentTime : seekGoal.current?.time ?? 0) + command.seconds;
    trace.current.target_at = target;
    const playing = wantPlaying.current;
    let destinationRows = segments;
    let row = segments.find(candidate => candidate.started <= target && target < candidate.ended);
    if (!row) {
      const abort = new AbortController(); seekAbort.current = abort;
      const timeout = setTimeout(() => abort.abort(), 10000);
      try {
        const params = new URLSearchParams({ camera: playback.camera, at: String(target) });
        const response = await fetch(`/edge/api/history/recording?${params}`, { cache: "no-store", signal: abort.signal });
        trace.current.http_status = response.status;
        if (response.status === 401) { onExpired(); fail("no_video", "http_error"); }
        if (!response.ok) fail("playback_blocked", "http_error");
        const resolved: ToolResult = await response.json(), destination = resolved.playback;
        if (!resolved.available || !destination || destination.camera !== playback.camera
          || Math.abs(destination.at - target) > .00001 || !destination.segment_id) fail("unavailable_time", "unavailable_time");
        trace.current.stage = "archive";
        const window = new URLSearchParams({ camera: playback.camera, start: String(target - 70), end: String(target + 120) });
        const archive = await fetch(`/edge/api/live/archive?${window}`, { cache: "no-store", signal: abort.signal });
        trace.current.http_status = archive.status;
        if (archive.status === 401) { onExpired(); fail("no_video", "http_error"); }
        if (!archive.ok) fail("playback_blocked", "http_error");
        const data: { segments: Segment[] } = await archive.json();
        row = data.segments.find(candidate => candidate.id === destination.segment_id && candidate.started <= target && target < candidate.ended);
        if (!row) fail("unavailable_time", "unavailable_time");
        if (id !== commandId.current || abort.signal.aborted || !video.current) throw new Error("no_video");
        destinationRows = data.segments; setSegments(data.segments); setAnalysis(destination.run_id);
      } catch (reason) {
        if (abort.signal.aborted) fail(id !== commandId.current ? "no_video" : "playback_timeout", id !== commandId.current ? "cancelled" : "request_timeout");
        trace.current.failure ||= "network_error";
        throw reason;
      } finally { clearTimeout(timeout); }
    }
    wantPlaying.current = playing; setPaused(!playing);
    setError("");
    loadFailure.current = null; trace.current.stage = row.id === segment.id ? "seeking" : "loading";
    if (row.id !== segment.id) { setFrames([]); setFocus(null); }
    pendingCommand.current = id; selectSegment(row, target, destinationRows);
    try {
      const deadline = Date.now() + MEDIA_WAIT_MS;
      while (Date.now() < deadline) {
        if (id !== commandId.current || !video.current) fail("no_video", "cancelled");
        const active = video.current;
        if (prepared.current === row.id && active.readyState >= 2 && !active.seeking && Math.abs(active.currentTime - (target - row.started)) < .6) { trace.current.stage = "ready"; return; }
        if (active.error) fail("playback_blocked", "media_error");
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      fail("playback_timeout", video.current?.readyState ? "seek_timeout" : "load_timeout");
    } finally { if (pendingCommand.current === id) { pendingCommand.current = null; pump(); } }
  };
  const ready = async () => {
    const id = commandId.current, deadline = Date.now() + MEDIA_WAIT_MS;
    pendingCommand.current = id;
    try { while (Date.now() < deadline) {
      if (id !== commandId.current) fail("no_video", "cancelled");
      if (loadedPlayback.current !== playback) { await new Promise(resolve => setTimeout(resolve, 40)); continue; }
      if (loadFailure.current) throw new Error(loadFailure.current);
      const element = video.current;
      if (element?.error) fail("playback_blocked", "media_error");
      if (element && prepared.current === element.dataset.segment && element.readyState >= 2 && !element.seeking
        && (playback.source !== "camera_time" || element.dataset.segment === playback.segment_id)
        && Math.abs(Number(element.dataset.started) + element.currentTime - playback.at) < .6) { trace.current.stage = "ready"; return; }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    fail("playback_timeout", video.current?.readyState ? "seek_timeout" : "load_timeout");
    } finally { if (pendingCommand.current === id) { pendingCommand.current = null; pump(); } }
  };
  useImperativeHandle(controlRef, () => ({ control, ready, diagnostics }));
  const manualControl = async (command: MediaCommand) => {
    setControlling(true);
    try { await control(command); }
    catch (reason) { setError((reason as Error).message === "unavailable_time" ? "No hay grabación disponible para ese instante." : (reason as Error).message === "playback_timeout" ? "La grabación está tardando demasiado en cargar. Volvé a intentar cuando termine de cargar." : "No se pudo completar el control del video."); }
    finally { setControlling(false); }
  };
  useEffect(() => {
    const abort = new AbortController();
    begin("archive", playback.at);
    loadFailure.current = null;
    const load = async () => {
      try {
        const trajectoryStart = item?.details?.trajectory?.[0]?.[0];
        const lead = playback.source === "camera_time" ? playback.at
          : item?.kind === "uturn" ? Math.max(playback.at - 60, Math.min(playback.at - 12, (trajectoryStart ?? playback.at) - 1)) : playback.at - 4;
        const params = new URLSearchParams({ camera: playback.camera, start: String(playback.at - 70), end: String(playback.at + 120) });
        const response = await fetch(`/edge/api/live/archive?${params}`, { cache: "no-store", signal: abort.signal });
        trace.current.http_status = response.status;
        if (response.status === 401) { trace.current.failure = "http_error"; onExpired(); return; }
        if (!response.ok) { trace.current.failure = "http_error"; throw new Error("No se pudo abrir la grabación."); }
        const data: { segments: Segment[] } = await response.json();
        const row = playback.source === "camera_time"
          ? data.segments.find(s => s.id === playback.segment_id && s.started <= playback.at && s.ended > playback.at)
          : data.segments.find(s => s.started <= lead && s.ended > lead)
            ?? data.segments.find(s => s.started <= playback.at && s.ended > playback.at);
        if (!row) { trace.current.failure = "unavailable_time"; loadFailure.current = "unavailable_time"; throw new Error("No hay video guardado para este instante."); }
        if (!abort.signal.aborted) {
          setError("");
          trace.current.stage = "loading";
          setSegments(data.segments); setAnalysis(playback.run_id);
          if (playback.source === "camera_time") {
            wantPlaying.current = true; setPaused(false);
          }
          selectSegment(row, Math.max(row.started, lead), data.segments);
          loadedPlayback.current = playback;
        }
      } catch (reason) { if (!abort.signal.aborted) { trace.current.failure ||= "network_error"; loadFailure.current ||= "playback_blocked"; loadedPlayback.current = playback; setError((reason as Error).message); } }
    };
    void load(); return () => abort.abort();
  }, [playback, item?.kind, item?.details?.trajectory, onExpired, selectSegment]);
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
        const data: { frames: HistoryFrame[]; focus: typeof focus; incidents?: HistoryIncident[] } = await response.json();
        if (!abort.signal.aborted) { setFrames(data.frames); setFocus(data.focus); setIncidents(data.incidents ?? []); }
      } catch (reason) { if (!abort.signal.aborted) setError((reason as Error).message); }
    };
    void load(); return () => abort.abort();
  }, [segment, playback, analysis, item?.review, onExpired]);
  useEffect(() => {
    const element = video.current, layer = canvas.current, label = caption.current;
    if (!element || !layer || !label || !segment) return;
    const context = layer.getContext("2d"); if (!context) return;
    const incidentTracks = new Map<string, HistoryIncident>();
    if (item?.kind) for (const incident of incidents) {
      if (incident.camera === playback.camera && ["candidate", "confirmed"].includes(incident.review)) {
        incidentTracks.set(`${incident.session}:${incident.local_id}`, incident);
      }
    }
    let stopped = false, callback = 0, animation = 0;
    const draw = (mediaTime = element.currentTime) => {
      const rect = layer.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
      context.resetTransform(); context.clearRect(0, 0, layer.width, layer.height); context.scale(ratio, ratio);
      layer.dataset.boxes = "0";
      layer.dataset.otherIncidents = "0";
      if (!boxes || element.seeking || element.readyState < 2) { label.textContent = boxes ? "Sincronizando…" : "Cajas ocultas"; return; }
      const at = segment.started + mediaTime, frame = analysis ? historyFrameAt(frames, at) : null;
      if (!frame) { label.textContent = "Sin detecciones indexadas para este instante"; return; }
      const area = containedVideo(rect.width, rect.height, element.videoWidth, element.videoHeight);
      if (!area || frame.width !== element.videoWidth || frame.height !== element.videoHeight) return;
      context.font = "600 11px ui-monospace, monospace"; context.textBaseline = "top";
      const objects = frame.objects.map(object => {
        const selected = focus?.local_id === object.id && focus.session === frame.session;
        const incident = incidentTracks.get(`${frame.session}:${object.id}`);
        return { object, selected, incident, order: selected ? 2 : incident ? 1 : 0 };
      }).sort((left, right) => left.order - right.order);
      for (const { object, selected, incident } of objects) {
        const [x1, y1, x2, y2] = object.box, x = area.x + x1 * area.width, y = area.y + y1 * area.height;
        const otherIncident = !selected && incident;
        const color = selected ? "#ffdb68" : otherIncident ? "#ff9b42" : "#57f1aa";
        context.strokeStyle = color; context.lineWidth = selected ? 3 : otherIncident ? 2.5 : 1.5;
        context.setLineDash(otherIncident ? [6, 4] : []);
        context.strokeRect(x, y, (x2 - x1) * area.width, (y2 - y1) * area.height);
        context.setLineDash([]);
        const attrs = object.attributes, name = attrs ? vehicleName(attrs.type, attrs.color, object.class_id) : object.label;
        const text = `${name} #${object.id}${selected && item?.kind ? " · seleccionada" : ""}`;
        const detail = otherIncident ? `${incident.review === "confirmed" ? "Confirmada" : "Posible"}: ${incident.kind === "uturn" ? "vuelta en U" : "cruce en rojo"}` : "";
        const labelHeight = detail ? 32 : 17, labelY = Math.max(area.y, y - labelHeight - 1);
        const labelWidth = Math.min(area.width, Math.max(context.measureText(text).width, context.measureText(detail).width) + 8);
        const labelX = Math.max(area.x, Math.min(x, area.x + area.width - labelWidth));
        context.fillStyle = "#00150deb"; context.fillRect(labelX, labelY, labelWidth, labelHeight);
        context.fillStyle = selected || otherIncident ? color : "#a8fbd0";
        context.fillText(text, labelX + 4, labelY + 2, labelWidth - 8);
        if (detail) context.fillText(detail, labelX + 4, labelY + 17, labelWidth - 8);
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
      layer.dataset.otherIncidents = String(objects.filter(object => object.incident && !object.selected).length);
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
  }, [frames, focus, incidents, segment, boxes, item, analysis, playback.camera]);
  const advance = () => {
    if (!segment) return;
    const next = segments[segments.findIndex(row => row.id === segment.id) + 1];
    if (!next || Math.abs(next.started - segment.ended) > .15) { setError(next ? "Hay un corte entre estos tramos. La reproducción se detuvo." : "Fin de esta ventana de video."); return; }
    selectSegment(next, next.started); setFrames([]);
  };
  const review = async (decision: string) => {
    if (!item) return; setReviewing(true);
    try { await onReview(item.uid, decision); } catch (reason) { setError((reason as Error).message); } finally { setReviewing(false); }
  };
  return <section aria-label="Video del resultado" className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-accent/40 bg-[#08130f] text-text">
    <div className="flex shrink-0 items-start justify-between gap-2 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm text-accent">{item?.title ?? title ?? playback.camera} · grabación</p><p className="mt-1 text-[10px] text-text-faint">{historyTime(position)} · Honduras</p></div><button className={button} onClick={onClose}>Cerrar video</button></div>
    {error && <p role="status" className="shrink-0 px-3 pb-2 text-xs text-warning">{error}</p>}
    <div className="relative min-h-40 flex-1 overflow-hidden bg-black [@media(max-height:500px)]:h-40 [@media(max-height:500px)]:flex-none">
      {mediaSlots.map((row, index) => {
        const active = !!row && row.id === segment?.id;
        return <video key={index} ref={index === 0 ? firstVideo : secondVideo} src={row?.url} preload="auto"
          data-result-video={active || undefined} data-next-video={!active && !!row || undefined} data-segment={row?.id} data-started={row?.started}
          controls={active} muted playsInline aria-hidden={!active} tabIndex={active ? 0 : -1}
          className={active ? "h-full w-full object-contain" : "pointer-events-none absolute inset-0 h-full w-full opacity-0"}
          onLoadedMetadata={pump} onLoadedData={pump} onProgress={pump} onCanPlay={pump} onSeeked={pump}
          onWaiting={() => { if (active) { holding.current = true; prepared.current = null; if (pendingCommand.current === null) seekGoal.current = null; if (video.current) holdVideo(video.current); setBuffering(true); pump(); } }}
          onSeeking={() => { if (active) { holding.current = true; prepared.current = null; if (video.current) holdVideo(video.current); setBuffering(true); pump(); } }}
          onPlaying={() => { if (active) setNeedsPlay(false); }}
          onPlay={() => { if (active) { if (!wantPlaying.current) { holding.current = true; prepared.current = null; setBuffering(true); } wantPlaying.current = true; setPaused(false); pump(); } }}
          onPause={event => {
            if (internalPauses.current.delete(event.currentTarget)) return;
            if (active && !event.currentTarget.ended && event.currentTarget.readyState >= 2) { wantPlaying.current = false; setPaused(true); pump(); }
          }}
          onError={() => { if (active && row) { trace.current.failure = "media_error"; loadFailure.current = "playback_blocked"; setBuffering(false); setError("No se pudo reproducir la grabación. Cerrá el video y volvé a abrirlo."); } else pump(); }}
          onTimeUpdate={event => { if (active && row) { setPosition(row.started + event.currentTarget.currentTime); pump(); } }}
          onEnded={() => { if (active) advance(); }} />;
      })}
      <canvas ref={canvas} data-history-overlay aria-label="Cajas históricas" className="pointer-events-none absolute inset-0 h-full w-full" />
      <span ref={caption} className="pointer-events-none absolute bottom-12 left-2 rounded bg-black/75 px-2 py-1 font-mono text-[10px] text-white" />
      {buffering && !error && <VideoLoading label={segment ? "Preparando la grabación" : "Abriendo la grabación"} />}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
      <button className={button} disabled={!segment || controlling} onClick={() => void manualControl({ operation: "seek", seconds: -10 })}>−10 s</button>
      <button className={button} disabled={!segment || controlling} onClick={() => void manualControl({ operation: paused || needsPlay ? "play" : "pause" })}>{paused || needsPlay ? "Reanudar" : "Pausar"}</button>
      <button className={`${button} ml-auto`} aria-pressed={boxes} onClick={() => onBoxes(!boxes)}>{boxes ? "Ocultar cajas" : "Mostrar cajas"}</button>
    </div>
    {item?.kind && boxes && <p aria-label="Leyenda de incidencias" className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-[10px] text-text-faint">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm border-2 border-[#ffdb68]" />Seleccionada</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm border-2 border-dashed border-[#ff9b42]" />Otras incidencias detectadas</span>
    </p>}
    {item?.kind && <details className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-xs"><summary className="cursor-pointer text-text-faint">{item.kind === "uturn" ? "Posible vuelta en U" : "Posible cruce en rojo"} · {item.review === "confirmed" ? "Confirmada en revisión" : item.review === "dismissed" ? "Descartada en revisión" : "Pendiente de revisión"}</summary><div className="mt-2 flex flex-wrap gap-2"><button disabled={reviewing} className={button} onClick={() => void review("confirmed")}>Confirmar incidencia</button><button disabled={reviewing} className={button} onClick={() => void review("dismissed")}>Descartar</button><button disabled={reviewing} className={button} onClick={() => void review("candidate")}>Dejar pendiente</button>{item.clip_url && <a href={item.clip_url} download className={button}>Descargar evidencia</a>}</div></details>}
  </section>;
}
