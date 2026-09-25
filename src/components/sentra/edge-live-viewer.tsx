"use client";

import Link from "next/link";
import Script from "next/script";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CorridorMap } from "@/components/sentra/corridor-map";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

type HlsInstance = {
  loadSource: (source: string) => void;
  attachMedia: (video: HTMLVideoElement) => void;
  destroy: () => void;
  on: (event: string, callback: (_event: string, data: { fatal?: boolean }) => void) => void;
};
declare global {
  interface Window {
    Hls?: {
      new (config: Record<string, unknown>): HlsInstance;
      isSupported: () => boolean;
      Events: { ERROR: string };
    };
  }
}

type Camera = {
  key: string; title: string; url: string; receiving: boolean; bitrate_bps?: number;
  last_progress_age?: number;
  archive?: { segments: number; seconds: number; last: number; problem_segments: number };
};
type LiveState = {
  updated_at: number; server_time: number; cameras: Camera[]; transport_ok: boolean;
  storage: { usage_bytes?: number; free_bytes?: number; accepting?: boolean };
  user: { name: string; email: string; csrf: string };
};
type Segment = {
  id: string; camera: string; started: number; ended: number; duration: number; size: number;
  state: string; gap_count: number; missing_seconds: number; decode_ok: boolean; url: string;
};
type Archive = { segments: Segment[]; gaps: { started: number; ended: number; seconds: number }[]; truncated: boolean };

const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs transition-colors hover:border-accent disabled:cursor-default disabled:opacity-40";
const panel = "rounded-xl border border-[var(--border)] bg-[#0c1b16]";
const timeText = (seconds: number, date = false) => new Intl.DateTimeFormat("es-HN", {
  timeZone: "America/Tegucigalpa", ...(date ? { day: "2-digit", month: "short" } : {}),
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
}).format(new Date(seconds * 1000));
const inputTime = (seconds: number) => new Date((seconds - 6 * 3600) * 1000).toISOString().slice(0, 16);
const Map = memo(CorridorMap);

function LiveCamera({ camera, ready, goLive }: { camera: Camera; ready: boolean; goLive: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Conectando…");
  useEffect(() => {
    const element = video.current;
    if (!element || !ready || !camera.receiving) return;
    let player: HlsInstance | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let lastTime = 0, lastProgress = Date.now();
    const connect = () => {
      if (closed) return;
      player?.destroy();
      if (WindowHls?.isSupported()) {
        player = new WindowHls({ enableWorker: true, lowLatencyMode: false, liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5, maxBufferLength: 18, backBufferLength: 30,
          manifestLoadingMaxRetry: 3, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 3 });
        player.on(WindowHls.Events.ERROR, (_event, details) => {
          if (closed || !details.fatal) return;
          setStatus("Reconectando…");
          if (retry) clearTimeout(retry);
          retry = setTimeout(connect, 3000);
        });
        player.loadSource(camera.url); player.attachMedia(element);
      } else if (element.canPlayType("application/vnd.apple.mpegurl")) element.src = camera.url;
      else setStatus("Este navegador no puede reproducir la señal.");
    };
    const WindowHls = window.Hls;
    const playing = () => { setStatus("En vivo"); lastProgress = Date.now(); };
    const waiting = () => setStatus("Cargando señal…");
    const paused = () => { if (!closed) setStatus("Pausado"); };
    const loaded = () => { void element.play().catch(() => setStatus("Pulsá reproducir")); };
    element.addEventListener("playing", playing); element.addEventListener("waiting", waiting);
    element.addEventListener("pause", paused); element.addEventListener("loadedmetadata", loaded);
    connect();
    const watch = setInterval(() => {
      if (element.currentTime > lastTime + .01) { lastTime = element.currentTime; lastProgress = Date.now(); }
      if (!element.paused && Date.now() - lastProgress > 15000) {
        lastProgress = Date.now(); setStatus("Reconectando…"); connect();
      }
    }, 3000);
    return () => {
      closed = true; clearInterval(watch); if (retry) clearTimeout(retry); player?.destroy();
      element.removeEventListener("playing", playing); element.removeEventListener("waiting", waiting);
      element.removeEventListener("pause", paused); element.removeEventListener("loadedmetadata", loaded);
      element.removeAttribute("src"); element.load();
    };
  }, [camera.url, camera.receiving, ready]);
  useEffect(() => {
    const element = video.current;
    if (goLive && element?.seekable.length) {
      element.currentTime = Math.max(0, element.seekable.end(element.seekable.length - 1) - 1.5);
      void element.play().catch(() => {});
    }
  }, [goLive]);
  return <article className={`${panel} overflow-hidden`} data-live-camera={camera.key}>
    <div className="flex items-center justify-between gap-2 px-3 py-2 font-mono text-xs">
      <h3 className="truncate text-text">{camera.title}</h3>
      <span className={camera.receiving ? "text-accent" : "text-warning"}>{camera.receiving ? status : "Sin señal"}</span>
    </div>
    <div className="relative aspect-video bg-black">
      <video ref={video} data-live-video={camera.key} muted autoPlay playsInline controls className="h-full w-full" />
      {!camera.receiving && <div className="absolute inset-0 grid place-items-center bg-black/90 px-4 text-center text-sm text-text-faint">La cámara no está enviando video.</div>}
    </div>
    <div className="flex justify-between gap-3 px-3 py-2 font-mono text-[10px] text-text-faint">
      <span>{camera.archive?.segments ?? 0} segmentos guardados</span>
      <span>{camera.archive?.problem_segments ? `${camera.archive.problem_segments} para revisar` : "Video original"}</span>
    </div>
  </article>;
}

function History({ camera, onExpired }: { camera: Camera; onExpired: () => void }) {
  const [when, setWhen] = useState(() => inputTime(Date.now() / 1000));
  const [archive, setArchive] = useState<Archive | null>(null);
  const [selected, setSelected] = useState<Segment | null>(null);
  const [offset, setOffset] = useState(0);
  const [position, setPosition] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const abort = useRef<AbortController | null>(null);
  const load = useCallback(async (target: number, nearest = false) => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/edge/api/live/archive?camera=${camera.key}&start=${target - 3600}&end=${target + 3600}`, { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("No se pudo consultar el historial.");
      const value: Archive = await response.json(); if (controller.signal.aborted) return;
      setArchive(value);
      const found = value.segments.find(segment => segment.started <= target && segment.ended > target)
        ?? (nearest ? value.segments.at(-1) : null);
      setSelected(found ?? null); setOffset(found && !nearest ? Math.max(0, target - found.started) : 0);
      setPosition(found?.started ?? 0);
      if (!found) setMessage("No hay grabación guardada para esa hora. Podés elegir uno de los tramos disponibles.");
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [camera.key, onExpired]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(Date.now() / 1000, true); }, 0);
    return () => { clearTimeout(timer); abort.current?.abort(); };
  }, [load]);
  const choose = (segment: Segment) => { setSelected(segment); setOffset(0); setPosition(segment.started); setMessage(""); };
  const advance = () => {
    if (!selected || !archive) return;
    const next = archive.segments[archive.segments.findIndex(row => row.id === selected.id) + 1];
    if (!next) { setMessage("Llegaste al final de los tramos guardados en esta consulta."); return; }
    if (next.started - selected.ended > .15) {
      setMessage(`Hay un período sin grabación entre ${timeText(selected.ended)} y ${timeText(next.started)}. Elegí el siguiente tramo para continuar.`);
      return;
    }
    choose(next);
  };
  return <section className={`${panel} p-4`} aria-label="Historial de la cámara">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg text-text">{camera.title}</h2><p className="mt-1 text-xs text-text-faint">Hora de Honduras · horario de recepción</p></div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); const target = Date.parse(when + ":00-06:00") / 1000; if (Number.isFinite(target)) void load(target); }}>
        <label className="grid gap-1 font-mono text-xs text-text-faint">Fecha y hora
          <input required type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} className="rounded-lg border border-[var(--border)] bg-bg-input px-2 py-2 text-text" />
        </label>
        <button className={button} disabled={busy}>{busy ? "Buscando…" : "Buscar hora"}</button>
      </form>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-warning">{error}</p>}
    {message && <p role="status" className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">{message}</p>}
    {selected && <>
      <video key={selected.id + ":" + offset} ref={video} src={selected.url} data-history-video controls autoPlay muted playsInline className="aspect-video max-h-[65vh] w-full rounded-lg bg-black"
        onLoadedMetadata={() => { if (video.current) video.current.currentTime = Math.min(offset, Math.max(0, video.current.duration - .1)); }}
        onTimeUpdate={() => setPosition(selected.started + (video.current?.currentTime ?? 0))} onEnded={advance} />
      <div className="my-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-text-faint">
        <span>{timeText(position || selected.started, true)} · {selected.state === "ok" ? "Sin cortes detectados" : "Tramo con incidencias"}</span>
        <a className={button} href={selected.url} download={`Senttra-${camera.key}-${Math.round(selected.started)}.mp4`}>Descargar tramo</a>
      </div>
    </>}
    {archive && <>
      <div className="my-4 flex flex-wrap justify-between gap-2 font-mono text-xs text-text-faint">
        <span>{archive.segments.length} tramos disponibles</span>
        <span className={archive.gaps.length ? "text-warning" : ""}>{archive.gaps.length ? `${archive.gaps.length} períodos sin grabación` : ""}</span>
      </div>
      <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4" aria-label="Tramos guardados">
        {archive.segments.map(segment => <button key={segment.id} onClick={() => choose(segment)} aria-pressed={selected?.id === segment.id}
          className={`${button} text-left ${selected?.id === segment.id ? "border-accent bg-[#123a2a] text-accent" : "text-text-faint"}`}>
          <span className="block">{timeText(segment.started)}</span>
          <span className="mt-1 block text-[10px] opacity-70">{Math.round(segment.duration)} s · {segment.state === "ok" ? "Verificado" : "Revisar"}</span>
        </button>)}
      </div>
    </>}
  </section>;
}

export function EdgeLiveViewer() {
  const [state, setState] = useState<LiveState | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"live" | "history">("live");
  const [selected, setSelected] = useState(0);
  const [all, setAll] = useState(true);
  const [goLive, setGoLive] = useState(0);
  const expired = useCallback(() => { setDenied(true); setState(null); }, []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const response = await fetch("/edge/api/live/bootstrap", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { expired(); return; }
        if (!response.ok) throw new Error("No se pudo consultar la captura. Volviendo a intentar…");
        const value: LiveState = await response.json();
        if (!controller.signal.aborted) { setState(value); setError(""); }
      } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    };
    void poll(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [expired]);
  const cameras = state?.cameras;
  const mapCameras = useMemo(() => cameras?.map(camera => ({ id: camera.key, nombre: camera.title, n_giro: 0, n_rojo: 0 })) ?? [], [cameras]);
  const pick = useCallback((index: number) => setSelected(index), []);
  const logout = async () => {
    try {
      const response = await fetch("/edge/auth/logout", { method: "POST", headers: { "X-CSRF-Token": state?.user.csrf ?? "" } });
      if (!response.ok && response.status !== 401) throw new Error("No se pudo cerrar la sesión.");
      expired();
    } catch (reason) { setError((reason as Error).message); }
  };
  if (denied) return <main className="grid min-h-screen place-items-center bg-bg-page p-6"><div className={`${panel} w-full max-w-md p-8`}>
    <div className="mb-6 flex items-center gap-3"><SentraLogoMark size={28} /><SentraWordmark /></div>
    <h1 className="mb-3 text-xl text-text">Video en vivo e historial</h1>
    <p className="mb-6 text-sm text-text-faint">Entrá con tu cuenta de Senttra para ver las cámaras.</p>
    <a href="/edge/auth/login?next=%2Fedge%2Flive" className={`${button} inline-block border-accent text-accent`}>Entrar con Zitadel</a>
  </div></main>;
  const camera = cameras?.[Math.min(selected, Math.max(0, cameras.length - 1))];
  return <main className="min-h-screen bg-bg-page text-text">
    <Script src="/senttra/hls.min.js" strategy="afterInteractive" onReady={() => setReady(true)} />
    <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[rgba(8,20,17,0.95)] px-5 py-4 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2.5"><SentraLogoMark size={26} /><SentraWordmark /><span className="font-mono text-[10px] uppercase tracking-widest text-accent">Edge</span></Link>
      <nav className="flex flex-wrap items-center gap-3 font-mono text-xs"><Link href="/edge" className="text-text-faint hover:text-accent">Pruebas y zonas</Link><span className="text-accent">En vivo e historial</span><button className="cursor-pointer text-text-faint hover:text-accent" onClick={logout}>Salir</button></nav>
    </header>
    <div className="mx-auto max-w-[1920px] p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl tracking-tight">Cámaras y grabaciones</h1><p className="mt-1 text-sm text-text-faint">{cameras ? `${cameras.filter(row => row.receiving).length} de ${cameras.length} cámaras con señal` : "Conectando con Senttra…"} · video original</p></div>
        <div className="flex gap-2" aria-label="Modo de video">
          <button className={`${button} ${mode === "live" ? "border-accent text-accent" : ""}`} aria-pressed={mode === "live"} onClick={() => setMode("live")}>En vivo</button>
          <button className={`${button} ${mode === "history" ? "border-accent text-accent" : ""}`} aria-pressed={mode === "history"} onClick={() => setMode("history")}>Historial</button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-warning/30 p-3 text-sm text-warning">{error}</p>}
      {state?.storage.accepting === false && <p role="alert" className="mb-4 rounded-lg border border-warning/30 p-3 text-sm text-warning">La grabación está pausada para conservar el espacio libre del disco.</p>}
      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className={`${panel} overflow-hidden`} aria-label="Mapa de cámaras"><Map cams={mapCameras} sel={selected} onPick={pick} admin={false} api="" token="" loadSavedLayout={false} /></section>
          <div className={`${panel} p-3`} aria-label="Selección de cámara">
            {cameras?.map((row, index) => <button key={row.key} aria-pressed={selected === index} onClick={() => setSelected(index)} className={`mb-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm ${selected === index ? "bg-[#123a2a] text-accent" : "text-text-faint hover:bg-[#123a2a]/50"}`}>
              <span>{row.title}</span><span title={row.receiving ? "Recibiendo video" : "Sin señal"} className={`h-2 w-2 shrink-0 rounded-full ${row.receiving ? "bg-accent" : "bg-warning"}`} />
            </button>)}
          </div>
          <p className="px-1 text-xs leading-relaxed text-text-faint">Las grabaciones siguen guardándose aunque cierres esta pantalla.</p>
        </aside>
        <div className="min-w-0">
          {mode === "live" ? <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2"><button className={button} aria-pressed={all} onClick={() => setAll(true)}>Todas</button><button className={button} aria-pressed={!all} onClick={() => setAll(false)}>Cámara seleccionada</button></div>
              <button className={button} onClick={() => setGoLive(value => value + 1)}>Volver al directo</button>
            </div>
            <div className={`grid gap-3 ${all && (cameras?.length ?? 0) > 1 ? "lg:grid-cols-2" : ""}`}>
              {(all ? cameras : camera ? [camera] : [])?.map(row => <LiveCamera key={row.key} camera={row} ready={ready} goLive={goLive} />)}
            </div>
          </> : camera && <History key={camera.key} camera={camera} onExpired={expired} />}
        </div>
      </div>
    </div>
  </main>;
}
