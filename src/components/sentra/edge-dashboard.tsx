"use client";

/* eslint-disable @next/next/no-img-element -- Private thumbnails need the signed-in browser session. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DashboardIcon, type DashboardIconName } from "./dashboard-icon";
import { CityDrawing, DashboardMap } from "./dashboard-map";
import { SentraLogoMark } from "./ui";
import { attributeLabel, loadDashboardMaps, numberText, SERIES, SWATCHES, warmCamera, type CatalogFilter, type DashboardCamera, type DashboardMaps, type DashboardSummary, type Distribution, type PortalScreen } from "@/lib/edge-dashboard";
import { historyTime, type HistoryItem } from "@/lib/history-detections";

type ExploreMode = "vehicle_colors" | "shirt_colors" | "vehicle_types" | "combined" | "similar" | "archive";
const choices: { id: ExploreMode; title: string; description: string; icon: DashboardIconName; label: string }[] = [
  { id: "vehicle_colors", title: "Color de vehículo", description: "Del color a la evidencia.", icon: "car", label: "PALETA VEHICULAR" },
  { id: "shirt_colors", title: "Color de vestimenta", description: "Encontrá personas por su camisa.", icon: "shirt", label: "PERSONAS" },
  { id: "vehicle_types", title: "Tipo de vehículo", description: "Cada vehículo, en su categoría.", icon: "layers", label: "CLASIFICACIÓN" },
  { id: "combined", title: "Búsqueda combinada", description: "Conectá tipo, color y cámara.", icon: "search", label: "BÚSQUEDA PRECISA" },
  { id: "similar", title: "Otras apariciones", description: "Compará un vehículo entre cámaras.", icon: "route", label: "CONTINUIDAD VISUAL" },
  { id: "archive", title: "Archivo de video", description: "Volvé a una cámara y un momento.", icon: "archive", label: "MEMORIA VISUAL" },
];
const formatPercent = (value: number) => new Intl.NumberFormat("es-HN", { style: "percent", maximumFractionDigits: 1 }).format(value);

export function DashboardLoading({ mapsReady = false, dataReady = false }: { mapsReady?: boolean; dataReady?: boolean }) {
  return <div className="ed-loading" role="status" aria-live="polite"><div className="ed-loading-mark"><span /><SentraLogoMark size={42} /></div><p className="ed-eyebrow">SENTTRA EDGE</p><h2>Preparando tu centro de control</h2><p>Una nueva perspectiva de tu ciudad.</p><div className="ed-loading-stages"><span className={mapsReady ? "ed-ready" : ""}>{mapsReady ? "✓" : "○"} Mapas y territorios</span><span className={dataReady ? "ed-ready" : ""}>{dataReady ? "✓" : "○"} Historial y evidencia</span></div></div>;
}

function MiniActivity({ summary }: { summary: DashboardSummary }) {
  const max = Math.max(1, ...summary.hours.map(hour => hour.vehicles));
  return <div className="ed-mini-activity" aria-hidden="true">{summary.hours.map(hour => <i key={hour.hour} style={{ height: `${Math.max(3, hour.vehicles / max * 100)}%` }} />)}</div>;
}

function MiniColors({ rows }: { rows: Distribution[] }) {
  const total = rows.reduce((sum, item) => sum + item.total, 0);
  let start = 0;
  const gradient = rows.filter(row => row.total).map(row => { const end = start + row.total / total * 360; const part = `${SWATCHES[row.key] ?? SERIES[0]} ${start}deg ${end}deg`; start = end; return part; }).join(",");
  return <div className="ed-mini-colors" aria-hidden="true"><div style={{ background: total ? `conic-gradient(${gradient})` : "#274c3d" }} /><span><DashboardIcon name="search" size={22} /></span></div>;
}

function Home({ summary, maps, onSearch, onOpen, onScreen }: { summary: DashboardSummary; maps: DashboardMaps; onSearch: (filters: CatalogFilter) => void; onOpen: (item: HistoryItem) => void; onScreen: (screen: PortalScreen) => void }) {
  const featured = summary.featured;
  return <section className="ed-home" aria-label="Inicio de Senttra">
    <div className="ed-home-map"><CityDrawing map={maps.sps} /></div>
    <div className="ed-home-hero"><div><p className="ed-eyebrow"><span className="ed-status-dot" /> SENTTRA ONE / CENTRO DE OPERACIONES</p><h1>Anticipación y<br /><em>seguridad inteligente.</em></h1><p>Observá. Comprendé. Anticipá.</p></div><div className="ed-hero-coordinate"><span>SAN PEDRO SULA</span><strong>HN <span>↗</span></strong><small>15.50° N · 88.03° W</small></div></div>
    <div className="ed-home-subhead"><span>Tu ciudad, conectada.</span><span>HISTORIAL ACUMULADO <i /></span></div>
    <div className="ed-home-grid">
      <button className="ed-card ed-card-count" data-dashboard-card="uturn" onClick={() => onSearch({ category: "incidents", kind: "uturn" })}><span className="ed-card-top"><span className="ed-card-icon"><DashboardIcon name="uturn" /></span><span className="ed-card-index">01 / MOVILIDAD</span><DashboardIcon name="arrow" size={19} /></span><strong className="ed-total">{numberText(summary.totals.uturn)}</strong><span className="ed-card-title">Vueltas en U</span><span className="ed-card-bottom">Maniobras registradas <span>Ver resultados ↗</span></span><svg className="ed-uturn-decoration" viewBox="0 0 150 130" aria-hidden="true"><path d="M118 128V48a35 35 0 0 0-70 0v45m-26-25 26 26 26-26" fill="none" stroke="currentColor" strokeWidth="13" /></svg></button>
      <button className="ed-card ed-card-count ed-red-card" data-dashboard-card="rojo" onClick={() => onSearch({ category: "incidents", kind: "rojo" })}><span className="ed-card-top"><span className="ed-card-icon"><DashboardIcon name="signal" /></span><span className="ed-card-index">02 / PREVENCIÓN</span><DashboardIcon name="arrow" size={19} /></span><strong className="ed-total">{numberText(summary.totals.rojo)}</strong><span className="ed-card-title">Cruces en rojo</span><span className="ed-card-bottom">Cruces registrados <span>Ver resultados ↗</span></span><span className="ed-signal-decoration" aria-hidden="true"><i /><i /><i /></span></button>
      <button className="ed-card ed-incident-card" data-dashboard-card="incidente" disabled={!featured} onClick={() => featured && onOpen(featured)}><span className="ed-card-top"><span className="ed-card-icon"><DashboardIcon name="incident" /></span><span className="ed-card-index">03 / EVIDENCIA</span><DashboardIcon name="arrow" size={19} /></span><span className="ed-incident-preview">{featured?.thumbnail_url ? <img src={featured.thumbnail_url} alt="Evidencia del incidente" /> : <DashboardIcon name="incident" size={42} />}<span className="ed-play-mark">▶</span><span className="ed-evidence-tag">{featured ? "CASO REGISTRADO" : "SIN CASOS"}</span></span><span className="ed-card-title">Incidentes</span><span className="ed-card-bottom">{featured ? featured.title : "Sin incidentes registrados"}<span>{featured ? "Abrir evidencia ↗" : ""}</span></span></button>
      <button className="ed-card ed-activity-card" data-dashboard-card="activity" onClick={() => onScreen("activity")}><span className="ed-card-top"><span className="ed-card-icon"><DashboardIcon name="activity" /></span><span className="ed-card-index">04 / PULSO URBANO</span><DashboardIcon name="arrow" size={19} /></span><MiniActivity summary={summary} /><span className="ed-card-title">Actividad por hora</span><span className="ed-card-bottom">El ritmo de la ciudad <span>Explorar actividad ↗</span></span></button>
      <button className="ed-card ed-explorer-card" data-dashboard-card="explorer" onClick={() => onScreen("explorer")}><span className="ed-card-top"><span className="ed-card-icon"><DashboardIcon name="search" /></span><span className="ed-card-index">05 / EXPLORACIÓN</span><DashboardIcon name="arrow" size={19} /></span><div className="ed-explorer-graphic"><MiniColors rows={summary.distributions.vehicle_colors} /><span><i /><i /><i /></span><DashboardIcon name="car" size={52} /><DashboardIcon name="shirt" size={37} /></div><span className="ed-card-title">Explorador</span><span className="ed-card-bottom">Colores, tipos y apariciones <span>Encontrar evidencia ↗</span></span></button>
      <button className="ed-card ed-control-card" data-dashboard-card="control" onClick={() => onScreen("control")}><span className="ed-card-top"><span className="ed-card-icon"><DashboardIcon name="map" /></span><span className="ed-card-index">06 / TERRITORIO</span><DashboardIcon name="arrow" size={19} /></span><div className="ed-control-graphic"><CityDrawing map={maps.sps} /><span className="ed-control-target"><i /><i /><i /></span></div><span className="ed-card-title">Centro de control</span><span className="ed-card-bottom">De la región a cada cámara <span>Entrar al mapa ↗</span></span></button>
    </div>
    <div className="ed-home-foot"><span><DashboardIcon name="layers" size={14} /> Una plataforma. Múltiples perspectivas.</span><span>LA INFORMACIÓN SE CONVIERTE EN ACCIÓN</span></div>
  </section>;
}

function DistributionView({ rows, mode, onSearch }: { rows: Distribution[]; mode: "vehicle_colors" | "shirt_colors" | "vehicle_types"; onSearch: (filters: CatalogFilter) => void }) {
  const isTypes = mode === "vehicle_types", total = rows.reduce((sum, row) => sum + row.total, 0), [hovered, setHovered] = useState<string | null>(null);
  const active = rows.find(row => row.key === hovered);
  const arcs = useMemo(() => {
    return rows.map((row, i) => ({ ...row, start: rows.slice(0, i).reduce((sum, previous) => sum + previous.total, 0) / Math.max(1, total) * 100, length: row.total / Math.max(1, total) * 100, color: isTypes ? SERIES[i % SERIES.length] : SWATCHES[row.key] ?? SERIES[i % SERIES.length] }));
  }, [rows, total, isTypes]);
  const choose = (key: string) => onSearch({ category: mode === "shirt_colors" ? "persons" : "vehicles", ...(isTypes ? { type: key } : { color: key }) });
  return <div className="ed-distribution"><div className="ed-donut-wrap"><svg viewBox="0 0 300 300" className="ed-donut" role="group" aria-label={isTypes ? "Distribución por tipo de vehículo" : "Distribución por color"}><circle cx="150" cy="150" r="112" fill="none" stroke="#19382a" strokeWidth="32" />{arcs.map(arc => <circle key={arc.key} cx="150" cy="150" r="112" fill="none" pathLength="100" stroke={arc.color} strokeWidth={hovered === arc.key ? "39" : "32"} strokeDasharray={`${Math.max(0, arc.length - .45)} ${100 - Math.max(0, arc.length - .45)}`} strokeDashoffset={-arc.start} transform="rotate(-90 150 150)" role="button" tabIndex={0} aria-label={`${attributeLabel(arc.key, isTypes)}: ${numberText(arc.total)}`} onMouseEnter={() => setHovered(arc.key)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(arc.key)} onBlur={() => setHovered(null)} onClick={() => choose(arc.key)} onKeyDown={event => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); choose(arc.key); } }} />)}</svg><div className="ed-donut-center"><span>{active ? attributeLabel(active.key, isTypes) : "APARICIONES"}</span><strong>{numberText(active?.total ?? total)}</strong><small>{active ? formatPercent(active.total / Math.max(1, total)) : "Historial acumulado"}</small></div></div><div className="ed-distribution-legend"><div className="ed-table-head"><span>{isTypes ? "TIPO DE VEHÍCULO" : "COLOR"}</span><span>APARICIONES</span></div>{arcs.map(arc => <button key={arc.key} className="ed-distribution-row" onMouseEnter={() => setHovered(arc.key)} onMouseLeave={() => setHovered(null)} onClick={() => choose(arc.key)}><span className="ed-attribute"><i style={{ background: arc.color }} />{attributeLabel(arc.key, isTypes)}</span><span className="ed-distribution-number">{numberText(arc.total)}<small>{formatPercent(arc.total / Math.max(1, total))}</small><DashboardIcon name="chevron" size={12} /></span><span className="ed-distribution-bar" style={{ width: `${arc.total / Math.max(1, total) * 100}%`, background: arc.color }} /></button>)}{!total && <p className="ed-empty">Todavía no hay apariciones clasificadas.</p>}</div><p className="ed-data-note">{mode === "shirt_colors" ? "Color de la prenda superior. " : "Clasificación de vehículos entre 7 a. m. y 6 p. m., hora de Honduras. "}Una misma unidad puede aparecer en distintas cámaras o sesiones.</p></div>;
}

function Explorer({ summary, cameras, onSearch, onArchive, busy }: { summary: DashboardSummary; cameras: DashboardCamera[]; onSearch: (filters: CatalogFilter) => void; onArchive: (camera: string, at: number) => void; busy: boolean }) {
  const [mode, setMode] = useState<ExploreMode | null>(null), [type, setType] = useState(""), [color, setColor] = useState(""), [camera, setCamera] = useState(""), [when, setWhen] = useState("");
  const current = choices.find(choice => choice.id === mode), typeOnly = ["bus", "camion", "camion_pequeno", "camion_grande"].includes(type);
  return <section className="ed-explorer" aria-label="Explorador"><div className="ed-section-head"><div><p className="ed-eyebrow">DE LOS DATOS A LA EVIDENCIA</p><h1>Explorador<span className="ed-title-dot">.</span></h1><p>Una pista es el comienzo. Elegí cómo explorar.</p></div><DashboardIcon name="search" size={38} /></div>
    {mode === null ? <div className="ed-explore-grid">{choices.map((choice, i) => <button key={choice.id} className="ed-explore-choice" onClick={() => setMode(choice.id)} data-explore-choice={choice.id}><span className="ed-explore-top"><span className="ed-eyebrow">{choice.label}</span><span>0{i + 1}</span></span><div className={`ed-explore-art ed-explore-art-${choice.id}`}><DashboardIcon name={choice.icon} size={65} />{choice.id.includes("color") && <span className="ed-art-swatches">{["#e5e6df", "#658aaf", "#df8882", "#85ba97"].map(value => <i key={value} style={{ background: value }} />)}</span>}</div><h2>{choice.title}</h2><p>{choice.description}</p><span className="ed-explore-open">Explorar <DashboardIcon name="arrow" size={18} /></span></button>)}</div> : <div className="ed-explorer-detail"><button className="ed-back" onClick={() => setMode(null)}>← Todas las búsquedas</button><div className="ed-detail-head"><div><p className="ed-eyebrow">{current?.label}</p><h2>{current?.title}</h2><p>{current?.description}</p></div><DashboardIcon name={current?.icon ?? "search"} size={34} /></div>
      {(mode === "vehicle_colors" || mode === "shirt_colors" || mode === "vehicle_types") && <DistributionView key={mode} rows={summary.distributions[mode]} mode={mode} onSearch={onSearch} />}
      {mode === "combined" && <form className="ed-search-form" onSubmit={event => { event.preventDefault(); onSearch({ category: "vehicles", ...(type ? { type } : {}), ...(color && !typeOnly ? { color } : {}), ...(camera ? { camera } : {}) }); }}><label>Tipo de vehículo<select aria-label="Tipo de vehículo" value={type} onChange={event => { setType(event.target.value); setColor(""); }}><option value="">Todos los tipos</option>{summary.distributions.vehicle_types.map(row => <option key={row.key} value={row.key}>{attributeLabel(row.key, true)}</option>)}</select></label><label>Color<select aria-label="Color" value={typeOnly ? "" : color} disabled={typeOnly} onChange={event => setColor(event.target.value)}><option value="">{typeOnly ? "Clasificación solo por tipo" : "Todos los colores"}</option>{summary.distributions.vehicle_colors.map(row => <option key={row.key} value={row.key}>{attributeLabel(row.key)}</option>)}</select></label><label>Cámara<select aria-label="Cámara" value={camera} onChange={event => setCamera(event.target.value)}><option value="">Todas las cámaras</option>{cameras.map(row => <option key={row.key} value={row.key}>{row.title}</option>)}</select></label><button className="ed-solid-button" disabled={busy} type="submit">Buscar apariciones <DashboardIcon name="arrow" size={18} /></button><p className="ed-data-note">La consulta abarca el historial acumulado. Tipo y color se consultan entre 7 a. m. y 6 p. m., hora de Honduras.</p></form>}
      {mode === "similar" && <div className="ed-similar"><div className="ed-similar-graphic"><DashboardIcon name="camera" size={40} /><i /><DashboardIcon name="car" size={58} /><i /><DashboardIcon name="camera" size={40} /></div><h3>Seguí una pista entre cámaras.</h3><p>Elegí un vehículo del historial y abrí <strong>Otras cámaras</strong> para comparar apariciones visualmente similares.</p><button className="ed-solid-button" disabled={busy} onClick={() => onSearch({ category: "vehicles" })}>Elegir un vehículo <DashboardIcon name="arrow" size={18} /></button><p className="ed-data-note">La similitud visual es una sugerencia para revisar, sin confirmar identidad.</p></div>}
      {mode === "archive" && <form className="ed-search-form ed-archive-form" onSubmit={event => { event.preventDefault(); const at = Date.parse(`${when}-06:00`) / 1000; if (Number.isFinite(at) && camera) onArchive(camera, at); }}><label>Cámara<select aria-label="Cámara" value={camera} required onChange={event => setCamera(event.target.value)}><option value="">Elegí una cámara</option>{cameras.map(row => <option key={row.key} value={row.key}>{row.title}</option>)}</select></label><label>Fecha y hora de Honduras<input aria-label="Fecha y hora de Honduras" type="datetime-local" value={when} required onChange={event => setWhen(event.target.value)} /></label><button className="ed-solid-button" disabled={busy || !camera || !when} type="submit">Abrir grabación <DashboardIcon name="arrow" size={18} /></button><p className="ed-data-note">Abrí el video guardado en un momento exacto, incluso si no hay detecciones.</p></form>}
    </div>}
  </section>;
}

function Activity({ summary }: { summary: DashboardSummary }) {
  const [hover, setHover] = useState<number | null>(null), max = Math.max(1, ...summary.hours.map(row => row.vehicles)), eventMax = Math.max(1, ...summary.hours.map(row => Math.max(row.uturn, row.rojo)));
  const width = 1000, left = 62, right = 50, top = 28, bottom = 300, cell = (width - left - right) / 24;
  const x = (hour: number) => left + cell * (hour + .5), y = (value: number, maxValue = max) => bottom - value / maxValue * (bottom - top);
  const lines = (["uturn", "rojo"] as const).map(key => ({ key, d: summary.hours.map((row, i) => `${i ? "L" : "M"}${x(row.hour)},${y(row[key], eventMax)}`).join(" ") }));
  const selected = summary.hours.find(row => row.hour === hover);
  return <section className="ed-activity" aria-label="Actividad por hora"><div className="ed-section-head"><div><p className="ed-eyebrow">EL PULSO DE LA CIUDAD</p><h1>Actividad por hora<span className="ed-title-dot">.</span></h1><p>Cómo se distribuye el movimiento a lo largo del día.</p></div><DashboardIcon name="activity" size={38} /></div><div className="ed-chart-panel"><div className="ed-chart-heading"><div><h2>El ritmo urbano</h2><p>Historial acumulado · Hora de Honduras</p></div><div className="ed-chart-legend"><span><i />Vehículos</span><span><i />Vueltas en U</span><span><i />Cruces en rojo</span></div></div>
    <div className="ed-chart-reading" aria-live="polite">{selected ? <><strong>{String(selected.hour).padStart(2, "0")}:00</strong><span>{numberText(selected.vehicles)} vehículos</span><span>{numberText(selected.uturn)} vueltas en U</span><span>{numberText(selected.rojo)} cruces en rojo</span></> : <span>Pasá sobre una hora o seleccionála para ver sus registros.</span>}</div>
    <div className="ed-chart-scroll"><svg viewBox="0 0 1000 350" className="ed-full-chart" role="group" aria-label="Gráfica de actividad acumulada por hora"><defs><linearGradient id="ed-bar-gradient" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#56d7a3" /><stop offset="1" stopColor="#194f3b" /></linearGradient></defs>{[0, .25, .5, .75, 1].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick * max)} y2={y(tick * max)} stroke="#244235" strokeDasharray="3 5" /><text x={left - 14} y={y(tick * max) + 4} textAnchor="end">{numberText(Math.round(tick * max))}</text><text x={width - right + 12} y={y(tick * max) + 4}>{numberText(Math.round(tick * eventMax))}</text></g>)}
      {summary.hours.map(row => <g key={row.hour} role="button" tabIndex={0} aria-label={`${row.hour}:00, ${row.vehicles} vehículos, ${row.uturn} vueltas en U, ${row.rojo} cruces en rojo`} onMouseEnter={() => setHover(row.hour)} onFocus={() => setHover(row.hour)} onClick={() => setHover(row.hour)} onKeyDown={event => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); setHover(row.hour); } }}><rect x={x(row.hour) - cell / 2} y={top} width={cell} height={bottom - top} fill={hover === row.hour ? "#3dd68c15" : "transparent"} /><rect x={x(row.hour) - cell * .29} y={y(row.vehicles)} width={cell * .58} height={Math.max(0, bottom - y(row.vehicles))} rx="3" fill="url(#ed-bar-gradient)" /><text x={x(row.hour)} y={bottom + 25} textAnchor="middle">{String(row.hour).padStart(2, "0")}</text></g>)}
      {lines.map(line => <path key={line.key} d={line.d} fill="none" stroke={line.key === "uturn" ? "#d5c382" : "#e7897c"} strokeWidth="2" className="ed-chart-line" />)}<text x="62" y="14">VEHÍCULOS</text><text x="950" y="14" textAnchor="end">INCIDENCIAS</text><text x="505" y="345" textAnchor="middle">HORA DEL DÍA</text></svg></div><p className="ed-data-note">Apariciones por cámara y sesión, agrupadas por hora del día en todo el historial. Las incidencias usan la escala de la derecha.</p>
    </div></section>;
}

export function EdgeDashboard({ screen, onScreen, cameras, onExpired, onSearch, onOpen, onCamera, onArchive, busy }: { screen: PortalScreen; onScreen: (screen: PortalScreen) => void; cameras: DashboardCamera[]; onExpired: () => void; onSearch: (filters: CatalogFilter) => void; onOpen: (item: HistoryItem) => void; onCamera: () => void; onArchive: (camera: string, at: number) => void; busy: boolean }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null), [maps, setMaps] = useState<DashboardMaps | null>(null), [error, setError] = useState(""), [mapError, setMapError] = useState(""), [retry, setRetry] = useState(0);
  const sources = JSON.stringify(cameras.map(({ key, receiving, url, preview_url }) => ({ key, receiving, url, preview_url })));
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    void loadDashboardMaps().then(value => { if (!controller.signal.aborted) { setMaps(value); setMapError(""); } }).catch(reason => { if (!controller.signal.aborted) setMapError((reason as Error).message); });
    const load = async () => {
      const attempt = new AbortController(), timeout = setTimeout(() => attempt.abort(), 90000), cancel = () => attempt.abort();
      controller.signal.addEventListener("abort", cancel);
      try {
        const response = await fetch("/edge/api/history/dashboard", { cache: "no-store", signal: attempt.signal });
        if (response.status === 401) { onExpired(); return; }
        if (!response.ok) throw new Error("No se pudo cargar el historial acumulado.");
        const value: DashboardSummary = await response.json();
        if (!controller.signal.aborted) { setSummary(value); setError(""); }
      } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).name === "AbortError" ? "La preparación está demorando. Volvé a intentar." : (reason as Error).message); }
      finally { clearTimeout(timeout); controller.signal.removeEventListener("abort", cancel); }
      if (!controller.signal.aborted) timer = setTimeout(load, 60000);
    };
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [retry, onExpired]);
  useEffect(() => {
    const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 15000);
    const rows: DashboardCamera[] = JSON.parse(sources);
    void (async () => {
      // Bound preload work to two camera streams at once; then prepare the rest.
      for (let i = 0; i < rows.length && !controller.signal.aborted; i += 2) await Promise.allSettled(rows.slice(i, i + 2).map(camera => warmCamera(camera, controller.signal)));
    })();
    return () => { controller.abort(); clearTimeout(deadline); };
  }, [sources]);
  useEffect(() => {
    if (!summary) return;
    const images = [summary.featured, ...summary.events.slice(0, 4)].filter((item): item is HistoryItem => !!item?.thumbnail_url).map(item => { const image = new Image(); image.src = item.thumbnail_url!; return image; });
    return () => { images.forEach(image => { image.removeAttribute("src"); }); };
  }, [summary]);
  if ((!summary || !maps) && (error || mapError)) return <div className="ed-load-error" role="alert"><DashboardIcon name="incident" size={35} /><h2>No se pudo preparar la vista</h2><p>{error || mapError}</p><button className="ed-solid-button" onClick={() => { setError(""); setMapError(""); setRetry(value => value + 1); }}>Volver a intentar <DashboardIcon name="arrow" size={17} /></button></div>;
  if (!summary || !maps) return <DashboardLoading mapsReady={!!maps} dataReady={!!summary} />;
  return <div className="ed-dashboard" style={{ "--ed-accent": "#72e2b4" } as CSSProperties}>{error && <div role="status" className="ed-refresh-error">{error} Se conserva la última actualización.</div>}{screen === "home" && <Home summary={summary} maps={maps} onSearch={onSearch} onOpen={onOpen} onScreen={onScreen} />}<div hidden={screen !== "explorer"}><Explorer summary={summary} cameras={cameras} onSearch={onSearch} onArchive={onArchive} busy={busy} /></div>{screen === "activity" && <Activity summary={summary} />}<div hidden={screen !== "control"}><DashboardMap maps={maps} summary={summary} onCamera={onCamera} onOpen={onOpen} onIncidents={() => onSearch({ category: "incidents" })} /></div><span className="sr-only">Último caso: {summary.featured ? historyTime(summary.featured.at ?? summary.featured.playback.at) : "Sin registros"}</span></div>;
}
