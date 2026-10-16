"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated evidence is served with browser session cookies. */
import { memo, useId, useMemo } from "react";
import { DashboardIcon } from "./dashboard-icon";
import { incidentTitle } from "@/lib/case-demo";
import { historyTime, type HistoryItem } from "@/lib/history-detections";
import { numberText, project, type DashboardMaps, type DashboardSummary, type DashboardNavigation, type GeoMap } from "@/lib/edge-dashboard";
import corridorCoordinates from "../../../public/senttra/maps/camera-corridor-coordinates.json";

type Level = keyof DashboardMaps;
const levels: Level[] = ["region", "honduras", "cortes", "sps"];
const names = ["Región", "Honduras", "Cortés", "San Pedro Sula"];

// Decorative camera nodes follow actual streets, but do not assert the existence
// or position of individual feeds. Every node opens the configured camera mosaic.
function cityNodes(map: GeoMap) {
  const points = (map.roads ?? []).filter(road => road.class !== "local").flatMap(road => [...road.path.matchAll(/[ML]([\d.-]+)[, ]([\d.-]+)/g)].map(match => [Number(match[1]), Number(match[2])] as const));
  const nodes: [number, number][] = [];
  for (let n = 0; n < points.length && nodes.length < 68; n++) {
    const [x, y] = points[(n * 281) % points.length];
    if (x < 100 || x > 920 || y < 70 || y > 630 || nodes.some(point => Math.hypot(point[0] - x, point[1] - y) < 42)) continue;
    nodes.push([x, y]);
  }
  return nodes;
}

export const CityDrawing = memo(function CityDrawing({ map, interactive = false, onCamera, nodesVisible = true, zoom = 1, events = [], onOpen }: { map: GeoMap; interactive?: boolean; onCamera?: () => void; nodesVisible?: boolean; zoom?: number; events?: HistoryItem[]; onOpen?: (item: HistoryItem) => void }) {
  const id = useId().replaceAll(":", ""), nodes = useMemo(() => cityNodes(map), [map]);
  const positions = corridorCoordinates.cameraDefaults as Record<string, { lon: number; lat: number }>;
  const alerts = events.filter(item => positions[item.camera]).slice(0, 3);
  return <svg viewBox={map.viewBox} className="ed-city-svg" aria-label={interactive ? "Mapa de cámaras de San Pedro Sula" : undefined} aria-hidden={!interactive}>
    <defs>
      <pattern id={`${id}-grid`} width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#6ee4b1" strokeOpacity=".045" strokeWidth=".7" /></pattern>
      <radialGradient id={`${id}-glow`}><stop stopColor="#50d7a1" stopOpacity=".12" /><stop offset="1" stopColor="#50d7a1" stopOpacity="0" /></radialGradient>
      <filter id={`${id}-blur`}><feGaussianBlur stdDeviation="2" /></filter>
    </defs>
    <rect width="1000" height="700" fill={`url(#${id}-grid)`} />
    <g className="ed-map-transform" transform={`translate(500 350) scale(${zoom}) translate(-500 -350)`}>
      <ellipse cx="500" cy="350" rx="420" ry="310" fill={`url(#${id}-glow)`} />
      {(map.parks ?? []).map((area, i) => <path key={`park-${i}`} d={area.path} fill="#214c36" fillOpacity=".5" />)}
      {(map.water ?? []).map((area, i) => <path key={`water-${i}`} d={area.path} fill="none" stroke="#387a91" strokeOpacity=".55" strokeWidth="2" />)}
      {(map.roads ?? []).map((road, i) => <path key={i} d={road.path} className={`ed-road ed-road-${road.class}`} fill="none" vectorEffect="non-scaling-stroke" />)}
      {interactive && (map.labels ?? []).filter((label, index) => label.class !== "road" || index % 5 === 0).slice(0, 15).map((label, i) => <text key={i} x={label.x} y={label.y} className="ed-city-label" textAnchor="middle">{label.name}</text>)}
      {nodesVisible && <g className="ed-city-nodes">
        {nodes.filter((_, i) => i % 7 === 0).map(([x, y], i) => <circle key={`halo-${i}`} cx={x} cy={y} r="24" fill="none" stroke="#66e1b4" className="ed-node-halo" style={{ animationDelay: `${i * -.7}s` }} />)}
        {nodes.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `Abrir cámaras · punto ${i + 1}` : undefined} onClick={onCamera} onKeyDown={event => { if (interactive && ["Enter", " "].includes(event.key)) { event.preventDefault(); onCamera?.(); } }} className="ed-camera-node">
          <title>Abrir cámaras</title>
          <circle r="14" fill="transparent" className="ed-node-hit" />
          <path d="M0 0 24-19A30 30 0 0 1 27 15Z" fill="#6be0b4" opacity=".07" transform={`rotate(${i * 67})`} />
          <circle r="6" fill="#0e3026" stroke="#58cba0" strokeWidth=".8" />
          <rect x="-3.4" y="-2.6" width="5" height="4.8" rx="1" fill="#8ee7c3" /><path d="m1.7-1 2-1v4l-2-1Z" fill="#8ee7c3" />
        </g>)}
      </g>}
      {interactive && alerts.map((item, i) => {
        const location = positions[item.camera], [x, y] = project(map, location.lon, location.lat), labelY = y - 70 + i * 44;
        return <g key={item.uid} className={`ed-alert-marker ${item.review === "confirmed" ? "ed-alert-confirmed" : ""}`}>
          <g pointerEvents="none"><circle cx={x} cy={y} r="8" className="ed-alert-origin" /><circle cx={x} cy={y} r="3" fill="currentColor" /><path d={`M${x} ${y}L${x + 38} ${labelY + 15}H${x + 52}`} fill="none" stroke="currentColor" strokeWidth=".9" opacity=".7" /></g>
          <g transform={`translate(${x + 52} ${labelY})`} role="button" tabIndex={0} aria-label={`Abrir alerta: ${incidentTitle(item.kind ?? "incidente")} · ${item.title}`} data-map-incident={item.uid} onClick={() => onOpen?.(item)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onOpen?.(item); } }}><title>{item.title} · {historyTime(item.at ?? item.playback.at)}</title><rect width="154" height="32" rx="5" /><text x="12" y="20">{item.kind === "uturn" ? "↶  VUELTA EN U" : item.kind === "rojo" ? "●  CRUCE EN ROJO" : "△  INCIDENTE"}</text><text x="140" y="20" textAnchor="end">↗</text></g>
        </g>;
      })}
    </g>
    <text x="840" y="48" className="ed-map-coordinate">15.50° N / 88.03° W</text>
    <g transform="translate(944 74)" className="ed-map-compass"><path d="m0-16 5 20-5-4-5 4Z" fill="#84cbb1" /><text y="-24" textAnchor="middle">N</text></g>
  </svg>;
});

export function DashboardMap({ maps, summary, onCamera, onOpen, onIncidents, view, onView }: { maps: DashboardMaps; summary: DashboardSummary; onCamera: () => void; onOpen: (item: HistoryItem) => void; onIncidents: () => void; view: DashboardNavigation["map"]; onView: (view: DashboardNavigation["map"]) => void }) {
  const { level, zoom, nodesVisible } = view;
  const change = (patch: Partial<typeof view>) => onView({ ...view, ...patch });
  const depth = levels.indexOf(level), map = maps[level];
  const go = (next: Level) => change({ level: next, zoom: 1 });
  const pick = (id: string) => {
    if (level === "region" && id === "honduras") go("honduras");
    else if (level === "honduras" && id === "HN-CR") go("cortes");
    else if (level === "cortes" && id === "san-pedro-sula") go("sps");
  };
  return <section className="ed-control" aria-label="Centro de control">
    <div className="ed-section-head"><div><p className="ed-eyebrow">VISIÓN TERRITORIAL</p><h1>Centro de control<span className="ed-title-dot">.</span></h1></div><div className="ed-location-tag"><span className="ed-status-dot" />{level === "sps" ? "RED URBANA" : "EXPLORACIÓN GEOGRÁFICA"}</div></div>
    <nav className="ed-breadcrumbs" aria-label="Ubicación en el mapa">{levels.slice(0, depth + 1).map((key, i) => <span key={key}>{i > 0 && <DashboardIcon name="chevron" size={11} />}<button onClick={() => go(key)} aria-current={key === level ? "location" : undefined}>{names[i]}</button></span>)}</nav>
    <div className={`ed-geography ${level === "sps" ? "ed-geography-city" : ""}`} data-map-level={level}>
      <div className="ed-map-stage">
        <div className="ed-map-heading"><p className="ed-eyebrow">{level === "region" ? "CENTROAMÉRICA" : "SENTTRA · TERRITORIO"}</p><h2>{map.name}</h2><p>{level === "sps" ? "La ciudad, en una sola mirada." : level === "region" ? "Una nueva perspectiva de la región." : "Seleccioná un territorio para explorar."}</p></div>
        <div className="ed-map-viewport" key={level}>
          {level === "sps" ? <CityDrawing map={map} interactive onCamera={onCamera} nodesVisible={nodesVisible} zoom={zoom} events={summary.featured ? [summary.featured, ...summary.events.filter(item => item.uid !== summary.featured?.uid)] : summary.events} onOpen={onOpen} /> : <svg viewBox={map.viewBox} className={`ed-region-svg ed-region-${level}`} role="group" aria-label={`Mapa de ${map.name}`}>
            <defs><pattern id="ed-reg-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" stroke="#5ad3a1" strokeOpacity=".06" fill="none" /></pattern><radialGradient id="ed-reg-glow"><stop stopColor="#315f4e" stopOpacity=".4" /><stop offset="1" stopColor="#071d16" stopOpacity="0" /></radialGradient></defs>
            <rect width="1000" height="700" fill="url(#ed-reg-grid)" /><ellipse cx="500" cy="350" rx="500" ry="350" fill="url(#ed-reg-glow)" />
            {(map.areas ?? []).map(area => <g key={area.id} role="button" tabIndex={0} aria-label={area.name} data-map-area={area.id} className="ed-territory" onClick={() => pick(area.id)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); pick(area.id); } }}>
              <path d={area.path} /><text x={area.label[0]} y={area.label[1]} textAnchor="middle" dominantBaseline="central">{area.name}</text>
            </g>)}
            <g className="ed-map-compass" transform="translate(934 90)"><path d="m0-16 5 20-5-4-5 4Z" fill="#84cbb1" /><text y="-24" textAnchor="middle">N</text></g>
          </svg>}
        </div>
        {level === "sps" && <div className="ed-map-tools"><button aria-label="Acercar mapa" disabled={zoom >= 2} onClick={() => change({ zoom: Math.min(2, zoom + .25) })}>+</button><button aria-label="Alejar mapa" disabled={zoom <= 1} onClick={() => change({ zoom: Math.max(1, zoom - .25) })}>−</button><button aria-label="Restablecer mapa" onClick={() => change({ zoom: 1 })}>⌖</button><button aria-label="Mostrar cámaras" aria-pressed={nodesVisible} onClick={() => change({ nodesVisible: !nodesVisible })}><DashboardIcon name="camera" size={17} /></button></div>}
        <div className="ed-map-caption"><span>{level === "sps" ? "Red visual de demostración · Alertas del historial" : "Límites geográficos · Navegación por territorio"}</span><a href="/senttra/maps/SOURCES.md" target="_blank" rel="noreferrer">{level === "region" ? "Natural Earth" : level === "cortes" ? "ICF · geoBoundaries" : "© OpenStreetMap · geoBoundaries"} ↗</a></div>
      </div>
      {level === "sps" && <aside className="ed-city-feed" aria-label="Alertas de San Pedro Sula"><div className="ed-feed-heading"><div><p className="ed-eyebrow">EVIDENCIA DISPONIBLE</p><h3>En el radar</h3></div><DashboardIcon name="activity" size={23} /></div>
        <div className="ed-event-feed">{summary.events.length ? summary.events.slice(0, 5).map(item => <button key={item.uid} className="ed-map-event" onClick={() => onOpen(item)}>
          <div className={`ed-event-icon ${item.review === "confirmed" ? "ed-event-confirmed" : ""}`}><DashboardIcon name={item.kind === "uturn" ? "uturn" : item.kind === "rojo" ? "signal" : "incident"} size={19} /></div>
          <div><strong>{incidentTitle(item.kind ?? "incidente")}</strong><p>{item.title}</p><time>{historyTime(item.at ?? item.playback.at)}</time><span>{item.review === "confirmed" ? "Confirmada" : "Por revisar"}</span></div>
          {item.thumbnail_url && <img src={item.thumbnail_url} alt="" loading="lazy" />}
        </button>) : <p className="ed-empty">Sin alertas registradas.</p>}</div>
        <button className="ed-link-button" onClick={onIncidents}>Explorar las alertas <DashboardIcon name="arrow" size={17} /></button>
        <div className="ed-city-overview"><p className="ed-eyebrow">HISTORIAL ACUMULADO</p><div><span>Vueltas en U</span><strong>{numberText(summary.totals.uturn)}</strong></div><div><span>Cruces en rojo</span><strong>{numberText(summary.totals.rojo)}</strong></div></div>
        <button className="ed-solid-button" onClick={onCamera}><DashboardIcon name="camera" size={17} /> Abrir cámaras <DashboardIcon name="arrow" size={17} /></button>
      </aside>}
    </div>
  </section>;
}
