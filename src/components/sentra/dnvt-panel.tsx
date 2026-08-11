"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

// Panel DNVT: registro administrativo del día — TODAS las faltas de todas las cámaras en una
// tabla (correlativo, hora, cámara, tipo, vehículo), con evidencia en video (cajas dibujadas
// sobre el crudo, la falta resaltada), estado administrativo por falta (pendiente / boleta
// emitida / desestimada + nota, se guarda en el backend) y exportación a CSV. Las faltas que
// el control de calidad marcó incorrectas se ocultan por defecto (toggle para verlas).

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";

const TIPO: Record<number, string> = { 2: "Auto", 3: "Moto", 5: "Bus", 7: "Camión" };
const nf = (n: number) => n.toLocaleString("es-HN");

type Infr = {
  kind: "giro" | "uturn" | "rojo"; id: number; hh: string; t: number;
  tipo?: string; key?: string; why?: string;
};
type Cam = {
  id: string; nombre: string; hours: Record<string, { n_veh: number }>;
  n_veh: number; n_giro: number; n_rojo: number; infr: Infr[];
};
type Dia = { fecha: string; cams: Cam[]; totales: { veh: number; giro: number; rojo: number; n_cams: number } };
type Det = {
  fps: number; nw: number; nh: number;
  ids: Record<string, number>; boxes: Record<string, [number, number, number, number, number][]>;
};
type Falta = Infr & { cam: string; camName: string; camShort: string; n: number };
type Rev = { verdict: string; reason: string };
type Estado = { estado: string; nota: string; ts?: number };

const KIND_LABEL: Record<string, string> = { giro: "Giro indebido", uturn: "Vuelta en U", rojo: "Cruce en rojo" };
const KIND_TAG: Record<string, string> = { giro: "GIRO", uturn: "U", rojo: "ROJO" };
const ESTADOS = [
  { k: "boleta", label: "Boleta emitida", on: "border-accent bg-[#123a2a] text-accent" },
  { k: "desestimada", label: "Desestimada", on: "border-danger bg-[#2a1512] text-danger" },
  { k: "pendiente", label: "Pendiente", on: "border-[var(--border-strong)] bg-bg-input text-text" },
] as const;
const QA_BADGE: Record<string, { label: string; cls: string }> = {
  correcta: { label: "Validada", cls: "text-accent" },
  incorrecta: { label: "Descartada", cls: "text-danger" },
  dudosa: { label: "En análisis", cls: "text-warning" },
};

// "1 Calle - 14 Avenida N.O (Seguros Atlantida)" -> "Seguros Atlantida"
const shortName = (nombre: string, id: string) => {
  const paren = nombre.match(/\(([^)]+)\)/)?.[1] ?? nombre.split("-").pop()?.trim() ?? id;
  const suf = nombre.match(/_\s*0?(\d+)\s*$/)?.[1];
  return paren.replace(/\s*_\s*0?\d+\s*$/, "") + (suf ? ` _${suf}` : "");
};
const horaDe = (f: Infr) =>
  `${f.hh}:${String(Math.floor(f.t / 60)).padStart(2, "0")}:${String(Math.floor(f.t % 60)).padStart(2, "0")}`;
const corr = (n: number) => `F-${String(n).padStart(3, "0")}`;

export function DnvtPanel({ token, api = API }: { token: string; api?: string }) {
  const [data, setData] = useState<Dia | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Rev>>({});
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [modal, setModal] = useState<Falta | null>(null);
  const [fCam, setFCam] = useState("all");
  const [fKind, setFKind] = useState("all");
  const [fEstado, setFEstado] = useState("all");
  const [fHour, setFHour] = useState("all");
  const [conQA, setConQA] = useState(false);   // mostrar también las descartadas por control de calidad
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const media = useCallback((p: string) => `${api}/data/${p}?k=${encodeURIComponent(token)}`, [token, api]);

  useEffect(() => {
    const q = `?k=${encodeURIComponent(token)}&_=${Date.now()}`;
    fetch(`${api}/api/dia${q}`).then((r) => r.json()).then(setData).catch((e) => setErr(String(e)));
    fetch(`${api}/api/reviews${q}`).then((r) => r.json()).then((m) => setReviews(m ?? {})).catch(() => {});
    fetch(`${api}/api/dnvt-status${q}`).then((r) => r.json()).then((m) => setEstados(m ?? {})).catch(() => {});
  }, [token, api]);

  useEffect(() => { setPage(0); }, [fCam, fKind, fEstado, fHour, conQA]);

  // todas las faltas del día, ordenadas por hora; el correlativo se asigna ANTES de filtrar
  // (así F-042 es F-042 en cualquier vista y en el CSV)
  const faltas = useMemo<Falta[]>(() => {
    if (!data) return [];
    const list = data.cams.flatMap((c) =>
      c.infr.map((v) => ({ ...v, cam: c.id, camName: c.nombre, camShort: shortName(c.nombre, c.id), n: 0 })));
    list.sort((a, b) => a.hh.localeCompare(b.hh) || a.t - b.t);
    list.forEach((f, i) => { f.n = i + 1; });
    return list;
  }, [data]);

  const estadoDe = (f: Falta) => (f.key && estados[f.key]?.estado) || "pendiente";
  const qaDe = (f: Falta) => (f.key ? reviews[f.key]?.verdict : undefined);

  // base = faltas visibles (post control de calidad); sobre esa base van KPIs y gráfico
  const visibles = useMemo(() => faltas.filter((f) => conQA || qaDe(f) !== "incorrecta"),
    [faltas, reviews, conQA]);   // eslint-disable-line react-hooks/exhaustive-deps
  const preHour = useMemo(() => visibles.filter((f) =>
    (fCam === "all" || f.cam === fCam) &&
    (fKind === "all" || f.kind === fKind) &&
    (fEstado === "all" || estadoDe(f) === fEstado)),
    [visibles, fCam, fKind, fEstado, estados]);   // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => preHour.filter((f) => fHour === "all" || f.hh === fHour), [preHour, fHour]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  const nBoletas = visibles.filter((f) => estadoDe(f) === "boleta").length;
  const nDesest = visibles.filter((f) => estadoDe(f) === "desestimada").length;
  const byHour = useMemo(() => {
    const m: Record<string, number> = {};
    preHour.forEach((f) => { m[f.hh] = (m[f.hh] ?? 0) + 1; });
    return m;
  }, [preHour]);

  const postEstado = useCallback(async (f: Falta, patch: { estado?: string; nota?: string }) => {
    if (!f.key) return;
    const prev = estados[f.key] ?? { estado: "pendiente", nota: "" };
    const next: Estado = { estado: patch.estado ?? prev.estado, nota: patch.nota ?? prev.nota };
    setEstados((s) => ({ ...s, [f.key!]: next }));
    try {
      await fetch(`${api}/api/dnvt-status?k=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: f.key, cam: f.cam, kind: f.kind, id: f.id, hh: f.hh, ...next }),
      });
    } catch {}
  }, [estados, api, token]);

  const exportCsv = () => {
    if (!data) return;
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((f) => [
      corr(f.n), data.fecha, horaDe(f), f.camName, KIND_LABEL[f.kind], f.tipo ?? "", f.id,
      estadoDe(f), (f.key && estados[f.key]?.nota) || "",
      qaDe(f) ? QA_BADGE[qaDe(f)!].label : "", f.why ?? "",
    ].map(esc).join(","));
    const head = ["correlativo", "fecha", "hora", "camara", "falta", "vehiculo", "id_vehiculo",
      "estado_dnvt", "nota", "control_calidad", "motivo_deteccion"].join(",");
    const blob = new Blob(["﻿" + [head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `faltas_dnvt_${data.fecha}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (err) return <DnvtShell><p className="rounded-xl border border-[var(--border-strong)] bg-bg-card p-4 font-mono text-sm text-text-muted">No se pudo cargar el backend: {err}</p></DnvtShell>;
  if (!data) return <DnvtShell><p className="animate-sn-pulse font-mono text-sm text-text-muted">Cargando registro del día…</p></DnvtShell>;

  const fecha = new Date(`${data.fecha}T12:00:00`).toLocaleDateString("es-HN",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const selCls = "appearance-none rounded-lg border border-[var(--border-strong)] bg-[#0f241b] px-3.5 py-2.5 font-sans text-[13px] text-text outline-none";
  const pageBtn = "rounded-lg border border-[var(--border-strong)] px-3 py-2 font-mono text-[12px] text-text-muted transition-colors hover:text-accent disabled:opacity-35 disabled:hover:text-text-muted";

  return (
    <DnvtShell>
      {/* encabezado del registro */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-6">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Registro diario de faltas</div>
          <div className="mt-2 font-display text-[26px] font-extrabold capitalize leading-tight text-text">{fecha}</div>
          <div className="mt-1 font-mono text-[11px] text-text-faint">{data.totales.n_cams} cámaras · corredor 1a Calle / Bulevar Morazán · San Pedro Sula</div>
        </div>
        <button onClick={exportCsv}
          className="cursor-pointer rounded-lg border border-accent px-4 py-2.5 font-mono text-[12px] font-semibold text-accent transition-colors hover:bg-[#123a2a]">
          ⬇ Exportar CSV ({nf(filtered.length)})
        </button>
      </div>

      {/* KPIs del día */}
      <div className="mb-4 grid grid-cols-2 divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        {[
          { v: nf(visibles.length), l: "Faltas del día", c: "text-danger" },
          { v: String(visibles.filter((f) => f.kind !== "rojo").length), l: "Giros y vueltas en U", c: "text-text" },
          { v: String(visibles.filter((f) => f.kind === "rojo").length), l: "Cruces en rojo", c: "text-text" },
          { v: String(nBoletas), l: "Boletas emitidas", c: "text-accent" },
          { v: String(nDesest), l: "Desestimadas", c: "text-text-muted" },
        ].map((k) => (
          <div key={k.l} className="p-5">
            <div className={`font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] sm:text-[36px] ${k.c}`}>{k.v}</div>
            <div className="mt-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">{k.l}</div>
          </div>
        ))}
      </div>

      {/* faltas por hora (clic = filtrar esa hora) */}
      <div className="mb-4 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Faltas por hora</div>
          {fHour !== "all" && (
            <button onClick={() => setFHour("all")} className="cursor-pointer font-mono text-[11px] text-accent hover:underline">
              viendo {fHour}:00 · ver todo el día
            </button>
          )}
        </div>
        <HourBars byHour={byHour} current={fHour} onPick={(hk) => setFHour(fHour === hk ? "all" : hk)} />
      </div>

      {/* filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-5">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Cámara</span>
          <select value={fCam} onChange={(e) => setFCam(e.target.value)} className={selCls}>
            <option value="all">Todas</option>
            {data.cams.map((c) => <option key={c.id} value={c.id}>{shortName(c.nombre, c.id)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Tipo de falta</span>
          <select value={fKind} onChange={(e) => setFKind(e.target.value)} className={selCls}>
            <option value="all">Todas</option>
            <option value="giro">Giro indebido</option>
            <option value="uturn">Vuelta en U</option>
            <option value="rojo">Cruce en rojo</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Estado</span>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={selCls}>
            <option value="all">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="boleta">Boleta emitida</option>
            <option value="desestimada">Desestimada</option>
          </select>
        </label>
        <button onClick={() => setConQA((s) => !s)} className="flex items-center gap-2.5 py-2.5 font-sans text-[13px] text-text">
          <span className={`grid size-4 place-items-center rounded border ${conQA ? "border-warning bg-warning text-[#081411]" : "border-[var(--border-strong)]"}`}>{conQA ? "✓" : ""}</span>
          Incluir descartadas por control de calidad
        </button>
        <button onClick={() => { setFCam("all"); setFKind("all"); setFEstado("all"); setFHour("all"); setConQA(false); }}
          className="py-2.5 font-sans text-[13px] text-text-muted transition-colors hover:text-accent">Limpiar</button>
      </div>

      {/* tabla del registro */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel">
        <div className="flex items-baseline gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Detalle de faltas</div>
          <div className="font-display text-lg font-extrabold text-text">{nf(filtered.length)}</div>
          {filtered.length !== visibles.length && <div className="font-mono text-[11px] text-text-faint">de {nf(visibles.length)} del día</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border)] font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                {["Nº", "Hora", "Cámara / cruce", "Falta", "Vehículo", "Calidad", "Estado DNVT", "Nota", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((f) => {
                const est = estadoDe(f);
                const qa = qaDe(f);
                const nota = (f.key && estados[f.key]?.nota) || "";
                return (
                  <tr key={f.key ?? `${f.cam}:${f.kind}:${f.id}:${f.hh}`}
                    className={`border-b border-[var(--border)] transition-colors hover:bg-bg-card ${qa === "incorrecta" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-text">{corr(f.n)}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-accent">{horaDe(f)}</td>
                    <td className="px-4 py-2.5 font-sans text-[12.5px] text-text">{f.camShort}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[10px] font-bold ${f.kind === "rojo" ? "bg-[#2a0f14] text-[#ff8598]" : "bg-[#2a1512] text-danger"}`}>
                        {KIND_TAG[f.kind]}
                      </span>
                      <span className="ml-2 font-sans text-[12px] text-text-muted">{KIND_LABEL[f.kind]}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-text-muted">{f.tipo ?? "—"} #{f.id}</td>
                    <td className={`px-4 py-2.5 font-mono text-[10.5px] ${qa ? QA_BADGE[qa].cls : "text-text-faint"}`}>{qa ? QA_BADGE[qa].label : "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {ESTADOS.map((e) => (
                          <button key={e.k} onClick={() => postEstado(f, { estado: e.k })} title={e.label}
                            className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[9.5px] transition-colors ${est === e.k ? e.on : "border-[var(--border)] bg-bg-input text-text-faint hover:border-text-muted"}`}>
                            {e.k === "boleta" ? "Boleta" : e.k === "desestimada" ? "Desest." : "Pend."}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        value={nota}
                        placeholder="nota…"
                        onChange={(e) => f.key && setEstados((s) => ({ ...s, [f.key!]: { estado: s[f.key!]?.estado ?? "pendiente", nota: e.target.value } }))}
                        onBlur={() => postEstado(f, {})}
                        className="w-[130px] rounded-md border border-[var(--border)] bg-bg-input px-2 py-1.5 font-mono text-[10.5px] text-text outline-none placeholder:text-text-faint focus:border-accent"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setModal(f)}
                        className="cursor-pointer whitespace-nowrap rounded-md border border-[var(--border-strong)] px-2.5 py-1.5 font-mono text-[10px] text-text-muted transition-colors hover:border-accent hover:text-accent">
                        ▶ Evidencia
                      </button>
                    </td>
                  </tr>
                );
              })}
              {slice.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-8 text-center font-mono text-xs text-text-faint">Sin faltas para este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] py-4">
            <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className={pageBtn}>‹ Anterior</button>
            <span className="px-2 font-mono text-[12px] text-text-muted">{cur + 1} / {pages}</span>
            <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={pageBtn}>Siguiente ›</button>
          </div>
        )}
      </div>

      {modal && (
        <EvidenceModal api={api} token={token} falta={modal} media={media}
          estado={estadoDe(modal)} onEstado={(k) => void postEstado(modal, { estado: k })}
          onClose={() => setModal(null)} />
      )}
    </DnvtShell>
  );
}

// Barras de faltas por hora (24 slots); clic filtra la tabla a esa hora.
function HourBars({ byHour, current, onPick }: {
  byHour: Record<string, number>; current: string; onPick: (hk: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  const max = Math.max(1, ...hours.map((hk) => byHour[hk] ?? 0));
  const VBW = 1180, VBH = 180, padL = 34, padB = 26, padT = 10;
  const plotW = VBW - padL - 10, plotH = VBH - padT - padB, baseY = padT + plotH;
  const slot = plotW / 24, barW = slot * 0.6;
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" className="mt-4 block h-auto select-none" role="img">
      {[0, 0.5, 1].map((g) => {
        const y = baseY - g * plotH;
        return (
          <g key={g}>
            <line x1={padL} y1={y} x2={VBW - 10} y2={y} stroke="rgba(141,168,154,.10)" strokeWidth={1} />
            <text x={padL - 8} y={y + 3} fill="#5f7468" fontFamily="IBM Plex Mono, monospace" fontSize={9} textAnchor="end">{Math.round(g * max)}</text>
          </g>
        );
      })}
      {hours.map((hk, i) => {
        const v = byHour[hk] ?? 0;
        const h = (v / max) * plotH;
        const x = padL + slot * i + slot / 2;
        const on = current === hk;
        return (
          <g key={hk} onClick={() => v > 0 && onPick(hk)} className={v > 0 ? "cursor-pointer" : undefined}>
            <title>{`${hk}:00 · ${v} faltas`}</title>
            <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
            {v > 0 && <rect x={x - barW / 2} y={baseY - h} width={barW} height={h} rx={1.5}
              fill={on ? "#3dd68c" : "#b04a42"} className="transition-[fill] hover:brightness-125" />}
            {i % 3 === 0 && <text x={x} y={baseY + 16} fill="#5f7468" fontFamily="IBM Plex Mono, monospace" fontSize={9} textAnchor="middle">{hk}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// Visor de evidencia: video de la hora con cajas sobre el crudo; la falta va resaltada en rojo
// y el resto de vehículos apagados. Arranca 3 s antes del momento de la falta.
function EvidenceModal({ api, token, falta, media, estado, onEstado, onClose }: {
  api: string; token: string; falta: Falta; media: (p: string) => string;
  estado: string; onEstado: (k: string) => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detRef = useRef<Det | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let dead = false;
    fetch(media(`${falta.cam}/det/${falta.hh}.json`) + "&_=" + Date.now())
      .then((r) => r.json()).then((d: Det) => { if (!dead) detRef.current = d; }).catch(() => {});
    const v = videoRef.current;
    if (v) {
      v.onloadedmetadata = () => {
        try { v.currentTime = Math.max(0, falta.t - 3); } catch {}
        void v.play().catch(() => {});
      };
      const ready = () => setLoading(false);
      ["playing", "canplay", "loadeddata", "error"].forEach((e) => v.addEventListener(e, ready));
      v.src = media(`${falta.cam}/video/${falta.hh}.mp4`);
      v.load();
    }
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falta]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current, c = canvasRef.current, d = detRef.current;
      if (v && c) {
        if (c.width !== c.clientWidth) { c.width = c.clientWidth; c.height = c.clientHeight; }
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          if (d && !v.seeking && v.readyState >= 2) {
            const slot = Math.round(v.currentTime * d.fps);
            const boxes = d.boxes[slot] ?? d.boxes[slot - 1] ?? d.boxes[slot + 1];
            const sx = c.width / d.nw, sy = c.height / d.nh;
            const drawn = new Set<number>();
            if (boxes) for (const [id, x, y, w, h] of boxes) {
              if (drawn.has(id)) continue;
              drawn.add(id);
              const esLaFalta = id === falta.id;
              ctx.strokeStyle = esLaFalta ? "#ff2f4d" : "rgba(141,168,154,.4)";
              ctx.lineWidth = esLaFalta ? 3 : 1;
              ctx.strokeRect(x * sx, y * sy, w * sx, h * sy);
              if (esLaFalta) {
                const lb = `${falta.tipo ?? TIPO[d.ids[id] ?? 2] ?? ""} #${id} ⚠`;
                ctx.font = "600 12px ui-monospace, monospace";
                ctx.fillStyle = "#ff2f4d";
                ctx.fillRect(x * sx - 1, y * sy - 18, ctx.measureText(lb).width + 10, 17);
                ctx.fillStyle = "#081411";
                ctx.fillText(lb, x * sx + 4, y * sy - 5);
              }
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [falta]);

  const rejump = () => {
    const v = videoRef.current;
    if (v) { try { v.currentTime = Math.max(0, falta.t - 3); } catch {} void v.play().catch(() => {}); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(4,10,8,0.82)] p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[880px] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Evidencia · <span className="text-text">{corr(falta.n)}</span> · {KIND_LABEL[falta.kind]}
            </div>
            <div className="mt-1 truncate font-mono text-[10.5px] text-text-faint">
              {falta.camName} · {horaDe(falta)} · {falta.tipo ?? "vehículo"} #{falta.id}
            </div>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-md border border-[var(--border)] px-2.5 py-1.5 font-mono text-[11px] text-text-muted transition-colors hover:border-danger hover:text-danger">✕ Cerrar</button>
        </div>
        <div className="relative aspect-video bg-bg">
          <video ref={videoRef} muted playsInline preload="metadata" controls className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-[rgba(8,20,17,0.55)]">
              <span className="size-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Cargando</span>
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          {falta.why && <p className="mb-3 rounded-md bg-bg-card px-3 py-2.5 font-mono text-[11px] leading-relaxed text-text-muted">↳ {falta.why}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={rejump} className="cursor-pointer rounded-md border border-[var(--border-strong)] px-3 py-1.5 font-mono text-[11px] text-text-muted transition-colors hover:border-accent hover:text-accent">⟲ Volver a la falta</button>
            <span className="mx-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">Estado:</span>
            {ESTADOS.map((e) => (
              <button key={e.k} onClick={() => onEstado(e.k)}
                className={`cursor-pointer rounded-md border px-2.5 py-1.5 font-mono text-[10.5px] transition-colors ${estado === e.k ? e.on : "border-[var(--border)] bg-bg-input text-text-faint hover:border-text-muted"}`}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DnvtShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-bg text-text">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(8,20,17,0.9)] px-6 py-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <SentraLogoMark size={26} />
          <SentraWordmark />
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-accent">DNVT</span>
        </Link>
        <div className="text-right font-mono text-[11px] leading-relaxed text-text-faint">
          Dirección Nacional de Vialidad y Transporte<br />registro diario de faltas · San Pedro Sula
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
