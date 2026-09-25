"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";
import { CorridorMap } from "@/components/sentra/corridor-map";
import { EdgeCamera, type Overlays } from "@/components/sentra/edge-camera";
import { EdgeVehicleGallery } from "@/components/sentra/edge-vehicle-gallery";
import { clock, frameAt, isVehicle, vehiclesIn, ReplayClock, type Bootstrap, type Camera, type Frame, type Metrics, type Packet, type Run } from "@/lib/edge-replay";

import { allowed, filterFrames, type RegionState } from "@/lib/edge-regions";
import { EdgeZoneEditor } from "@/components/sentra/edge-zone-editor";

const CameraMap = memo(CorridorMap);
const Gallery = memo(EdgeVehicleGallery);
const EMPTY_FRAMES: Frame[] = [];
const button = "cursor-pointer rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors hover:border-accent disabled:cursor-default disabled:opacity-35";
const active = "border-accent bg-[#123a2a] text-accent";
const inactive = "border-[var(--border)] bg-bg-input text-text-faint";

export function EdgeTrafficViewer() {
  const [controller] = useState(() => new ReplayClock());
  const [data, setData] = useState<Bootstrap | null>(null);
  const [regions, setRegions] = useState<RegionState | null>(null);
  const [editor, setEditor] = useState<{ camera: Camera; time: number; regions: RegionState } | null>(null);
  const [notice, setNotice] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const [all, setAll] = useState(true);
  const [overlays, setOverlays] = useState<Overlays>({ cajas: true, etiquetas: true, rastros: true });
  const [position, setPosition] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<Map<string, Frame[]>>(() => new Map());
  const pick = useCallback((index: number) => { setSel(index); }, []);
  const seek = useCallback((seconds: number) => { controller.seek(seconds); setPosition(seconds); }, [controller]);

  useEffect(() => {
    const abort = new AbortController(); let source: EventSource | null = null;
    let activeRun: string | null = null, loadedRun: string | null = null, loadingRun: string | null = null;
    const deny = () => { source?.close(); controller.reset(); setSignedOut(true); setData(null); };
    const request = async (path: string) => {
      const response = await fetch(`/edge${path}`, { signal: abort.signal, cache: "no-store" });
      if (response.status === 401) { deny(); throw new Error("Sesión vencida. Volvé a entrar."); }
      if (!response.ok) throw new Error("No se pudieron cargar las grabaciones. Volvé a intentar.");
      return response;
    };
    const receive = (snapshot: Run) => {
      if (abort.signal.aborted) return;
      if (activeRun !== snapshot.run_id) {
        activeRun = snapshot.run_id; loadedRun = null; controller.reset(); setHistory(new Map(controller.frames));
      }
      if (snapshot.status === "loading") controller.mode = "idle";
      if (snapshot.status === "running") {
        controller.mode = "live"; controller.paused = false;
        if (snapshot.packet) { controller.epoch = snapshot.packet.epoch_unix; setMetrics(snapshot.packet.metrics); }
        controller.append(snapshot.frames, true);
      }
      if (snapshot.status === "complete" && snapshot.run_id && loadedRun !== snapshot.run_id && loadingRun !== snapshot.run_id) {
        const id = snapshot.run_id; loadingRun = id;
        void request("/api/replay").then(response => response.text()).then(text => {
          if (abort.signal.aborted || activeRun !== id) return;
          const packets: Packet[] = text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
          controller.replay(packets); loadedRun = id; setHistory(new Map(controller.frames)); setError("");
        }).catch(reason => { if (!abort.signal.aborted) setError(String(reason.message)); })
          .finally(() => { if (loadingRun === id) loadingRun = null; });
      }
      if (snapshot.status === "failed") { controller.mode = "idle"; setError(snapshot.error ?? "La prueba se interrumpió."); }
      setRun(snapshot);
    };
    const start = Date.now() / 1000;
    void request("/api/bootstrap").then(response => response.json()).then((bootstrap: Bootstrap) => {
      if (abort.signal.aborted) return;
      controller.offset = bootstrap.run.server_time - (start + Date.now() / 1000) / 2;
      setData(bootstrap); setRegions(bootstrap.regions); receive(bootstrap.run);
      source = new EventSource("/edge/api/events");
      source.addEventListener("state", event => {
        try { receive(JSON.parse(event.data)); } catch { setError("No se pudo actualizar el estado de la prueba."); }
      });
      source.addEventListener("frames", event => {
        try {
          const packet: Packet = JSON.parse(event.data);
          if (controller.mode !== "live") return;
          controller.epoch = packet.epoch_unix; controller.append(packet.frames, true);
        } catch { setError("No se pudo actualizar una detección."); }
      });
      source.onerror = () => { void request("/api/state").then(response => response.json()).then(receive).catch(() => {}); };
    }).catch(reason => { if (!abort.signal.aborted) setError(String(reason.message)); });
    const timer = setInterval(() => {
      const seconds = controller.time(); setPosition(Math.max(0, seconds));
      if (controller.mode === "replay") {
        const packet = controller.packets.findLast(row => row.seconds <= seconds);
        if (packet) setMetrics(packet.metrics);
      }
    }, 180);
    const regionTimer = setInterval(() => { void request("/api/regions").then(response => response.json()).then((state: RegionState) => { if (!abort.signal.aborted) setRegions(old => old?.revision === state.revision ? old : state); }).catch(() => {}); }, 10000);
    return () => { abort.abort(); source?.close(); clearInterval(timer); clearInterval(regionTimer); };
  }, [controller]);

  const post = async (path: string) => {
    const response = await fetch(`/edge${path}`, { method: "POST", headers: { "X-CSRF-Token": data?.user.csrf ?? "" } });
    if (response.status === 401) { setSignedOut(true); setData(null); throw new Error("Sesión vencida."); }
    if (!response.ok) throw new Error("No se pudo completar la operación. Volvé a intentar.");
    return response.json();
  };
  const startRun = async () => {
    setBusy(true); setError("");
    try { await post("/api/run"); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const logout = async () => {
    try { await post("/auth/logout"); window.location.assign("/edge"); } catch (reason) { setError((reason as Error).message); }
  };
  const editZones = async () => {
    if (!camera) return;
    setError("");
    try {
      const response = await fetch("/edge/api/regions", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudieron cargar las zonas. Revisá tu sesión y volvé a intentar.");
      const current: RegionState = await response.json(); setRegions(current);
      if (controller.mode === "replay" && !controller.paused) controller.pause();
      setEditor({ camera, time: controller.time(), regions: current });
    } catch (reason) { setError((reason as Error).message); }
  };
  const mapCameras = useMemo(() => data?.cameras.map(camera => ({ id: camera.key, nombre: camera.title, n_giro: 0, n_rojo: 0 })) ?? [], [data]);
  const camera = data?.cameras[sel];
  const profile = camera ? regions?.profiles[camera.key] : undefined;
  const frames = useMemo(() => {
    const raw = camera && run?.status === "complete" ? history.get(camera.key) ?? EMPTY_FRAMES : EMPTY_FRAMES;
    return filterFrames(raw, profile);
  }, [camera, history, profile, run?.status]);
  const vehicles = useMemo(() => vehiclesIn(frames), [frames]);
  const liveTracks = controller.mode === "live" && camera
    ? frameAt(controller.frames.get(camera.key) ?? EMPTY_FRAMES, position)?.native_tracks.filter(track => isVehicle(track) && allowed(track, profile)) ?? [] : null;
  const tracking = liveTracks ? liveTracks.length : vehicles.length;
  const classified = liveTracks ? liveTracks.filter(track => track.attributes).length : vehicles.filter(vehicle => vehicle.color !== "Por clasificar").length;

  if (!data) return <div className="flex min-h-screen w-full items-center justify-center bg-bg px-4 text-text">
    <div className="w-full max-w-[380px] rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-8">
      <div className="mb-6 flex items-center gap-2.5"><SentraLogoMark size={28} /><SentraWordmark /><span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-warning">Edge</span></div>
      {signedOut ? <><p className="mb-5 font-mono text-[11px] leading-relaxed text-text-muted">Entrá a Senttra para ver las cámaras del corredor.</p>
        <a href="/edge/auth/login" className="block w-full rounded-lg bg-accent px-4 py-2.5 text-center font-display text-sm font-bold text-[#062017] hover:opacity-90">Entrar con Zitadel</a></>
        : <p className="font-mono text-sm text-text-muted">{error || "Conectando con la estación local…"}</p>}
      {error && !signedOut && <button onClick={() => window.location.reload()} className={`mt-5 ${button} ${active}`}>Reintentar</button>}
    </div>
  </div>;

  const isRunning = run?.status === "loading" || run?.status === "running";
  const isReplay = controller.mode === "replay";
  const status = run?.status === "loading" ? "Cargando modelos…" : run?.status === "running" ? "Inferencia en tiempo real" : isReplay ? "Reproducción de grabaciones · 90 s" : "Cargando resultados…";
  return <div className="min-h-screen w-full bg-bg text-text">
    {editor && <EdgeZoneEditor camera={editor.camera} initial={editor.regions} time={editor.time} csrf={data.user.csrf} onClose={() => setEditor(null)} onSaved={state => { setRegions(state); setEditor(null); setNotice("Zonas guardadas. Se aplican al visor y a la siguiente prueba."); }} />}
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(8,20,17,0.9)] px-6 py-4 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2.5"><SentraLogoMark size={26} /><SentraWordmark /><span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-accent">Edge</span></Link>
      <div className="flex items-center gap-4 text-right font-mono text-[11px] leading-relaxed text-text-faint"><span className="hidden sm:block">Monitoreo de tráfico · SPS<br />Grabaciones locales · <span className="text-accent">11 cámaras</span></span><button onClick={logout} className="hover:text-accent">Salir</button></div>
    </header>
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-4 grid grid-cols-2 divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel lg:grid-cols-4 lg:divide-x">
        {[
          { value: tracking.toLocaleString("es-HN"), label: liveTracks ? "En seguimiento · cámara seleccionada" : "Vehículos · cámara seleccionada", color: "text-accent" },
          { value: classified.toLocaleString("es-HN"), label: "Con tipo y color", color: "text-text" },
          { value: metrics?.output_fps.toFixed(1) ?? "—", label: "FPS analizados · 11 cámaras", color: "text-accent" },
          { value: metrics ? `${Math.round(metrics.delay_ms)} ms` : "—", label: "Demora de análisis", color: "text-text" },
        ].map(item => <div key={item.label} className="p-5 sm:p-[24px_30px]"><div className={`font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] sm:text-[44px] ${item.color}`}>{item.value}</div><div className="mt-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-faint">{item.label}</div></div>)}
      </div>
      <CameraMap cams={mapCameras} sel={sel} onPick={pick} admin={false} api="/edge" token="" loadSavedLayout={false} />
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-3" aria-label="Seleccionar cámara">
        <span className="pr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">Cámara:</span>
        {data.cameras.map((item, index) => <button key={item.key} aria-pressed={index === sel} onClick={() => pick(index)} className={`cursor-pointer rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${index === sel ? active : "border-[var(--border)] bg-bg-input text-text-muted hover:border-accent hover:text-text"}`}>{item.title}</button>)}
      </div>
      {notice && <p role="status" className="mb-4 text-sm text-accent">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-danger/50 bg-bg-panel p-4 font-mono text-xs text-danger">{error}</p>}
      <div className="mb-4 flex flex-col gap-4 lg:flex-row">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-5 lg:flex-[2.4]" aria-label="Detección anotada">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3"><h1 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Detección anotada · {all ? "11 cámaras simultáneas" : camera?.title}</h1>
            <div className="flex flex-wrap gap-2">{(["cajas", "etiquetas", "rastros"] as const).map(key => <button key={key} aria-pressed={overlays[key]} onClick={() => setOverlays(previous => ({ ...previous, [key]: !previous[key] }))} className={`${button} ${overlays[key] ? active : inactive}`}>{key}</button>)}</div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2"><button aria-pressed={all} onClick={() => setAll(true)} className={`${button} ${all ? active : inactive}`}>Todas simultáneas</button><button aria-pressed={!all} onClick={() => setAll(false)} className={`${button} ${!all ? active : inactive}`}>Cámara seleccionada</button></div>
          <div className={all ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1"}>
            {data.cameras.filter((_, index) => all || index === sel).map(item => <EdgeCamera key={item.key} profile={regions?.profiles[item.key]} camera={item} controller={controller} overlays={overlays} selected={item.key === camera?.key} />)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] text-text-faint"><span className="text-accent">{status}</span><output data-testid="replay-clock">{clock(position)} / 01:30</output></div>
          <input aria-label="Posición de la grabación" type="range" min="0" max="90" step=".1" value={position} disabled={!isReplay} onChange={e => seek(Number(e.target.value))} className="mt-3 w-full cursor-pointer accent-accent disabled:opacity-30" />
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            <button disabled={!isReplay} onClick={() => { if (position >= 90) controller.playFrom(0); else controller.pause(); setPosition(controller.time()); }} className={`${button} ${active}`}>{controller.paused || position >= 90 ? "Reproducir" : "Pausar"}</button>
            <button disabled={!isReplay} onClick={() => { controller.playFrom(0); setPosition(0); }} className={`${button} ${inactive}`}>Desde el inicio</button>
            {[0, 15, 30, 45, 60, 75].map(seconds => <button key={seconds} disabled={!isReplay} onClick={() => seek(seconds)} className={`${button} ${Math.floor(position / 15) === seconds / 15 ? active : inactive}`}>{clock(seconds)}</button>)}
          </div>
        </section>
        <aside className="flex min-w-0 flex-col gap-4 lg:flex-1">
          <div className="overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel"><div className="border-b border-[var(--border)] px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Estación local · Edge</div>
            <div className="p-5"><p className="font-display text-lg font-bold text-accent">{camera?.title}</p><p className="mt-2 font-mono text-[11px] leading-relaxed text-text-muted">{all ? "Las once cámaras comparten la reproducción." : "Usá el mapa para cambiar de cámara."}<br />Grabaciones de distintas fechas.</p>
              <button disabled={isRunning || !regions} onClick={editZones} className={`mt-4 ${button} ${active}`}>Editar zonas de esta cámara</button>
              <p className="mt-2 text-xs text-text-faint">{profile?.regions.filter(region => region.enabled).length ?? 0} zonas activas · {camera?.title}</p>
              <button disabled={busy || isRunning} onClick={startRun} className={`mt-4 ${button} ${active}`}>{busy || isRunning ? "Procesando…" : "Nueva prueba de inferencia"}</button>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-text-faint">Vuelve a analizar estos videos. Todos los espectadores comparten la misma prueba.</p>
            </div>
          </div>
          {["Giros indebidos y vueltas en U", "Cruces en rojo"].map(title => <div key={title} className="overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel"><div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{title}</h2><span className="font-display text-[26px] font-extrabold text-text-faint">—</span></div><p className="p-5 text-xs leading-relaxed text-text-faint">Esta prueba evalúa detección, seguimiento, tipo y color. Las infracciones no se evalúan en estas grabaciones.</p></div>)}
        </aside>
      </div>
      <TrafficChart frames={frames} title={camera?.title ?? ""} position={position} onSeek={seek} />
      {camera && isReplay && <Gallery key={`${run?.run_id}/${camera.key}`} camera={camera} vehicles={vehicles} onSeek={seek} />}
    </main>
  </div>;
}

function TrafficChart({ frames, title, position, onSeek }: { frames: Frame[]; title: string; position: number; onSeek: (seconds: number) => void }) {
  const counts = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const ids = new Set<number>();
    for (const frame of frames) if (frame.source_seconds >= index * 5 && frame.source_seconds < (index + 1) * 5)
      for (const track of frame.native_tracks) if (isVehicle(track)) ids.add(track.native_id);
    return ids.size;
  }), [frames]);
  const max = Math.max(1, ...counts), bottom = 250, height = 220, slot = 60;
  return <section className="rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-6" aria-label="Tráfico en la grabación">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Tráfico en la grabación · {title}</h2><span className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted"><span className="size-2.5 rounded-sm bg-[#2e7d64]" />Vehículos visibles por intervalo de 5 s</span></div>
    <svg viewBox="0 0 1180 300" className="mt-4 block h-auto w-full select-none" role="img" aria-label="Vehículos visibles durante los 90 segundos">
      {Array.from({ length: 5 }, (_, index) => <g key={index}><line x1="46" y1={bottom - height * index / 4} x2="1140" y2={bottom - height * index / 4} stroke="rgba(141,168,154,.10)" /><text x="38" y={bottom - height * index / 4 + 3} fill="#5f7468" fontSize="9" textAnchor="end">{Math.round(max * index / 4)}</text></g>)}
      {counts.map((count, index) => <g key={index} onClick={() => onSeek(index * 5)} className="cursor-pointer"><title>{clock(index * 5)} · {count} vehículos</title><rect x={46 + index * slot} y="20" width={slot} height="240" fill="transparent" /><rect x={58 + index * slot} y={bottom - count / max * height} width="34" height={count / max * height} rx="1.5" fill={Math.floor(position / 5) === index ? "#3dd68c" : "#2e7d64"} />{index % 3 === 0 && <text x={75 + index * slot} y="276" fill="#5f7468" fontSize="10" textAnchor="middle">{clock(index * 5)}</text>}</g>)}
    </svg>
  </section>;
}
