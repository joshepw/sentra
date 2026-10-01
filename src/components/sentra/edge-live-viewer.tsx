"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryChat } from "@/components/sentra/history-chat";
import { useAssistantVoice, VoiceMuteButton } from "@/components/sentra/assistant-voice";
import type { ViewerState, ViewChanges } from "@/lib/viewer-actions";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";
import { LiveDetectionOverlay, type DetectionStatus } from "@/components/sentra/live-detection-overlay";
import { fragmentName, type VideoFragment } from "@/lib/live-detections";
import { LIVE_HLS_CONFIG, livePlaybackPosition } from "@/lib/live-playback";
import { VideoLoading } from "@/components/sentra/assistant-feedback";

type HlsInstance = {
  loadSource: (source: string) => void;
  attachMedia: (video: HTMLVideoElement) => void;
  destroy: () => void;
  on: (event: string, callback: (_event: string, data: { fatal?: boolean; frag?: VideoFragment }) => void) => void;
};
declare global {
  interface Window {
    Hls?: {
      new (config: Record<string, unknown>): HlsInstance;
      isSupported: () => boolean;
      Events: { ERROR: string; FRAG_BUFFERED: string; FRAG_CHANGED: string; MANIFEST_PARSED?: string };
    };
  }
}

type Camera = {
  key: string; title: string; url: string; receiving: boolean; bitrate_bps?: number;
  last_progress_age?: number;
  availability_note?: string;
  detections?: DetectionStatus;
  encoding?: { mode: "compressed" | "original"; bitrate_kbps?: number } | null;
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
type VideoStage = "connecting" | "buffering" | "playing" | "paused" | "reconnecting" | "blocked" | "unsupported";
const videoStatus: Record<VideoStage, string> = { connecting: "Conectando…", buffering: "Cargando señal…", playing: "En vivo", paused: "Pausado", reconnecting: "Reconectando…", blocked: "Pulsá reproducir", unsupported: "No se puede reproducir esta señal" };

function LiveCamera({ camera, ready, playerFailed, goLive, showBoxes, fit, onPlayable }: { camera: Camera; ready: boolean; playerFailed: boolean; goLive: number; showBoxes: boolean; fit: boolean; onPlayable: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fragments = useRef<VideoFragment[]>([]);
  const [stage, setStage] = useState<VideoStage>("connecting");
  useEffect(() => {
    const element = video.current;
    if (!element || !ready || !camera.receiving) return;
    let player: HlsInstance | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let nativeInitialPosition = false;
    let lastTime = 0, lastProgress = Date.now();
    const connect = (reconnecting = false) => {
      if (closed) return;
      setStage(reconnecting ? "reconnecting" : "connecting");
      player?.destroy();
      nativeInitialPosition = false;
      fragments.current = [];
      lastTime = 0; lastProgress = Date.now();
      if (WindowHls?.isSupported()) {
        player = new WindowHls(LIVE_HLS_CONFIG);
        player.on(WindowHls.Events.ERROR, (_event, details) => {
          if (closed || !details.fatal) return;
          setStage("reconnecting");
          if (retry) clearTimeout(retry);
          retry = setTimeout(() => connect(true), 3000);
        });
        const remember = (_event: string, details: { frag?: VideoFragment }) => {
          const fragment = details.frag;
          if (!fragment?.url) return;
          const name = fragmentName(fragment.url);
          fragments.current = [...fragments.current.filter(row => fragmentName(row.url) !== name), fragment]
            .sort((a, b) => a.start - b.start).slice(-90);
        };
        player.on(WindowHls.Events.FRAG_BUFFERED, remember);
        player.on(WindowHls.Events.FRAG_CHANGED, remember);
        if (WindowHls.Events.MANIFEST_PARSED) player.on(WindowHls.Events.MANIFEST_PARSED, () => { if (!closed) setStage("buffering"); });
        player.loadSource(camera.url); player.attachMedia(element);
      } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
        nativeInitialPosition = true;
        element.src = camera.url;
      }
      else setStage("unsupported");
    };
    const WindowHls = window.Hls;
    const playing = () => { setStage("playing"); lastProgress = Date.now(); };
    const waiting = () => setStage("buffering");
    const paused = () => { if (!closed) setStage("paused"); };
    const positionNative = () => {
      if (!nativeInitialPosition) return;
      const position = livePlaybackPosition(element.seekable);
      if (position === null) return;
      nativeInitialPosition = false;
      element.currentTime = position;
    };
    const loaded = () => {
      positionNative();
      void element.play().catch(() => { if (!closed) setStage("blocked"); });
    };
    element.addEventListener("playing", playing); element.addEventListener("waiting", waiting);
    element.addEventListener("pause", paused); element.addEventListener("loadedmetadata", loaded);
    element.addEventListener("progress", positionNative);
    connect();
    const watch = setInterval(() => {
      if (Math.abs(element.currentTime - lastTime) > .01) { lastTime = element.currentTime; lastProgress = Date.now(); }
      if (!element.paused && Date.now() - lastProgress > 15000) {
        lastProgress = Date.now(); connect(true);
      }
    }, 3000);
    return () => {
      closed = true; clearInterval(watch); if (retry) clearTimeout(retry); player?.destroy();
      fragments.current = [];
      element.removeEventListener("playing", playing); element.removeEventListener("waiting", waiting);
      element.removeEventListener("pause", paused); element.removeEventListener("loadedmetadata", loaded);
      element.removeEventListener("progress", positionNative);
      element.removeAttribute("src"); element.load();
    };
  }, [camera.url, camera.receiving, ready]);
  useEffect(() => {
    const element = video.current;
    if (!goLive || !element) return;
    let closed = false;
    const events = ["loadedmetadata", "durationchange", "progress", "canplay"];
    const cleanup = () => events.forEach(event => element.removeEventListener(event, jump));
    const jump = () => {
      const position = livePlaybackPosition(element.seekable);
      if (closed || position === null) return;
      try { element.currentTime = position; } catch { return; }
      cleanup();
      void element.play().catch(() => { if (!closed) setStage("blocked"); });
    };
    events.forEach(event => element.addEventListener(event, jump));
    jump();
    return () => { closed = true; cleanup(); };
  }, [goLive, camera.receiving, ready]);
  const loading = ["connecting", "buffering", "reconnecting"].includes(stage) && !playerFailed;
  return <article className={`${panel} overflow-hidden ${fit ? "flex h-full min-h-0 flex-col" : ""}`} data-live-camera={camera.key}>
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 font-mono text-xs">
      <h3 className="truncate text-text">{camera.title}</h3>
      <span className={camera.receiving && !playerFailed && stage !== "unsupported" ? "text-accent" : "text-warning"}>{camera.receiving ? playerFailed ? "Reproductor no disponible" : videoStatus[stage] : "Sin señal"}</span>
    </div>
    <div className={`relative bg-black ${fit ? "min-h-0 flex-1" : "aspect-video"}`}>
      <video ref={video} data-live-video={camera.key} muted autoPlay playsInline controls controlsList="nofullscreen" onLoadedData={onPlayable} className="h-full w-full object-contain" />
      {camera.detections && <LiveDetectionOverlay camera={camera.key} video={video} fragments={fragments}
        enabled={showBoxes} receiving={camera.receiving} filter="all" />}
      {camera.receiving && loading && <VideoLoading label={stage === "reconnecting" ? "Reconectando la cámara" : stage === "buffering" ? "Preparando la imagen" : "Conectando tu cámara"} reconnecting={stage === "reconnecting"} />}
      {camera.receiving && (playerFailed || stage === "unsupported") && <div role="status" className="absolute inset-0 grid place-items-center bg-[#081411]/95 px-6 text-center text-sm text-text-muted"><div><p>{playerFailed ? "No se pudo cargar el reproductor." : "Este navegador no puede reproducir la señal."}</p>{playerFailed && <button type="button" className={`${button} mt-4 text-accent`} onClick={() => window.location.reload()}>Recargar</button>}</div></div>}
      {camera.receiving && stage === "blocked" && !playerFailed && <div className="absolute inset-0 grid place-items-center bg-black/40"><button type="button" className={`${button} bg-[#0b2419] text-accent`} onClick={() => { void video.current?.play().catch(() => setStage("blocked")); }}>Reproducir video</button></div>}
      {!camera.receiving && <div className="absolute inset-0 grid place-items-center bg-black/90 px-4 text-center text-sm text-text-faint">{camera.availability_note || "La cámara no está enviando video."}</div>}
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
    if (next.started - selected.ended < -.15) {
      setMessage("Los horarios de estos tramos se superponen. Elegí el siguiente tramo para continuar.");
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
  const [playerFailed, setPlayerFailed] = useState(false), [videoPlayable, setVideoPlayable] = useState(false);
  const markPlayable = useCallback(() => setVideoPlayable(true), []);
  const [view, setView] = useState<ViewerState>({ camera: "little", all: false, boxes: true, mode: "live", revision: 0 });
  const { mode, camera: selectedKey, all } = view;
  const [goLive, setGoLive] = useState(0);
  const changeView = useCallback((changes: ViewChanges) => {
    const { close_video: _close, ...patch } = changes;
    void _close;
    setView(previous => ({ ...previous, ...patch, revision: previous.revision + 1 }));
    if (changes.mode === "live") setGoLive(value => value + 1);
  }, []);
  const expired = useCallback(() => { setDenied(true); setState(null); }, []);
  const voice = useAssistantVoice(expired);
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
  const selected = Math.max(0, cameras?.findIndex(camera => camera.key === selectedKey) ?? 0);
  const logout = async () => {
    voice.stop();
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
  const camera = cameras?.[selected];
  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg-page text-text">
    <Script src="/senttra/hls.min.js" strategy="afterInteractive" onReady={() => { setPlayerFailed(false); setReady(true); }} onError={() => setPlayerFailed(true)} />
    <header className="z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[#081411] px-3 py-3 sm:px-5">
      <Link href="/" className="flex items-center gap-2"><SentraLogoMark size={24} /><SentraWordmark /><span className="font-mono text-[10px] uppercase tracking-widest text-accent">Edge</span></Link>
      <div className="flex items-center gap-2"><VoiceMuteButton voice={voice} /><button type="button" className="cursor-pointer text-xs text-text-faint hover:text-accent" onClick={logout}>Salir</button></div>
    </header>
    {error && <p role="alert" className="shrink-0 px-3 py-2 text-xs text-warning">{error}</p>}
    {state?.storage.accepting === false && <p role="alert" className="shrink-0 px-3 py-2 text-xs text-warning">La grabación está pausada para conservar el espacio libre del disco.</p>}
    {state ? <HistoryChat csrf={state.user.csrf} onExpired={expired} viewer={view} onView={changeView} cameras={state.cameras} voice={voice} deferTraffic={mode === "live" && !!camera?.receiving && !videoPlayable && !playerFailed}>
      {mode === "live" ? <div className="flex h-full min-h-0 flex-col">
        <div className={`grid min-h-0 flex-1 gap-3 ${all ? "auto-rows-max overflow-y-auto lg:grid-cols-2" : "grid-rows-1"}`}>
          {(all ? cameras : camera ? [camera] : [])?.map(row => <LiveCamera key={row.key} camera={row} ready={ready} playerFailed={playerFailed} goLive={goLive} showBoxes={view.boxes} fit={!all} onPlayable={markPlayable} />)}
        </div>
      </div> : camera && <History key={camera.key} camera={camera} onExpired={expired} />}
    </HistoryChat> : <p className="p-5 text-sm text-text-faint">Conectando con Senttra…</p>}
  </main>;
}
