"use client";

import { useEffect, useRef, useState } from "react";
import { containedVideo } from "@/lib/live-detections";
import { COLOR, TYPE } from "@/lib/edge-replay";
import { historyFrameAt, historyTime, type HistoryFrame, type HistoryItem, type Playback } from "@/lib/history-detections";

type Segment = { id: string; started: number; ended: number; url: string; state: string };
const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:border-accent disabled:opacity-40";

export function HistoryPlayer({ playback, item, onClose, onExpired, onReview }: {
  playback: Playback; item?: HistoryItem; onClose: () => void; onExpired: () => void;
  onReview: (uid: string, decision: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), caption = useRef<HTMLSpanElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]), [segment, setSegment] = useState<Segment | null>(null);
  const [initial, setInitial] = useState(playback.at - 4), [error, setError] = useState("");
  const [frames, setFrames] = useState<HistoryFrame[]>([]), [focus, setFocus] = useState<{ local_id: number; session: string } | null>(null);
  const [boxes, setBoxes] = useState(true), [position, setPosition] = useState(playback.at), [reviewing, setReviewing] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      try {
        const trajectoryStart = item?.details?.trajectory?.[0]?.[0];
        const lead = item?.kind === "uturn" ? Math.max(playback.at - 60, Math.min(playback.at - 12, (trajectoryStart ?? playback.at) - 1)) : playback.at - 4;
        const params = new URLSearchParams({ camera: playback.camera, start: String(playback.at - 70), end: String(playback.at + 120) });
        const response = await fetch(`/edge/api/live/archive?${params}`, { cache: "no-store", signal: abort.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudo abrir la grabación.");
        const data: { segments: Segment[] } = await response.json();
        const row = data.segments.find(s => s.started <= lead && s.ended > lead)
          ?? data.segments.find(s => s.started <= playback.at && s.ended > playback.at);
        if (!row) throw new Error("No hay video guardado para este instante.");
        if (!abort.signal.aborted) { setSegments(data.segments); setSegment(row); setInitial(Math.max(row.started, lead)); }
      } catch (reason) { if (!abort.signal.aborted) setError((reason as Error).message); }
    };
    void load(); return () => abort.abort();
  }, [playback, item?.kind, item?.details?.trajectory, onExpired]);
  useEffect(() => {
    if (!segment) return;
    const abort = new AbortController();
    const load = async () => {
      try {
        const params = new URLSearchParams({ run_id: playback.run_id, camera: playback.camera, start: String(segment.started), end: String(segment.ended) });
        if (playback.track_uid) params.set("uid", playback.track_uid);
        const response = await fetch(`/edge/api/history/frames?${params}`, { cache: "no-store", signal: abort.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudieron cargar las cajas de este tramo.");
        const data: { frames: HistoryFrame[]; focus: typeof focus } = await response.json();
        if (!abort.signal.aborted) { setFrames(data.frames); setFocus(data.focus); }
      } catch (reason) { if (!abort.signal.aborted) setError((reason as Error).message); }
    };
    void load(); return () => abort.abort();
  }, [segment, playback, onExpired]);
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
      const at = segment.started + mediaTime, frame = historyFrameAt(frames, at);
      if (!frame) { label.textContent = "Sin detecciones indexadas para este instante"; return; }
      const area = containedVideo(rect.width, rect.height, element.videoWidth, element.videoHeight);
      if (!area || frame.width !== element.videoWidth || frame.height !== element.videoHeight) return;
      context.font = "600 11px ui-monospace, monospace"; context.textBaseline = "top";
      for (const object of frame.objects) {
        const selected = focus?.local_id === object.id && focus.session === frame.session;
        const [x1, y1, x2, y2] = object.box, x = area.x + x1 * area.width, y = area.y + y1 * area.height;
        context.strokeStyle = selected ? "#ffdb68" : "#57f1aa"; context.lineWidth = selected ? 3 : 1.5;
        context.strokeRect(x, y, (x2 - x1) * area.width, (y2 - y1) * area.height);
        const attrs = object.attributes, name = attrs ? `${TYPE[attrs.type] ?? attrs.type} · ${COLOR[attrs.color] ?? attrs.color}` : object.label;
        const text = `${name} #${object.id}`; const labelY = Math.max(area.y, y - 18);
        context.fillStyle = "#00150deb"; context.fillRect(x, labelY, context.measureText(text).width + 8, 17);
        context.fillStyle = selected ? "#ffdb68" : "#a8fbd0"; context.fillText(text, x + 4, labelY + 2);
      }
      const band = item?.details?.stop_band;
      if (band?.length === 4) {
        context.strokeStyle = "#ffbd59"; context.setLineDash([5, 4]);
        context.strokeRect(area.x + band[0] / 1280 * area.width, area.y + band[1] / 720 * area.height, (band[2] - band[0]) / 1280 * area.width, (band[3] - band[1]) / 720 * area.height);
        context.setLineDash([]);
      }
      const trail = item?.details?.trajectory?.filter(p => p[0] <= at);
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
  }, [frames, focus, segment, boxes, item]);
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
    if (element) void element.play().catch(() => { if (video.current === element && !element.error) setNeedsPlay(true); });
  };
  return <dialog ref={dialog} aria-label="Video del resultado" onCancel={event => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh_-_1.5rem)] w-[calc(100%_-_1.5rem)] max-w-5xl overflow-y-auto overscroll-contain rounded-xl border border-accent/40 bg-[#08130f] p-0 text-text shadow-2xl backdrop:bg-black/75">
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-[#08130f] p-3"><div><p className="text-sm text-accent">{item?.title ?? playback.camera} · grabación</p><p className="mt-1 text-xs text-text-faint">{historyTime(position)} · Honduras · hora de recepción</p></div><div className="flex gap-2"><button className={button} aria-pressed={boxes} onClick={() => setBoxes(!boxes)}>{boxes ? "Ocultar cajas" : "Mostrar cajas"}</button><button ref={closeButton} className={button} onClick={onClose}>Cerrar video</button></div></div>
    <div className="p-3 pt-0">
    {error && <p role="status" className="mb-3 text-sm text-warning">{error}</p>}
    {!segment && !error && <p role="status" className="p-8 text-sm text-text-faint">Abriendo video…</p>}
    {segment && <div className="relative overflow-hidden rounded-lg bg-black">
      <video key={segment.id} ref={video} src={segment.url} data-result-video controls autoPlay muted playsInline className="max-h-[60dvh] w-full"
        onLoadedMetadata={() => { if (video.current) video.current.currentTime = Math.min(Math.max(0, initial - segment.started), Math.max(0, video.current.duration - .1)); }}
        onLoadedData={play} onPlaying={() => setNeedsPlay(false)}
        onError={() => setError("No se pudo reproducir la grabación. Cerrá el video y volvé a abrirlo.")}
        onTimeUpdate={() => setPosition(segment.started + (video.current?.currentTime ?? 0))} onEnded={advance} />
      <canvas ref={canvas} data-history-overlay aria-label="Cajas históricas" className="pointer-events-none absolute inset-0 h-full w-full" />
      <span ref={caption} className="pointer-events-none absolute bottom-12 left-2 rounded bg-black/75 px-2 py-1 font-mono text-[10px] text-white" />
    </div>}
    {needsPlay && !error && <button className={`${button} mt-3 text-accent`} onClick={play}>Reproducir video</button>}
    {item?.kind && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="mr-auto text-text-faint">{item.kind === "uturn" ? "Posible vuelta en U" : "Posible cruce en rojo"} · {item.review === "confirmed" ? "Confirmada en revisión" : item.review === "dismissed" ? "Descartada en revisión" : "Pendiente de revisión"}</span><button disabled={reviewing} className={button} onClick={() => void review("confirmed")}>Confirmar incidencia</button><button disabled={reviewing} className={button} onClick={() => void review("dismissed")}>Descartar</button><button disabled={reviewing} className={button} onClick={() => void review("candidate")}>Dejar pendiente</button>{item.clip_url && <a href={item.clip_url} download className={button}>Descargar evidencia</a>}</div>}
    </div>
  </dialog>;
}
