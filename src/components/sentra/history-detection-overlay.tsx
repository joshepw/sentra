"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { containedVideo, displayDetections } from "@/lib/live-detections";
import { historyFrameAt, type HistoryFrame, type HistoryIncident, type HistoryItem, type Playback } from "@/lib/history-detections";
import { incidentAt, indexIncidents } from "@/lib/incident-overlays";
import { drawDetection } from "./detection-drawing";

type Segment = { id: string; started: number; ended: number };
type Data = { key: string; frames: HistoryFrame[]; incidents: HistoryIncident[]; focus: { local_id: number; session: string } | null };

export function HistoryDetectionOverlay({ camera, segment, runId, trackUid, item, video, enabled, resolveRun = false, onExpired }: {
  camera: string; segment: Segment; runId?: string | null; trackUid?: string; item?: HistoryItem;
  video: RefObject<HTMLVideoElement | null>; enabled: boolean; resolveRun?: boolean; onExpired: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), caption = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<Data>({ key: "", frames: [], incidents: [], focus: null });
  const [error, setError] = useState("");
  const key = `${camera}:${segment.id}:${runId ?? ""}:${trackUid ?? ""}`;
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      try {
        let run = runId;
        if (!run && resolveRun) {
          const response = await fetch(`/edge/api/history/recording?${new URLSearchParams({ camera, at: String(segment.started + .001) })}`, { cache: "no-store", signal: abort.signal });
          if (response.status === 401) { onExpired(); return; }
          if (!response.ok) throw new Error("No se pudo consultar el análisis de este tramo.");
          const value: { playback?: Playback } = await response.json(); run = value.playback?.run_id;
        }
        if (!run) { if (!abort.signal.aborted) { setData({ key, frames: [], incidents: [], focus: null }); setError(""); } return; }
        const params = new URLSearchParams({ run_id: run, camera, start: String(segment.started), end: String(segment.ended) });
        if (trackUid) params.set("uid", trackUid);
        const response = await fetch(`/edge/api/history/frames?${params}`, { cache: "no-store", signal: abort.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudieron cargar las detecciones de este tramo.");
        const value: Omit<Data, "key"> = await response.json();
        if (!abort.signal.aborted) { setData({ ...value, frames: value.frames.map(displayDetections), key, incidents: value.incidents ?? [] }); setError(""); }
      } catch (reason) { if (!abort.signal.aborted) { setData({ key, frames: [], incidents: [], focus: null }); setError((reason as Error).message); } }
    };
    void load(); return () => abort.abort();
  }, [camera, segment.id, segment.started, segment.ended, runId, trackUid, resolveRun, key, item?.review, onExpired]);

  useEffect(() => {
    const element = video.current, layer = canvas.current, label = caption.current;
    if (!element || !layer || !label) return;
    const context = layer.getContext("2d"); if (!context) return;
    const incidents = indexIncidents(data.incidents, camera);
    let stopped = false, callback = 0, animation = 0;
    const draw = (mediaTime = element.currentTime) => {
      const rect = layer.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
      context.resetTransform(); context.clearRect(0, 0, layer.width, layer.height); context.scale(ratio, ratio);
      layer.dataset.boxes = "0"; layer.dataset.otherIncidents = "0"; layer.dataset.incidents = "0";
      if (!enabled || element.seeking || element.readyState < 2) { label.textContent = enabled ? "Sincronizando…" : "Cajas ocultas"; return; }
      const at = segment.started + mediaTime, frame = data.key === key ? historyFrameAt(data.frames, at) : null;
      if (!frame || frame.camera !== camera) { label.textContent = error || "Sin detecciones indexadas para este instante"; return; }
      const area = containedVideo(rect.width, rect.height, element.videoWidth, element.videoHeight);
      if (!area || frame.width !== element.videoWidth || frame.height !== element.videoHeight) { label.textContent = "Esperando el tamaño de video correcto…"; return; }
      context.font = "600 11px ui-monospace, monospace"; context.textBaseline = "top";
      const objects = frame.objects.map(object => {
        const selected = data.focus?.local_id === object.id && data.focus.session === frame.session;
        const incident = incidentAt(incidents, frame.session, object.id, at);
        return { object, selected, incident, order: selected ? 2 : incident ? 1 : 0 };
      }).sort((a, b) => a.order - b.order);
      for (const { object, selected, incident } of objects) drawDetection(context, area, object, incident, selected);
      const trajectory = item?.details?.trajectory;
      const inIncident = trajectory?.length && trajectory[0][0] <= segment.ended && trajectory[trajectory.length - 1][0] >= segment.started;
      const trail = inIncident ? trajectory?.filter(point => point[0] <= at) : undefined;
      if (trail && trail.length > 1) {
        context.strokeStyle = "#ffffff"; context.lineWidth = 2; context.beginPath();
        trail.forEach((point, index) => { const x = area.x + point[1] * area.width, y = area.y + point[2] * area.height; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
      }
      layer.dataset.boxes = String(objects.length); layer.dataset.observation = String(frame.captured_at); layer.dataset.time = String(at);
      layer.dataset.otherIncidents = String(objects.filter(row => row.incident && !row.selected).length);
      layer.dataset.incidents = String(objects.filter(row => row.incident).length);
      const light = ({ R: "rojo", A: "amarillo", G: "verde", "?": "no determinado" } as Record<string, string>)[frame.signal?.state ?? "?"];
      label.textContent = `${objects.length} objetos · semáforo ${light}`;
    };
    const redraw = () => draw();
    const onFrame: VideoFrameRequestCallback = (_now, value) => { draw(value.mediaTime); if (!stopped) callback = element.requestVideoFrameCallback(onFrame); };
    if (element.requestVideoFrameCallback) callback = element.requestVideoFrameCallback(onFrame);
    else { const tick = () => { draw(); if (!stopped) animation = requestAnimationFrame(tick); }; animation = requestAnimationFrame(tick); }
    const resize = new ResizeObserver(redraw); resize.observe(layer);
    const events = ["seeking", "seeked", "pause", "loadeddata"];
    events.forEach(event => element.addEventListener(event, redraw)); draw();
    return () => { stopped = true; resize.disconnect(); if (callback) element.cancelVideoFrameCallback(callback); if (animation) cancelAnimationFrame(animation); events.forEach(event => element.removeEventListener(event, redraw)); };
  }, [camera, data, key, error, enabled, item, segment, video]);
  return <>
    <canvas ref={canvas} data-history-overlay aria-label="Cajas históricas" className="pointer-events-none absolute inset-0 h-full w-full" />
    <span ref={caption} className="pointer-events-none absolute bottom-12 left-2 rounded bg-black/75 px-2 py-1 font-mono text-[10px] text-white" />
  </>;
}
