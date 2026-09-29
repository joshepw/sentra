"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { historyTime, type Coverage } from "@/lib/history-detections";
import { loadTrafficSummary, trafficHourLabel, trafficPlan, type TrafficCache, type TrafficCount } from "@/lib/traffic-summary";

export function EdgeTrafficChart({ camera, title, run, onExpired }: {
  camera: string; title: string; run?: Coverage["runs"][number]; onExpired: () => void;
}) {
  const plan = useMemo(() => trafficPlan(run, camera), [run, camera]);
  const key = plan ? `${plan.runId}:${camera}:${plan.start}:${plan.end}` : "";
  const [loaded, setLoaded] = useState<{ key: string; rows: TrafficCount[] } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef<TrafficCache>(new Map());
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const currentPlan = trafficPlan(run, camera);
    if (!currentPlan) return;
    void loadTrafficSummary(currentPlan, controller.signal, cache.current).then(rows => {
      if (!controller.signal.aborted) setLoaded({ key, rows });
    }).catch(error => {
      if (!controller.signal.aborted && error.message === "session_expired") {
        controller.abort(); onExpired();
      }
    });
    return () => controller.abort();
    // Polling replaces the coverage object; only a changed observation window
    // needs another query. The request cache also retains completed hours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, onExpired]);
  const rows = loaded?.key === key ? loaded.rows : null;
  const partial = rows?.some(row => row.vehicles === null || row.incidents === null);
  const available = rows?.some(row => row.vehicles !== null || row.incidents !== null);
  const maxVehicles = Math.max(1, ...rows?.map(row => row.vehicles ?? 0) ?? []);
  const maxIncidents = Math.max(1, ...rows?.map(row => row.incidents ?? 0) ?? []);
  const left = 30, right = 326, top = 12, bottom = 110, height = bottom - top;
  const slot = (right - left) / (rows?.length || 1);
  const x = (index: number) => left + slot * (index + .5);
  const line = rows?.map((row, index) => row.incidents === null ? ""
    : `${index === 0 || rows[index - 1].incidents === null ? "M" : "L"}${x(index)} ${bottom - row.incidents / maxIncidents * height}`).join(" ");
  const tickEvery = Math.max(1, Math.ceil((rows?.length ?? 0) / 5));
  return <section aria-label="Tráfico por hora" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-bg-panel">
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2">
      <h2 className="font-mono text-[9px] font-semibold uppercase tracking-[.12em] text-text-muted">Tráfico por hora</h2>
      <span className="max-w-[52%] truncate text-[10px] text-text-faint" title={title}>{title}</span>
    </div>
    <div className="mt-1 flex shrink-0 flex-wrap gap-x-3 px-3 text-[9px] text-text-muted">
      <span className="flex items-center gap-1" title="Apariciones de vehículos por cámara; una unidad puede aparecer más de una vez"><span className="size-1.5 rounded-sm bg-[#2e7d64]" />Vehículos</span>
      <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />Posibles incidencias</span>
    </div>
    <div className="relative min-h-0 flex-1 px-2">
      {available ? <svg viewBox="0 0 350 135" className="h-full w-full" role="img" aria-label={`Apariciones de vehículos e incidencias pendientes por hora de ${title}`}>
        {[0, .5, 1].map(fraction => <g key={fraction}>
          <line x1={left} x2={right} y1={bottom - fraction * height} y2={bottom - fraction * height} stroke="var(--border)" />
          <text x={left - 5} y={bottom - fraction * height + 3} textAnchor="end" fill="var(--text-faint)" fontSize="9">{Math.round(maxVehicles * fraction).toLocaleString("es-HN", { notation: "compact" })}</text>
          <text x={right + 5} y={bottom - fraction * height + 3} fill="var(--danger)" fontSize="9">{Math.round(maxIncidents * fraction)}</text>
        </g>)}
        {rows?.map((row, index) => <g key={row.hour}>
          <title>{historyTime(row.start)}–{historyTime(row.end, false)}: {row.vehicles ?? "sin datos"} apariciones; {row.incidents ?? "sin datos"} posibles incidencias</title>
          {row.vehicles !== null && <rect x={left + index * slot + slot * .2} y={bottom - row.vehicles / maxVehicles * height} width={slot * .6} height={row.vehicles / maxVehicles * height} rx="1" fill={index === rows.length - 1 ? "var(--accent)" : "#2e7d64"} />}
          {index % tickEvery === 0 && <text x={x(index)} y="128" textAnchor="middle" fill="var(--text-faint)" fontSize="9">{trafficHourLabel(row.hour)}</text>}
        </g>)}
        <path d={line} fill="none" stroke="var(--danger)" strokeWidth="1.8" />
        {rows?.map((row, index) => row.incidents !== null && <circle key={row.hour} cx={x(index)} cy={bottom - row.incidents / maxIncidents * height} r="2" fill="var(--danger)" />)}
      </svg> : <p role="status" className="grid h-full place-items-center px-3 text-center text-xs text-text-faint">{!plan ? "Sin detecciones recientes para esta cámara." : !rows ? "Cargando tráfico…" : "No se pudo cargar el tráfico."}</p>}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-1.5 text-[9px] text-text-faint">
      <span>{partial ? "Datos incompletos" : plan?.limited ? "Últimas 24 h analizadas · Honduras" : "Actividad reciente · Honduras"}</span>
      {partial && <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>}
    </div>
  </section>;
}
