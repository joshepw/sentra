"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clock, type Camera, type Vehicle } from "@/lib/edge-replay";

export function EdgeVehicleGallery({ camera, vehicles, onSeek }: {
  camera: Camera; vehicles: Vehicle[]; onSeek: (seconds: number) => void;
}) {
  const [type, setType] = useState("Todos");
  const [color, setColor] = useState("Todos");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const cache = useRef<Record<number, string>>({});
  const filtered = useMemo(() => vehicles.filter(v => (type === "Todos" || v.type === type) &&
    (color === "Todos" || v.color === color) && String(v.id).includes(query.replace(/^#/, "").trim())), [vehicles, type, color, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const current = Math.min(page, pages - 1);
  const items = useMemo(() => filtered.slice(current * 24, current * 24 + 24), [filtered, current]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !items.length) return;
    const abort = new AbortController();
    const waitFor = (event: string) => new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout); video.removeEventListener(event, done);
        video.removeEventListener("error", failed); abort.signal.removeEventListener("abort", failed);
        if (error) reject(error); else resolve();
      };
      const done = () => finish();
      const failed = () => finish(new Error("Video unavailable"));
      const timeout = setTimeout(failed, 8000);
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", failed, { once: true });
      abort.signal.addEventListener("abort", failed, { once: true });
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    void (async () => {
      if (!ctx) return;
      if (video.readyState < 2) await waitFor("loadeddata");
      for (const item of items) {
        if (abort.signal.aborted) return;
        if (cache.current[item.id]) continue;
        if (Math.abs(video.currentTime - item.time) > .002) {
          const seeked = waitFor("seeked"); video.currentTime = item.time; await seeked;
        }
        if (abort.signal.aborted) return;
        const scale = video.videoWidth / camera.width;
        const [x, y, right, bottom] = item.box;
        const w = (right - x) * scale, h = (bottom - y) * scale;
        const left = Math.max(0, x * scale - w * .18), top = Math.max(0, y * scale - h * .18);
        const width = Math.min(video.videoWidth - left, w * 1.36), height = Math.min(video.videoHeight - top, h * 1.36);
        if (width <= 0 || height <= 0) continue;
        canvas.width = 200; canvas.height = Math.max(60, Math.round(200 * height / width));
        ctx.drawImage(video, left, top, width, height, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL("image/jpeg", .72);
        cache.current[item.id] = image;
        setThumbs(previous => ({ ...previous, [item.id]: image }));
      }
    })().catch(() => { /* A failed thumbnail does not interrupt the camera player. */ });
    return () => { abort.abort(); };
  }, [camera, items]);

  const inputClass = "appearance-none rounded-lg border border-[var(--border-strong)] bg-[#0f241b] px-3.5 py-2.5 font-sans text-[13px] text-text outline-none";
  const pageClass = "rounded-lg border border-[var(--border-strong)] px-3 py-2 font-mono text-[12px] text-text-muted transition-colors hover:text-accent disabled:opacity-35";
  return (
    <section className="mt-6 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-6" aria-label="Galería de vehículos">
      <video ref={videoRef} src={`/edge${camera.url}`} muted playsInline preload="auto" className="hidden" />
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Galería de vehículos</h2>
        <div className="font-display text-lg font-extrabold text-text">{filtered.length}</div>
        <div className="font-mono text-[12px] text-accent">vehículos · {camera.title}</div>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Tipo</span>
          <select aria-label="Filtrar por tipo" value={type} onChange={e => { setType(e.target.value); setPage(0); }} className={inputClass}>
            {["Todos", ...new Set(vehicles.map(v => v.type))].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Color</span>
          <select aria-label="Filtrar por color" value={color} onChange={e => { setColor(e.target.value); setPage(0); }} className={inputClass}>
            {["Todos", ...new Set(vehicles.map(v => v.color))].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Buscar ID</span>
          <input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="# id…" className={`${inputClass} w-[130px] placeholder:text-text-faint`} />
        </label>
        <button onClick={() => { setType("Todos"); setColor("Todos"); setQuery(""); setPage(0); }} className="py-2.5 font-sans text-[13px] text-text-muted hover:text-accent">Limpiar</button>
      </div>
      {!items.length && <p className="mt-6 font-mono text-xs text-text-faint">Sin vehículos para este filtro.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map(vehicle => <button key={vehicle.id} onClick={() => onSeek(vehicle.time)} title={`#${vehicle.id} · ${clock(vehicle.time)}`}
          className="group overflow-hidden rounded-[10px] border border-[var(--border)] bg-bg-card text-left transition-colors hover:border-accent">
          <div className="relative h-[92px] bg-[#081411]">
            {thumbs[vehicle.id] ? (
              // Generated privately from this browser's video; no image server is involved.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[vehicle.id]} alt={`Vehículo ${vehicle.id}`} className="h-full w-full object-cover" />
            ) : <svg viewBox="0 0 120 92" className="absolute inset-0 h-full w-full animate-sn-pulse"><path d="M9 22V9h13M98 9h13v13M111 70v13H98M22 83H9V70" fill="none" stroke="rgba(61,214,140,.35)" strokeWidth={2} /></svg>}
            <span className="absolute left-1.5 top-1.5 rounded bg-[rgba(8,20,17,.82)] px-1.5 py-1 font-mono text-[9px] font-semibold text-text">{vehicle.type}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-2.5 py-2">
            <span className="font-mono text-[11px] font-semibold text-text">#{vehicle.id}</span><span className="font-mono text-[10px] text-accent">{clock(vehicle.time)}</span>
          </div>
          <div className="px-2.5 pb-2 font-mono text-[10px] text-text-muted">{vehicle.color}</div>
        </button>)}
      </div>
      {pages > 1 && <div className="mt-6 flex items-center justify-center gap-2">
        <button onClick={() => setPage(current - 1)} disabled={!current} className={pageClass}>‹ Anterior</button>
        <span className="px-2 font-mono text-[12px] text-text-muted">{current + 1} / {pages}</span>
        <button onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className={pageClass}>Siguiente ›</button>
      </div>}
    </section>
  );
}
