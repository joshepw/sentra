"use client";

import { memo, useEffect, useRef } from "react";
import { colorName, frameAt, isVehicle, typeName, ReplayClock, type Camera } from "@/lib/edge-replay";

export type Overlays = { cajas: boolean; etiquetas: boolean; rastros: boolean };

export const EdgeCamera = memo(function EdgeCamera({ camera, controller, overlays, selected }: {
  camera: Camera; controller: ReplayClock; overlays: Overlays; selected: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current, status = statusRef.current;
    if (!video || !canvas || !status) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0, videoCallback = 0, alive = true, pts = video.currentTime, drawn = -1;
    let lastSync = 0, lastSeek = -3000, revision = -1, playPending = false;
    const draw = () => {
      if (drawn === pts) return;
      drawn = pts; ctx.clearRect(0, 0, canvas.width, canvas.height);
      const frames = controller.frames.get(camera.key) ?? [];
      const frame = frameAt(frames, pts);
      if (!frame || controller.mode === "idle") { status.textContent = "Esperando detecciones"; return; }
      const tracks = frame.native_tracks.filter(isVehicle);
      const index = frames.indexOf(frame), next = frames[index + 1];
      const gap = next ? next.source_seconds - frame.source_seconds : 0;
      const blend = gap > 0 && gap <= .3 ? Math.max(0, Math.min(1, (pts - frame.source_seconds) / gap)) : 0;
      const sx = canvas.width / camera.width, sy = canvas.height / camera.height;
      const scale = canvas.width / Math.max(180, canvas.clientWidth);
      const font = Math.max(16, Math.min(44, 11 * scale));
      ctx.font = `600 ${font}px ui-monospace, monospace`; ctx.lineWidth = Math.max(2, scale);
      for (const track of tracks) {
        const future = blend ? next.native_tracks.find(item => item.native_id === track.native_id) : undefined;
        const [x, y, right, bottom] = track.xyxy.map((value, i) => future ? value + (future.xyxy[i] - value) * blend : value);
        const color = track.attributes ? "#3dd68c" : "#6fc9f2";
        if (overlays.rastros) {
          ctx.beginPath(); let started = false;
          for (let f = Math.max(0, index - 15); f <= index; f++) {
            if (pts - frames[f].source_seconds > 1.5) continue;
            const past = frames[f].native_tracks.find(item => item.native_id === track.native_id && item.visible);
            if (!past) continue;
            const [a, b, c, d] = past.xyxy;
            if (started) ctx.lineTo((a + c) * sx / 2, (b + d) * sy / 2);
            else ctx.moveTo((a + c) * sx / 2, (b + d) * sy / 2);
            started = true;
          }
          ctx.strokeStyle = color; ctx.globalAlpha = .5; ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (overlays.cajas) { ctx.strokeStyle = color; ctx.strokeRect(x * sx, y * sy, (right - x) * sx, (bottom - y) * sy); }
        if (overlays.etiquetas) {
          const label = `${typeName(track)} #${track.native_id}${track.attributes ? ` · ${colorName(track)}` : ""}`;
          const width = ctx.measureText(label).width + 12;
          const left = Math.max(0, Math.min(x * sx, canvas.width - width));
          const top = Math.max(font + 8, y * sy);
          ctx.fillStyle = color; ctx.fillRect(left, top - font - 8, width, font + 8);
          ctx.fillStyle = "#081411"; ctx.fillText(label, left + 6, top - 5);
        }
      }
      status.textContent = `${tracks.length} en seguimiento · ${frame.analysed_fps_5s.toFixed(1)} fps analizados`;
    };
    const videoFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      pts = metadata.mediaTime; draw();
      if (alive) videoCallback = video.requestVideoFrameCallback(videoFrame);
    };
    const seeked = () => { pts = video.currentTime; drawn = -1; draw(); };
    video.addEventListener("seeked", seeked);
    if (video.requestVideoFrameCallback) videoCallback = video.requestVideoFrameCallback(videoFrame);
    const loop = (now: number) => {
      const target = controller.time();
      if (now - lastSync > 100) {
        if (video.readyState >= 1 && !video.seeking) {
          const explicit = revision !== controller.revision;
          const drift = target - video.currentTime;
          if (explicit || (Math.abs(drift) > .32 && now - lastSeek > 2500)) {
            video.currentTime = Math.max(0, Math.min(89.97, target)); lastSeek = now; drawn = -1;
          }
          revision = controller.revision;
          video.playbackRate = Math.abs(drift) < .04 ? 1 : Math.max(.92, Math.min(1.08, 1 + drift * .3));
        }
        if (controller.mode === "idle" || controller.paused || target < 0 || target >= 90) video.pause();
        else if (video.paused && !playPending) {
          playPending = true; void video.play().catch(() => {}).finally(() => { playPending = false; });
        }
        lastSync = now;
      }
      if (!video.requestVideoFrameCallback) { pts = video.currentTime; draw(); }
      if (alive) raf = requestAnimationFrame(loop);
    };
    drawn = -1; draw(); raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); video.cancelVideoFrameCallback?.(videoCallback); video.removeEventListener("seeked", seeked); video.pause(); };
  }, [camera, controller, overlays]);

  return <article ref={cardRef} data-camera={camera.key} className={`min-w-0 overflow-hidden rounded-xl border bg-bg ${selected ? "border-accent" : "border-[var(--border-strong)]"}`}>
    <div className="flex items-center justify-between gap-2 px-3 py-2 font-mono text-[10px] text-text-muted"><span>{camera.title}</span><span className="text-text-faint">{camera.fps} fps</span></div>
    <div className="relative aspect-video overflow-hidden">
      <video data-edge-video={camera.key} ref={videoRef} src={`/edge${camera.url}`} muted playsInline preload="auto" className="h-full w-full object-cover" />
      <canvas ref={canvasRef} width={1280} height={720} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-sn-scan bg-gradient-to-r from-transparent via-accent to-transparent opacity-60" />
      <button aria-label={`Ampliar ${camera.title}`} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void cardRef.current?.requestFullscreen(); }}
        className="absolute bottom-2 right-2 rounded-md border border-[var(--border-strong)] bg-[rgba(8,20,17,.8)] px-2 py-1 text-text-muted hover:text-accent">⛶</button>
    </div>
    <div className="px-3 py-2 font-mono text-[9px] text-text-faint"><span ref={statusRef}>Cargando video…</span></div>
  </article>;
});
