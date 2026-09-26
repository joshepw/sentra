"use client";

import { useEffect, useRef, type RefObject } from "react";
import { containedVideo, DetectionBuffer, fragmentPosition, type VideoFragment } from "@/lib/live-detections";

export type DetectionStatus = { status: string; stale?: boolean; fps_observed?: number; region_revision?: number };

type Props = {
  camera: string;
  enabled: boolean;
  receiving: boolean;
  filter: "all" | "vehicles" | "people";
  video: RefObject<HTMLVideoElement | null>;
  fragments: RefObject<VideoFragment[]>;
};

export function LiveDetectionOverlay({ camera, enabled, receiving, filter, video, fragments }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const caption = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = video.current, layer = canvas.current, label = caption.current;
    if (!element || !layer || !label) return;
    const context = layer.getContext("2d");
    if (!context) return;
    const buffer = new DetectionBuffer();
    let closed = false, frameCallback = 0, animation = 0;
    let lastMediaTime = element.currentTime;
    let lastMessage = 0, connected = false;
    let worker: DetectionStatus | null = null;
    const status = (text: string) => { if (label.textContent !== text) label.textContent = text; };
    const clear = () => {
      // Clear backing-store pixels, including at zoom-out / pixel ratios < 1.
      context.save();
      context.resetTransform();
      context.clearRect(0, 0, layer.width, layer.height);
      context.restore();
      layer.dataset.boxes = "0";
      delete layer.dataset.segment;
      delete layer.dataset.offset;
    };
    const draw = (mediaTime = lastMediaTime) => {
      if (closed) return;
      lastMediaTime = mediaTime;
      const rect = layer.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      clear();
      if (!enabled) { status("Cajas ocultas"); return; }
      if (!receiving) { status("Esperando señal"); return; }
      if (!connected || Date.now() - lastMessage > 12000) { status("Conectando detecciones…"); return; }
      if (element.seeking || element.readyState < 2) { status("Sincronizando…"); return; }
      const position = fragmentPosition(fragments.current, mediaTime);
      if (!position) { status("Esperando sincronización del video…"); return; }
      const frame = buffer.at(position.segment, position.offset);
      if (!frame) { status(worker?.status === "running" ? "Sin análisis para este momento" : "Esperando análisis…"); return; }
      const area = containedVideo(rect.width, rect.height, element.videoWidth, element.videoHeight);
      if (!area || frame.width !== element.videoWidth || frame.height !== element.videoHeight) {
        status("Esperando el tamaño de video correcto…"); return;
      }
      const objects = frame.objects.filter(object => filter === "all" || (filter === "people" ? object.class_id === 0 : object.class_id !== 0));
      context.lineWidth = rect.width < 500 ? 1.5 : 2;
      context.font = "600 11px ui-monospace, monospace";
      context.textBaseline = "top";
      for (const object of objects) {
        const [left, top, right, bottom] = object.box;
        const x = area.x + left * area.width, y = area.y + top * area.height;
        const w = (right - left) * area.width, h = (bottom - top) * area.height;
        const color = object.class_id === 0 ? "#68c8ff" : object.class_id === 3 ? "#ffd36c" : "#57f1aa";
        context.strokeStyle = "#00190c";
        context.lineWidth += 2;
        context.strokeRect(x, y, w, h);
        context.lineWidth -= 2;
        context.strokeStyle = color;
        context.strokeRect(x, y, w, h);
        const text = `${object.label} #${object.id}`, textWidth = context.measureText(text).width + 8;
        const tx = Math.min(Math.max(area.x, x), area.x + area.width - textWidth);
        const ty = Math.max(area.y, y - 17);
        context.fillStyle = "rgba(0, 15, 8, .88)";
        context.fillRect(tx, ty, textWidth, 16);
        context.fillStyle = color;
        context.fillText(text, tx + 4, ty + 2);
      }
      layer.dataset.boxes = String(objects.length);
      layer.dataset.segment = position.segment;
      layer.dataset.offset = position.offset.toFixed(4);
      layer.dataset.observation = frame.offset.toFixed(4);
      layer.dataset.session = frame.session;
      status(`${objects.length} ${objects.length === 1 ? "objeto" : "objetos"}`);
    };

    let events: EventSource | null = null;
    if (enabled && receiving) {
      events = new EventSource(`/edge/api/live/detections/events?camera=${encodeURIComponent(camera)}`);
      events.addEventListener("state", event => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          worker = data.cameras?.[camera] ?? null;
          lastMessage = Date.now(); connected = true;
          // A paused frame can get its matching metadata after decoding.
          if (element.paused) draw();
        } catch { /* Ignore malformed metadata; no unverified boxes are drawn. */ }
      });
      events.addEventListener("frames", event => {
        try {
          const value = JSON.parse((event as MessageEvent).data);
          if (Array.isArray(value.frames)) buffer.append(value.frames, camera);
          lastMessage = Date.now(); connected = true;
          if (element.paused) draw();
        } catch { /* The next valid packet recovers the stream. */ }
      });
      events.onerror = () => { connected = false; draw(); };
    }
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      draw(metadata.mediaTime);
      if (!closed) frameCallback = element.requestVideoFrameCallback(onFrame);
    };
    if (typeof element.requestVideoFrameCallback === "function") frameCallback = element.requestVideoFrameCallback(onFrame);
    else {
      const tick = () => { draw(element.currentTime); if (!closed) animation = requestAnimationFrame(tick); };
      animation = requestAnimationFrame(tick);
    }
    const redraw = () => draw(element.currentTime);
    const seeking = () => { clear(); status("Sincronizando…"); };
    element.addEventListener("seeking", seeking);
    element.addEventListener("seeked", redraw);
    element.addEventListener("pause", redraw);
    element.addEventListener("emptied", seeking);
    const resize = new ResizeObserver(() => draw()); resize.observe(layer);
    const freshness = setInterval(() => { if (element.paused || Date.now() - lastMessage > 12000) draw(); }, 1000);
    draw();
    return () => {
      closed = true; events?.close(); buffer.clear(); resize.disconnect(); clearInterval(freshness);
      if (frameCallback) element.cancelVideoFrameCallback(frameCallback);
      if (animation) cancelAnimationFrame(animation);
      element.removeEventListener("seeking", seeking); element.removeEventListener("seeked", redraw);
      element.removeEventListener("pause", redraw); element.removeEventListener("emptied", seeking);
      clear();
    };
  }, [camera, enabled, receiving, filter, video, fragments]);

  return <>
    <canvas ref={canvas} data-detection-overlay={camera} aria-label="Detecciones sobre el video"
      className="pointer-events-none absolute inset-0 h-full w-full" />
    <span ref={caption} data-detection-status={camera} className="pointer-events-none absolute bottom-12 left-2 rounded bg-black/75 px-2 py-1 font-mono text-[10px] text-white/90" />
  </>;
}
