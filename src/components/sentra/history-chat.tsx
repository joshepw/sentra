"use client";

/* eslint-disable @next/next/no-img-element -- Private thumbnails require browser session cookies. */

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { HistoryPlayer, type PlayerControl } from "@/components/sentra/history-player";
import { EdgeTrafficChart } from "@/components/sentra/edge-traffic-chart";
import { CorridorMap } from "@/components/sentra/corridor-map";
import { AssistantProgress } from "@/components/sentra/assistant-feedback";
import type { AssistantVoice } from "@/components/sentra/assistant-voice";
import { VoiceRecorder } from "@/components/sentra/voice-recorder";
import { CaseFile } from "@/components/sentra/case-file";
import { demoCaseKey, demoCaseChange, EMPTY_DEMO_CASE, type DemoCase, type DemoCaseChange } from "@/lib/case-demo";
import { EmptySector, SectorDirectory } from "@/components/sentra/sector-directory";
import { PRIMARY_SECTOR, SECTORS, type SectorId } from "@/lib/edge-sectors";
import { COLOR, TYPE, isTypeOnly, vehicleName } from "@/lib/edge-replay";
import { historyRange, historyTime, sameCameraPlayback, type Coverage, type HistoryItem, type Playback, type ToolResult } from "@/lib/history-detections";
import type { ViewerState, ViewerAction, ViewChanges, ActionFailure, PlaybackDiagnostics } from "@/lib/viewer-actions";

type Job = { id: string; status: string; phase: string; transcript?: string; reply?: string; error?: string; voice_error?: string; audio_url?: string; tool?: string; result?: ToolResult; action?: ViewerAction };
const CameraMap = memo(CorridorMap);
const button = "cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs transition-colors hover:border-accent disabled:cursor-default disabled:opacity-40";

export function HistoryChat({ csrf, onExpired, viewer, onView, cameras, children, deferTraffic, voice }: {
  csrf: string; onExpired: () => void; viewer: ViewerState; onView: (changes: ViewChanges) => void;
  cameras: { key: string; title: string; receiving: boolean }[]; children: ReactNode; deferTraffic: boolean; voice: AssistantVoice;
}) {
  const [coverage, setCoverage] = useState<Coverage>({ runs: [] });
  const liveRun = coverage.runs.find(run => run.kind === "live");
  // Omitting the run would let the backend choose an older archive by default.
  const runId = liveRun?.id ?? "live";
  const inCameraSector = viewer.sector === PRIMARY_SECTOR;
  const sectorTitle = SECTORS.find(sector => sector.id === viewer.sector)?.title;
  const mapCameras = useMemo(() => cameras.map(camera => ({ id: camera.key, nombre: camera.title, n_giro: 0, n_rojo: 0 })), [cameras]);
  const [text, setText] = useState(""), [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [error, setError] = useState("");
  const [answerReady, setAnswerReady] = useState(false);
  const [selection, setSelection] = useState<{ playback: Playback; item?: HistoryItem } | null>(null);
  const [sideTab, setSideTab] = useState<"results" | "case">("results");
  const [mapExpanded, setMapExpanded] = useState(true), [caseExpanded, setCaseExpanded] = useState(true);
  const [demoCases, setDemoCases] = useState<Record<string, DemoCase>>({});
  const tabId = useId();
  const resultList = useRef<HTMLDivElement>(null), resultScroll = useRef(0);
  const [recording, setRecording] = useState(false), [paging, setPaging] = useState(false);
  const abort = useRef<AbortController | null>(null), mounted = useRef(true), sending = useRef(false);
  const player = useRef<PlayerControl>(null);
  const panels = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stopVoice = voice.stop;
  const localRevision = useRef(0), conversation = useRef("");
  const current = useRef({ viewer, result, selection, runId });
  useEffect(() => { current.current = { viewer, result, selection, runId }; }, [viewer, result, selection, runId]);
  const revision = () => `${current.current.viewer.revision}:${localRevision.current}`;
  const choose = (value: typeof selection) => {
    if (sideTab === "results" && resultList.current) resultScroll.current = resultList.current.scrollTop;
    if (!value) setMapExpanded(true);
    else if (!current.current.selection) setMapExpanded(false);
    setSideTab(value?.item ? "case" : "results"); setCaseExpanded(true);
    if (value?.item && resultList.current?.contains(document.activeElement)) {
      requestAnimationFrame(() => document.getElementById(`${tabId}-case-tab`)?.focus({ preventScroll: true }));
    }
    localRevision.current++; current.current.selection = value; setSelection(value);
  };
  useLayoutEffect(() => {
    if (sideTab === "results" && resultList.current) resultList.current.scrollTop = resultScroll.current;
  }, [sideTab]);
  useEffect(() => {
    // Keep the map reachable by scrolling while bringing the selected video into view.
    const scroll = content.current, target = panels.current;
    if (selection && scroll && target) {
      scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top });
    }
  }, [selection]);
  const selectSector = (sector: SectorId | null) => {
    choose(null);
    onView({ sector, ...(sector === PRIMARY_SECTOR ? { all: true, mode: "live" as const } : {}) });
  };
  const showResult = (value: ToolResult) => {
    localRevision.current++; current.current.result = value; setResult(value); choose(null);
    onView(typeof value.filters?.camera === "string" ? { camera: value.filters.camera, all: false } : { sector: PRIMARY_SECTOR });
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; abort.current?.abort(); stopVoice(); };
  }, [stopVoice]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/edge/api/history/coverage", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("El índice de detecciones aún no está disponible.");
        const value: Coverage = await response.json();
        if (!controller.signal.aborted) setCoverage(value);
      } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(load, 15000);
    };
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [onExpired]);
  const post = useCallback(async (path: string, body: unknown, signal?: AbortSignal) => {
    const response = await fetch(`/edge/api/history/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body), signal });
    if (response.status === 401) { onExpired(); throw new Error("La sesión venció."); }
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || "No se pudo completar la consulta."), { status: response.status });
    return value;
  }, [csrf, onExpired]);
  const send = async (question: string, sound?: { audio: string; mime: string }) => {
    if (sending.current || (!question.trim() && !sound)) return;
    const voiceRequest = voice.prepare();
    sending.current = true; setBusy(true); setAnswerReady(false); setPhase(sound ? "transcribing" : "planning"); setError(""); setText("");
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    try {
      const snapshot = current.current, expectedRevision = revision();
      const hasVisibleCamera = snapshot.viewer.sector === PRIMARY_SECTOR;
      conversation.current ||= crypto.randomUUID();
      const visible = hasVisibleCamera ? snapshot.result?.items ?? [] : [];
      let job: Job = await post("chat", { ...(sound ?? { text: question }), run_id: snapshot.runId || undefined,
        selected_uid: hasVisibleCamera ? snapshot.selection?.item?.uid ?? snapshot.selection?.playback.incident_uid ?? snapshot.selection?.playback.track_uid : undefined,
        context_id: conversation.current, voice: !voice.muted,
        viewer: { ...snapshot.viewer, revision: expectedRevision, result_ids: visible.slice(0, 1000).map(item => item.uid), filters: hasVisibleCamera ? snapshot.result?.filters ?? {} : {},
          ...(hasVisibleCamera && snapshot.selection?.playback.source === "camera_time" ? { playback: snapshot.selection.playback } : {}) },
      }, controller.signal);
      // send runs only from form, microphone and shortcut events; never during render.
      // eslint-disable-next-line react-hooks/purity -- Event-driven polling deadline.
      const deadline = performance.now() + 5 * 60 * 1000;
      let resultReceived = false;
      let actionReceipt: { status: "applied" | "stale" | "failed"; reason?: ActionFailure; diagnostics?: PlaybackDiagnostics } | null = null;
      const receive = (value: ToolResult) => {
        if (revision() !== expectedRevision) throw new Error("La vista cambió durante la consulta. Repetila con la selección actual.");
        if (value.recording_request && value.available === false) setError(value.note || "No hay grabación para ese instante.");
        else if (value.playback) { choose({ playback: value.playback }); onView({ camera: value.playback.camera, all: false }); }
        else showResult(value);
        resultReceived = true;
        setAnswerReady(true);
      };
      const pollJob = async () => {
        // A phone can stall one request while the video keeps the other connections.
        // Give up that attempt and ask again, so the list is not stuck behind the audio.
        const attempt = new AbortController();
        const timer = setTimeout(() => attempt.abort(), 8000);
        const abort = () => attempt.abort();
        controller.signal.addEventListener("abort", abort);
        try {
          const response = await fetch(`/edge/api/history/chat/${job.id}`, { cache: "no-store", signal: attempt.signal });
          if (response.status === 401) { onExpired(); return null; }
          if (!response.ok) throw new Error("No se pudo recuperar la consulta.");
          return await response.json() as Job;
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", abort);
        }
      };
      while (["queued", "working", "waiting_action"].includes(job.status)) {
        if (controller.signal.aborted) return;
        setPhase(job.phase);
        if (job.result && !resultReceived) receive(job.result);
        // eslint-disable-next-line react-hooks/purity -- Elapsed time in the same event-driven poll.
        if (performance.now() > deadline) {
          if (resultReceived) break;
          throw new Error("La consulta sigue demorando. Podés volver a intentar en un momento.");
        }
        if (job.status === "waiting_action" && job.action) {
          if (!actionReceipt) {
            actionReceipt = { status: "stale" };
            if (job.action.revision === revision()) {
              let appliedRevision = job.action.revision;
              let activePlayer: PlayerControl | null = null;
              try {
                const action = job.action;
                if (action.kind === "media" || action.kind === "navigate") {
                  const matches = action.uid ? current.current.selection?.item?.uid === action.uid
                    : action.kind === "media" && sameCameraPlayback(action.playback, current.current.selection?.playback);
                  if (!matches) throw new Error("no_video");
                  if (action.kind === "navigate") await navigate(action.direction);
                  else {
                    if (!player.current) throw new Error("no_video");
                    activePlayer = player.current;
                    await activePlayer.control(action);
                    if (action.revision !== revision()) throw new Error("stale");
                  }
                } else if (action.kind === "open_archive") {
                  if (action.playback.source !== "camera_time" || !Number.isFinite(action.playback.at) || !action.playback.segment_id) throw new Error("unavailable_time");
                  flushSync(() => {
                    choose({ playback: action.playback }); onView({ camera: action.playback.camera, all: false });
                  });
                  appliedRevision = revision();
                  if (!player.current) throw new Error("no_video");
                  activePlayer = player.current;
                  await activePlayer.ready();
                  if (appliedRevision !== revision()) throw new Error("stale");
                } else flushSync(() => {
                  if (action.kind === "view") {
                    onView(action.changes);
                    if (action.changes.close_video || action.changes.mode || action.changes.sector !== undefined) choose(null);
                  } else if (action.kind === "open_video") {
                    const item = current.current.result?.items?.find(row => row.uid === action.uid)
                      ?? (current.current.selection?.item?.uid === action.uid ? current.current.selection.item : undefined);
                    choose({ playback: action.playback, item }); onView({ camera: action.playback.camera, all: false });
                  } else throw new Error("Acción desconocida.");
                });
                actionReceipt = { status: "applied" };
              } catch (reason) {
                const code = (reason as Error).message;
                actionReceipt = code === "stale" || appliedRevision !== revision() ? { status: "stale" } : {
                  status: "failed", ...(code === "playback_timeout" ? { reason: "playback_timeout" as const } : job.action.kind === "open_archive" ? { reason: "recording_unavailable" as const }
                    : ["no_more_results", "no_video", "unavailable_time", "playback_blocked"].includes(code) ? { reason: code as ActionFailure } : {}),
                };
              }
              if (activePlayer) actionReceipt.diagnostics = activePlayer.diagnostics();
            }
          }
          try { job = await post(`chat/${job.id}/applied`, actionReceipt, controller.signal); continue; }
          catch (reason) { if ((reason as { status?: number }).status !== 429) throw reason; }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const next = await pollJob();
          if (!next) return;
          job = next;
        } catch (reason) {
          if (controller.signal.aborted) return;
          // Keep the results on screen and ask for the job again.
          if ((reason as Error).message !== "No se pudo recuperar la consulta.") continue;
          throw reason;
        }
      }
      if (job.status === "failed") throw new Error(job.error || "No se pudo completar la consulta.");
      if (job.result) {
        if (!resultReceived) receive(job.result);
      }
      if (!controller.signal.aborted) {
        if (job.audio_url) void voice.play(job.audio_url, voiceRequest);
        else if (job.voice_error) voice.fail(voiceRequest);
      }
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
    finally { sending.current = false; if (mounted.current && !controller.signal.aborted) { setBusy(false); setPhase(""); } }
  };
  const loadPage = async (source: ToolResult) => {
      const params = new URLSearchParams(Object.entries({ ...source.filters, cursor: source.next_cursor }).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/edge/api/history/${source.counting === "candidate_events" ? "incidents" : "search"}?${params}`, { cache: "no-store" });
      if (response.status === 401) { onExpired(); throw new Error("La sesión venció."); }
      if (!response.ok) throw new Error("No se pudo cargar la siguiente página.");
      const value: ToolResult = await response.json();
      return { ...value, items: [...(source.items ?? []), ...(value.items ?? [])] };
  };
  const more = async () => {
    const source = current.current.result, expected = revision();
    if (!source?.next_cursor || !source.filters) return; setPaging(true); setError("");
    try {
      const value = await loadPage(source);
      if (revision() !== expected) return;
      localRevision.current++; current.current.result = value; setResult(value);
    } catch (reason) { setError((reason as Error).message); } finally { setPaging(false); }
  };
  const navigate = async (direction: "next" | "previous") => {
    const source = current.current.result, uid = current.current.selection?.item?.uid, expected = revision();
    const index = source?.items?.findIndex(item => item.uid === uid) ?? -1;
    if (!source || index < 0) throw new Error("no_video");
    const target = index + (direction === "next" ? 1 : -1);
    let value = source;
    if (target === source.items?.length && source.next_cursor) value = await loadPage(source);
    if (revision() !== expected) throw new Error("stale");
    const item = value.items?.[target];
    if (!item) throw new Error("no_more_results");
    flushSync(() => {
      if (value !== source) { current.current.result = value; setResult(value); }
      choose({ playback: item.playback, item }); onView({ camera: item.camera, all: false });
    });
  };
  const manualNavigate = async (direction: "next" | "previous") => {
    setPaging(true); setError("");
    try { await navigate(direction); }
    catch (reason) { setError((reason as Error).message === "no_more_results" ? "No hay otro resultado en esa dirección." : "La vista cambió o no se pudo abrir el siguiente resultado."); }
    finally { setPaging(false); }
  };
  const compare = async (uid: string) => {
    setPaging(true); setError("");
    try {
      const response = await fetch(`/edge/api/history/similar?uid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw new Error("No se pudieron comparar las vistas.");
      showResult(await response.json());
    } catch (reason) { setError((reason as Error).message); } finally { setPaging(false); }
  };
  const updateDemoCase = (item: HistoryItem, change: DemoCaseChange) => {
    const key = demoCaseKey(item);
    setDemoCases(previous => ({ ...previous, [key]: demoCaseChange(previous[key] ?? EMPTY_DEMO_CASE, change) }));
  };
  const replayCase = async (item: HistoryItem) => {
    const activePlayer = player.current, selected = current.current.selection;
    if (!activePlayer) throw new Error("no_video");
    if (!selected?.item || demoCaseKey(selected.item) !== demoCaseKey(item)) throw new Error("stale");
    await activePlayer.seekTo(item.at ?? item.best_time ?? item.first ?? item.playback.at);
  };
  const selectedIndex = result?.items?.findIndex(item => item.uid === selection?.item?.uid) ?? -1;
  const cameraTitle = (key: string) => cameras.find(camera => camera.key === key)?.title ?? key;
  const filters = result?.filters;
  const searchHours = result?.search_hours;
  const outsideHours = searchHours?.has_daytime_overlap === false;
  const criteria = filters ? [
    filters.type === "camion" ? "Camiones" : filters.type === "persona" ? "Personas" : filters.type === "auto" || filters.type === "carro" ? "Carro" : filters.type ? TYPE[String(filters.type)] ?? String(filters.type) : !filters.kind && result?.counting !== "candidate_events" ? "Vehículos" : "",
    filters.color && !isTypeOnly(String(filters.type ?? "")) ? `${filters.type === "persona" ? "Camisa: " : ""}${COLOR[String(filters.color)] ?? filters.color}` : "",
    filters.kind ? filters.kind === "uturn" ? "Vueltas en U" : "Cruces en rojo" : "",
    filters.review ? filters.review === "confirmed" ? "Confirmadas" : filters.review === "dismissed" ? "Descartadas" : "Pendientes" : "",
    filters.camera ? cameraTitle(String(filters.camera)) : "Todas las cámaras",
  ].filter(Boolean).join(" · ") : "";
  const range = filters ? historyRange(filters.start, filters.end) : "";
  return <section aria-label="Consulta del historial" className="flex min-h-0 flex-1 flex-col pt-2">
    <div ref={content} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    {viewer.sector !== null && <nav aria-label="Navegación de sectores" className="mb-2 flex shrink-0 items-center gap-2 px-3 text-xs sm:px-5">
      <button type="button" aria-label="Ver sectores" onClick={() => selectSector(null)} className="cursor-pointer py-1 text-text-muted hover:text-accent">← Sectores</button>
      <span aria-hidden="true" className="text-text-faint">/</span><span className="text-text">{sectorTitle}</span>
      {inCameraSector && <div className="ml-auto flex items-center gap-3"><span className="hidden font-mono text-[10px] text-text-faint sm:inline">{cameras.length} cámaras</span><button type="button" aria-expanded={mapExpanded} aria-controls={`${tabId}-map`} onClick={() => setMapExpanded(value => !value)} className="cursor-pointer py-1 text-[11px] text-text-muted hover:text-accent">{mapExpanded ? "Ocultar" : "Mostrar"} mapa y actividad <span aria-hidden="true">{mapExpanded ? "▴" : "▾"}</span></button></div>}
    </nav>}
    {viewer.sector === null ? <SectorDirectory cameras={cameras} onSelect={selectSector} /> : !inCameraSector ? <EmptySector sector={viewer.sector} onSelect={selectSector} /> : <>
    <div id={`${tabId}-map`} hidden={!mapExpanded} aria-label="Mapa y tráfico del corredor" className={mapExpanded ? "mb-3 flex h-[clamp(100px,15dvh,128px)] shrink-0 snap-x snap-mandatory gap-3 overflow-x-auto px-3 sm:grid sm:h-[clamp(112px,21dvh,220px)] sm:grid-cols-[minmax(0,1fr)_minmax(240px,32%)] sm:overflow-visible sm:px-5 lg:grid-cols-[minmax(0,1fr)_340px]" : "hidden"}>
      <div className="h-full min-h-0 min-w-0 basis-[88%] shrink-0 snap-start" aria-label="Mapa del corredor"><CameraMap cams={mapCameras} sel={Math.max(0, cameras.findIndex(camera => camera.key === viewer.camera))} onPick={index => { choose(null); onView({ camera: cameras[index].key, all: false }); }} admin={false} api="" token="" loadSavedLayout={false} compact /></div>
      <div className="h-full min-h-0 min-w-0 basis-[88%] shrink-0 snap-start"><EdgeTrafficChart camera={viewer.camera} title={cameraTitle(viewer.camera)} run={liveRun} onExpired={onExpired} defer={deferTraffic} /></div>
    </div>
    <div ref={panels} className={`grid flex-1 gap-3 px-3 pb-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1 ${selection ? `min-h-min lg:min-h-0 ${sideTab === "case" ? caseExpanded ? "grid-rows-[minmax(300px,1fr)_390px]" : "grid-rows-[minmax(300px,1fr)_116px]" : "grid-rows-[minmax(min-content,1fr)_280px]"}` : answerReady ? "min-h-0 grid-rows-[minmax(88px,0.7fr)_minmax(180px,1.3fr)]" : "min-h-0 grid-rows-[minmax(120px,1fr)_minmax(96px,1fr)]"}`}>
      <div className="min-h-0 min-w-0" aria-label="Panel de video">
        {selection ? <HistoryPlayer key={`${selection.playback.camera}:${selection.playback.at}:${selection.playback.track_uid ?? selection.playback.incident_uid ?? ""}`} controlRef={player} playback={selection.playback} title={cameraTitle(selection.playback.camera)} item={selection.item} onClose={() => choose(null)} onExpired={onExpired} boxes={viewer.boxes} onBoxes={boxes => onView({ boxes })} /> : <div className="h-full min-h-0 overflow-y-auto rounded-xl" data-camera-view>{children}</div>}
      </div>
      <aside aria-label="Resultados de la consulta" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0c1b16]">
        <div role="tablist" aria-label="Resultados y ficha" className="flex shrink-0 gap-1 border-b border-[var(--border)] px-2 pt-1" onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" || !selection?.item ? "results" : event.key === "End" ? "case" : sideTab === "results" ? "case" : "results";
          setSideTab(next); document.getElementById(`${tabId}-${next}-tab`)?.focus({ preventScroll: true });
        }}>
          {(["results", "case"] as const).map(tab => <button key={tab} type="button" role="tab" id={`${tabId}-${tab}-tab`} aria-controls={`${tabId}-${tab}-panel`} aria-selected={sideTab === tab} tabIndex={sideTab === tab ? 0 : -1} disabled={tab === "case" && !selection?.item} onClick={() => setSideTab(tab)} className={`cursor-pointer border-b-2 px-4 py-2.5 text-xs font-medium outline-offset-[-2px] disabled:cursor-default disabled:opacity-35 ${sideTab === tab ? "border-accent text-accent" : "border-transparent text-text-faint hover:text-text"}`}>{tab === "results" ? "Resultados" : "Ficha"}</button>)}
        </div>
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-1 lg:py-2" data-result-context>
          <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm">{sideTab === "case" ? "Caso seleccionado" : outsideHours ? "Fuera del horario de búsqueda" : result?.total !== undefined ? `${result.total} ${result.counting === "candidate_events" ? result.total === 1 ? "incidencia" : "incidencias" : result.total === 1 ? "aparición" : "apariciones"}` : "Resultados"}</h2>
          {selectedIndex >= 0 && <div className="flex items-center gap-2"><span className="text-xs text-accent">{selectedIndex + 1} / {result?.total ?? result?.items?.length}</span><button className={button} aria-label="Resultado anterior" disabled={(busy && !answerReady) || paging || selectedIndex === 0} onClick={() => void manualNavigate("previous")}>←</button><button className={button} aria-label="Siguiente resultado" disabled={(busy && !answerReady) || paging || (selectedIndex === (result?.items?.length ?? 0) - 1 && !result?.next_cursor)} onClick={() => void manualNavigate("next")}>→</button></div>}
          </div>
          {sideTab === "results" && criteria && <p className="mt-1 text-[11px] leading-snug text-text-muted">{criteria}</p>}
          {sideTab === "results" && range && <p className="mt-0.5 text-[11px] leading-snug text-text-faint">{range}</p>}
          {busy && answerReady && phase === "voice" && <p className="mt-1 text-[11px] leading-snug text-text-faint" data-voice-pending>Preparando el audio…</p>}
          {sideTab === "results" && searchHours && <p className="mt-0.5 text-[11px] leading-snug text-text-muted">Solo {searchHours.start}–{searchHours.end} HN, cada día</p>}
          {sideTab === "case" && <button type="button" className="my-1 cursor-pointer text-[11px] text-accent lg:hidden" aria-expanded={caseExpanded} aria-controls={`${tabId}-case-panel`} onClick={() => setCaseExpanded(value => !value)}>{caseExpanded ? "Contraer ficha ▴" : "Expandir ficha ▾"}</button>}
        </div>
        {busy && !answerReady && <div className="shrink-0 px-3 pt-2 lg:pt-3"><AssistantProgress phase={phase} /></div>}
        <div ref={resultList} role="tabpanel" id={`${tabId}-results-panel`} aria-labelledby={`${tabId}-results-tab`} hidden={sideTab !== "results"} className={sideTab === "results" ? "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2 lg:p-3" : "hidden"} onScroll={event => { if (sideTab === "results") resultScroll.current = event.currentTarget.scrollTop; }} data-result-list>
          {!result && !busy && <div className="space-y-3 py-3 text-sm text-text-faint"><p>Búsqueda de personas, vehículos e incidencias por texto o voz.</p><div className="flex flex-wrap gap-2">{[["Pailas rojas", "Mostrar las pailas rojas"], ["Vueltas en U", "Mostrar las vueltas en U"], ["Cruces en rojo", "Mostrar los cruces en rojo"], ["Cobertura", "Qué cámaras y horas tienen detecciones guardadas"]].map(([label, question]) => <button key={label} className={button} disabled={busy || recording} onClick={() => void send(question)}>{label}</button>)}</div><p className="text-xs leading-relaxed">“Mostrar Little Caesars a las 7 de la mañana” abre la grabación de hoy. También podés indicar una fecha, pausar o retroceder diez segundos.</p></div>}
          {result?.coverage && <p className="hidden text-[11px] leading-relaxed text-text-faint lg:block">{result.counting !== "candidate_events" && "Una misma unidad puede aparecer más de una vez. "}{result.coverage.runs.some(run => run.kind === "archive" && run.status !== "complete") ? "Cobertura parcial: solo los momentos analizados." : "Resultados de los momentos analizados."}</p>}
          {result?.color_notice && <p className="text-xs leading-relaxed text-text-faint">{result.color_notice}</p>}
          {(result?.note || result?.reason) && <p className="text-xs leading-relaxed text-warning">{result.note ?? result.reason}</p>}
          {result?.items?.length === 0 && <p className="py-3 text-sm text-text-faint">{outsideHours ? "Las búsquedas de vehículos por tipo o color están disponibles de 7 a. m. a 6 p. m., hora de Honduras." : "Sin coincidencias en el historial procesado para esos filtros."}</p>}
          {result?.items?.map((item, index) => <article key={item.uid} data-result-number={index + 1} aria-current={selection?.item?.uid === item.uid ? "true" : undefined} className={`flex gap-3 rounded-lg border p-2 lg:p-3 ${selection?.item?.uid === item.uid ? "border-accent/60 bg-[#123a2a]/50" : "border-[var(--border)] bg-[#09150f]"}`}>
            {item.thumbnail_url && <img src={item.thumbnail_url} alt={vehicleName(item.type, item.color, item.class_id)} loading="lazy" className="h-16 w-20 shrink-0 rounded-md object-contain" />}
            <div className="min-w-0 flex-1"><p className="text-sm text-text"><span className="mr-1 font-mono text-accent">{index + 1}.</span>{item.kind ? item.kind === "uturn" ? "Posible vuelta en U" : "Posible cruce en rojo" : vehicleName(item.type, item.color ?? "Color sin determinar", item.class_id)}</p><p className="mt-1 text-xs text-text-faint">{item.title}</p><p className="mt-1 text-xs text-text-faint">{historyTime(item.at ?? item.best_time ?? item.first ?? item.playback.at)}</p>{item.kind && <p className="mt-1 text-xs text-warning">{item.review === "confirmed" ? "Confirmada en revisión" : item.review === "dismissed" ? "Descartada" : "Pendiente de revisión"}</p>}{item.similarity !== undefined && <p className="mt-1 text-xs text-warning">Similitud visual: {item.similarity.toFixed(3)}</p>}<div className="mt-2 flex flex-wrap gap-2"><button className={button} onClick={() => { choose({ playback: item.playback, item }); onView({ camera: item.camera, all: false }); }}>Ver video</button>{!item.kind && <button className={button} disabled={paging || (busy && !answerReady)} onClick={() => void compare(item.uid)}>Otras cámaras</button>}</div></div>
          </article>)}
          {result?.next_cursor && <button className={`${button} w-full`} disabled={paging || (busy && !answerReady)} onClick={() => void more()}>{paging ? "Cargando…" : "Ver más resultados"}</button>}
          {result?.runs?.map(run => <p key={run.id} className="text-xs text-text-faint">{run.title} · {run.cameras.length} cámaras · {run.status === "complete" ? "Completo" : "Parcial"} · {historyTime(run.started)}{run.ended ? ` a ${historyTime(run.ended)}` : " en adelante"}</p>)}
          {result?.cameras?.map(camera => <p key={camera.camera} className={`text-xs ${camera.receiving ? "text-accent" : "text-warning"}`}>{camera.title}: {camera.receiving ? "con señal" : "sin señal"}</p>)}
        </div>
        {selection?.item && <div role="tabpanel" id={`${tabId}-case-panel`} aria-labelledby={`${tabId}-case-tab`} hidden={sideTab !== "case"} className={sideTab === "case" ? `${caseExpanded ? "flex" : "hidden lg:flex"} min-h-0 flex-1 flex-col` : "hidden"}>
          <CaseFile key={demoCaseKey(selection.item)} item={selection.item} value={demoCases[demoCaseKey(selection.item)] ?? EMPTY_DEMO_CASE} onChange={change => updateDemoCase(selection.item!, change)} onReplay={() => replayCase(selection.item!)} />
        </div>}
      </aside>
    </div>
    </>}
    </div>
    <footer className="relative shrink-0 border-t border-[var(--border)] bg-[#0c1b16] px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5" aria-label="Asistente de cámaras">
      {!inCameraSector && busy && <div className="mb-2"><AssistantProgress phase={phase} /></div>}
      {error && <p role="alert" className="mb-2 text-xs text-warning">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); void send(text); }} className="flex gap-2"><label className="sr-only" htmlFor="history-question">Consulta de cámaras</label><input id="history-question" autoComplete="off" maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder={inCameraSector ? "Buscar o controlar el video…" : "Mostrame un sector…"} className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-bg-input px-3 py-3 text-sm text-text outline-none focus:border-accent" disabled={recording} /><button type="submit" className={`${button} border-accent/50 text-accent`} disabled={busy || recording || !text.trim()}>Enviar</button><VoiceRecorder disabled={busy} onSend={sound => void send("", sound)} onInteraction={voice.unlock} onActivityChange={active => { if (active) voice.prepare(); setRecording(active); }} onError={setError} /></form>
    </footer>
  </section>;
}
