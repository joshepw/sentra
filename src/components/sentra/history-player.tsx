"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { historyTime, type HistoryItem, type Playback, type ToolResult } from "@/lib/history-detections";
import { HistoryDetectionOverlay } from "./history-detection-overlay";
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
export type PlayerControl = { control: (command: MediaCommand) => Promise<void>; seekTo: (at: number) => Promise<void>; ready: () => Promise<void>; diagnostics: () => PlaybackDiagnostics };

export function HistoryPlayer({ playback, title, item, onClose, onExpired, boxes, onBoxes, controlRef }: {
  playback: Playback; title?: string; item?: HistoryItem; onClose: () => void; onExpired: () => void;
  boxes: boolean; onBoxes: (boxes: boolean) => void; controlRef: Ref<PlayerControl>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const firstVideo = useRef<HTMLVideoElement>(null), secondVideo = useRef<HTMLVideoElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]), [segment, setSegment] = useState<Segment | null>(null);
  const [error, setError] = useState("");
  const [mediaSlots, setMediaSlots] = useState<[Segment | null, Segment | null]>([null, null]);
  const slotRows = useRef<[Segment | null, Segment | null]>([null, null]), activeSlot = useRef(0);
  const activeRow = useRef<Segment | null>(null), archiveRows = useRef<Segment[]>([]);
  const holding = useRef(true), prepared = useRef<string | null>(null), pendingCommand = useRef<number | null>(null);
  const seekGoal = useRef<{ id: string; time: number; assigned: boolean } | null>(null);
  const internalPauses = useRef(new WeakSet<HTMLVideoElement>());
  const [analysis, setAnalysis] = useState(playback.run_id);
  const [position, setPosition] = useState(playback.at);
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
  const control = async (command: MediaCommand, absoluteAt?: number) => {
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
    if (absoluteAt === undefined && (!Number.isSafeInteger(command.seconds) || !command.seconds || Math.abs(command.seconds) > 31 * 86400)) throw new Error("unavailable_time");
    const currentAt = segment.started + (element.readyState ? element.currentTime : seekGoal.current?.time ?? 0);
    const target = absoluteAt ?? currentAt + command.seconds;
    if (!Number.isFinite(target) || Math.abs(target - currentAt) > 31 * 86400) throw new Error("unavailable_time");
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
  useImperativeHandle(controlRef, () => ({ control, seekTo: at => control({ operation: "seek", seconds: 0 }, at), ready, diagnostics }));
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
  const advance = () => {
    if (!segment) return;
    const next = segments[segments.findIndex(row => row.id === segment.id) + 1];
    if (!next || Math.abs(next.started - segment.ended) > .15) { setError(next ? "Hay un corte entre estos tramos. La reproducción se detuvo." : "Fin de esta ventana de video."); return; }
    selectSegment(next, next.started);
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
      {segment && <HistoryDetectionOverlay camera={playback.camera} segment={segment} runId={analysis}
        trackUid={analysis === playback.run_id ? playback.track_uid : undefined} item={item} video={video} enabled={boxes} onExpired={onExpired} />}
      {buffering && !error && <VideoLoading label={segment ? "Preparando la grabación" : "Abriendo la grabación"} />}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
      <button className={button} disabled={!segment || controlling} onClick={() => void manualControl({ operation: "seek", seconds: -10 })}>−10 s</button>
      <button className={button} disabled={!segment || controlling} onClick={() => void manualControl({ operation: paused || needsPlay ? "play" : "pause" })}>{paused || needsPlay ? "Reanudar" : "Pausar"}</button>
      <button className={`${button} ml-auto`} aria-pressed={boxes} onClick={() => onBoxes(!boxes)}>{boxes ? "Ocultar cajas" : "Mostrar cajas"}</button>
    </div>
  </section>;
}
