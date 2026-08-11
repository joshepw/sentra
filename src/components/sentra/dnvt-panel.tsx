"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

// Panel DNVT (demo): registro administrativo del día — TODAS las faltas de todas las cámaras
// en una tabla, con evidencia en video (cajas sobre el crudo, la falta resaltada), EXPEDIENTE
// SIMULADO por vehículo (placa + propietario ficticios, generados determinísticamente a partir
// de la falta: siempre los mismos para la misma falta, sin base de datos) y flujo de emisión
// de boleta: tipificación real de la Ley de Tránsito (Decreto 205-2005), multa con recargo por
// reincidencia, boleta imprimible. Todo dato personal está rotulado como FICTICIO.

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

// ---- Tipificación legal (Ley de Tránsito, Decreto 205-2005) ----
// El cruce en rojo y el irrespeto a la señalización vial son infracciones GRAVES (numeral 10
// del listado de infracciones graves); la multa de las graves es L 600.00 (Art. 101). La
// reincidencia dentro del año aumenta la multa 50% y suspende la licencia 6 meses.
const LEGAL: Record<string, { texto: string; categoria: string }> = {
  rojo: { texto: "Irrespetar la señal de alto o la luz roja de un semáforo (infracciones graves, num. 10)", categoria: "GRAVE" },
  giro: { texto: "Irrespetar la señalización vial y otros instrumentos de control de tráfico (infracciones graves, num. 10)", categoria: "GRAVE" },
  uturn: { texto: "Irrespetar la señalización vial — vuelta en U en tramo no permitido (infracciones graves, num. 10)", categoria: "GRAVE" },
};
const MULTA_GRAVE = 600;   // L 600.00, Art. 101 Ley de Tránsito

// ---- Expediente FICTICIO determinístico (misma falta -> mismos datos, sin base de datos) ----
type Expediente = {
  placa: string; marca: string; modelo: string; color: string; anio: number;
  nombre: string; dni: string; licencia: string; direccion: string; telefono: string;
  previas: number;   // faltas previas en el año (para el recargo por reincidencia)
};
// el tipo de vehículo no siempre viene en `tipo`: el pipeline lo deja al final del `why`
// ("… Vehículo: Auto."), de ahí se rescata para el expediente y la tabla
const tipoDe = (f: Infr) => f.tipo ?? f.why?.match(/Vehículo:\s*([A-Za-zÁÉÍÓÚáéíóúñ]+)/)?.[1];

const hashSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const mkRng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const NOMBRES = ["Carlos Alberto", "José Luis", "Marvin Alexander", "Denis Omar", "Wilmer Antonio",
  "María José", "Ana Lucía", "Karla Patricia", "Sandra Elizabeth", "Jorge Armando",
  "Héctor Manuel", "Fanny Carolina", "Óscar Rolando", "Elvin Josué", "Gabriela Alejandra"];
const APELLIDOS = ["Mejía", "Paz", "Rivera", "Cruz", "Hernández", "López", "Castro", "Zelaya",
  "Pineda", "Fúnez", "Membreño", "Carranza", "Sabillón", "Interiano", "Bográn"];
const COLONIAS = ["Col. Jardines del Valle", "Barrio Guamilito", "Col. Trejo", "Col. Universidad",
  "Col. Fesitranh", "Barrio Barandillas", "Res. Villas del Sol", "Col. Las Palmas",
  "Col. Satélite", "Col. Moderna"];
const AUTOS = [["Toyota", "Corolla"], ["Honda", "Civic"], ["Hyundai", "Accent"], ["Nissan", "Sentra"],
  ["Kia", "Rio"], ["Toyota", "Hilux"], ["Mitsubishi", "Lancer"], ["Suzuki", "Swift"]];
const MOTOS = [["Honda", "CG-125"], ["Yamaha", "YBR-125"], ["Suzuki", "GN-125"], ["Freedom", "Fénix 150"],
  ["Serpento", "Cobra 200"], ["Génesis", "GXT-150"]];
const BUSES = [["Toyota", "Coaster"], ["Hyundai", "County"], ["Blue Bird", "Vision"]];
const CAMIONES = [["Isuzu", "NPR"], ["Hino", "Dutro"], ["Freightliner", "M2"]];
const COLORES = ["blanco", "gris", "negro", "rojo", "azul", "plateado"];
const LETRAS = "ABCDEFGHJKLMNPRSTUVXYZ";

function expedienteDe(f: Falta): Expediente {
  const r = mkRng(hashSeed(f.key ?? `${f.cam}:${f.kind}:${f.id}:${f.hh}`));
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const dig = (n: number) => String(Math.floor(r() * 10 ** n)).padStart(n, "0");
  const tipo = tipoDe(f) ?? "Auto";
  const pool = tipo === "Moto" ? MOTOS : tipo === "Bus" ? BUSES : tipo === "Camión" ? CAMIONES : AUTOS;
  const pref = tipo === "Moto" ? "M" : tipo === "Bus" ? "A" : tipo === "Camión" ? "C" : pick(["H", "P"]);
  const [marca, modelo] = pick(pool);
  const pv = r();
  return {
    placa: `${pref}${pick([...LETRAS])}${pick([...LETRAS])} ${dig(4)}`,
    marca, modelo, color: pick(COLORES), anio: 2005 + Math.floor(r() * 19),
    nombre: `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`,
    dni: `0501-${1965 + Math.floor(r() * 38)}-${dig(5)}`,
    licencia: `L-${dig(8)}`,
    direccion: `${pick(COLONIAS)}, San Pedro Sula, Cortés`,
    telefono: `${pick(["9", "8", "3"])}${dig(3)}-${dig(4)}`,
    previas: pv < 0.6 ? 0 : pv < 0.9 ? 1 : 2,
  };
}
// multa con recargo por reincidencia (Ley de Tránsito: 2a vez en el año = +50% + suspensión)
const multaDe = (exp: Expediente) => exp.previas === 0 ? MULTA_GRAVE
  : exp.previas === 1 ? MULTA_GRAVE * 1.5 : MULTA_GRAVE * 2;

// ---- Placa hondureña a puro CSS ----
// Formato real: banda azul superior con HONDURAS y la bandera, caracteres negros condensados,
// franja CENTROAMÉRICA abajo y calcomanía de revisión. `size` escala todo (1 ≈ 118px de ancho).
const AZUL_PLACA = "#1a35c4";
function Placa({ placa, size = 1 }: { placa: string; size?: number }) {
  const w = 118 * size, h = w * 0.485;
  const [letras, digitos] = placa.split(" ");
  return (
    <div title={`Placa (ficticia) ${placa}`}
      className="relative inline-block select-none overflow-hidden bg-white align-middle"
      style={{ width: w, height: h, borderRadius: w * 0.055, border: `${Math.max(1, w * 0.014)}px solid #1c1c1c`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.35)" }}>
      {/* banda superior */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ height: h * 0.26, background: AZUL_PLACA }}>
        <span style={{ color: "#fff", fontFamily: "Archivo, sans-serif", fontWeight: 800, fontSize: h * 0.135, letterSpacing: "0.14em", transform: "scaleY(1.1)" }}>HONDURAS</span>
        <span className="absolute rounded-full bg-white/90" style={{ left: "20%", top: "32%", width: w * 0.042, height: h * 0.048 }} />
        <span className="absolute rounded-full bg-white/90" style={{ right: "5%", top: "32%", width: w * 0.042, height: h * 0.048 }} />
      </div>
      {/* bandera */}
      <div className="absolute overflow-hidden" style={{ left: w * 0.02, top: h * 0.035, width: w * 0.15, height: h * 0.19, borderRadius: w * 0.012, border: "1px solid rgba(255,255,255,.75)" }}>
        <div style={{ height: "33%", background: AZUL_PLACA }} />
        <div className="flex items-center justify-center" style={{ height: "34%", background: "#fff", color: AZUL_PLACA, fontSize: h * 0.062, lineHeight: 1, letterSpacing: "0.08em" }}>★★★</div>
        <div style={{ height: "33%", background: AZUL_PLACA }} />
      </div>
      {/* número — con margen blanco a los lados (no pegado al borde) */}
      <div className="absolute flex items-center justify-center" style={{ top: h * 0.25, height: h * 0.54, left: w * 0.06, right: w * 0.06 }}>
        <span style={{ fontFamily: "Archivo, sans-serif", fontWeight: 900, fontSize: h * 0.335, letterSpacing: "0.01em", color: "#0d0d0d", transform: "scaleY(1.5)", whiteSpace: "nowrap" }}>
          {letras}<span className="inline-block" style={{ width: w * 0.03 }} />{digitos}
        </span>
      </div>
      {/* franja inferior */}
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ bottom: h * 0.025, height: h * 0.15 }}>
        <span style={{ color: AZUL_PLACA, fontFamily: "Archivo, sans-serif", fontWeight: 700, fontSize: h * 0.105, letterSpacing: "0.12em" }}>CENTROAMÉRICA</span>
      </div>
      {/* calcomanía de revisión (solo en tamaños grandes) */}
      {size >= 1.2 && (
        <div className="absolute overflow-hidden" style={{ right: w * 0.028, bottom: h * 0.045, width: w * 0.125, height: h * 0.145, border: "1px solid #9a9a9a", borderRadius: w * 0.01, background: "#e8e8e8" }}>
          <div style={{ background: AZUL_PLACA, color: "#fff", fontSize: h * 0.052, textAlign: "center", lineHeight: 1.5, fontFamily: "Archivo, sans-serif", fontWeight: 700 }}>07/26</div>
          <div style={{ fontSize: h * 0.034, textAlign: "center", color: "#555", lineHeight: 1.4 }}>REVISIÓN</div>
        </div>
      )}
    </div>
  );
}

// "1 Calle - 14 Avenida N.O (Seguros Atlantida)" -> "Seguros Atlantida"
const shortName = (nombre: string, id: string) => {
  const paren = nombre.match(/\(([^)]+)\)/)?.[1] ?? nombre.split("-").pop()?.trim() ?? id;
  const suf = nombre.match(/_\s*0?(\d+)\s*$/)?.[1];
  return paren.replace(/\s*_\s*0?\d+\s*$/, "") + (suf ? ` _${suf}` : "");
};
// horas en formato de 12 horas AM/PM (como se usan en Honduras)
const hora12 = (hh: string) => {
  const h = parseInt(hh, 10);
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};
const horaDe = (f: Infr) => {
  const h = parseInt(f.hh, 10);
  return `${h % 12 || 12}:${String(Math.floor(f.t / 60)).padStart(2, "0")}:${String(Math.floor(f.t % 60)).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
// el registro se muestra desde el mediodía (las faltas de día son más convincentes en el
// demo): 12 PM → 11 PM y de último la madrugada. El correlativo sigue siendo cronológico.
const ordenDia = (hh: string) => (parseInt(hh, 10) + 12) % 24;
const corr = (n: number) => `F-${String(n).padStart(3, "0")}`;
const boletaNum = (fecha: string, n: number) => `B-${fecha.replaceAll("-", "")}-${String(n).padStart(3, "0")}`;
const lps = (n: number) => `L ${n.toLocaleString("es-HN", { minimumFractionDigits: 2 })}`;

export function DnvtPanel({ token, api = API }: { token: string; api?: string }) {
  const [data, setData] = useState<Dia | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Rev>>({});
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [modal, setModal] = useState<{ tipo: "evidencia" | "boleta"; falta: Falta } | null>(null);
  const [fCam, setFCam] = useState("all");
  const [fKind, setFKind] = useState("all");
  const [fEstado, setFEstado] = useState("all");
  const [fHour, setFHour] = useState("all");
  const [busca, setBusca] = useState("");
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

  useEffect(() => { setPage(0); }, [fCam, fKind, fEstado, fHour, conQA, busca]);

  // todas las faltas del día, ordenadas por hora; el correlativo se asigna ANTES de filtrar
  // (así F-042 es F-042 en cualquier vista y en el CSV)
  const faltas = useMemo<Falta[]>(() => {
    if (!data) return [];
    const list = data.cams.flatMap((c) =>
      c.infr.map((v) => ({ ...v, cam: c.id, camName: c.nombre, camShort: shortName(c.nombre, c.id), n: 0 })));
    list.sort((a, b) => a.hh.localeCompare(b.hh) || a.t - b.t);
    list.forEach((f, i) => { f.n = i + 1; });
    list.sort((a, b) => ordenDia(a.hh) - ordenDia(b.hh) || a.t - b.t);
    return list;
  }, [data]);

  const estadoDe = (f: Falta) => (f.key && estados[f.key]?.estado) || "pendiente";
  const qaDe = (f: Falta) => (f.key ? reviews[f.key]?.verdict : undefined);

  // base = faltas visibles (post control de calidad); sobre esa base van KPIs y gráfico
  const visibles = useMemo(() => faltas.filter((f) => conQA || qaDe(f) !== "incorrecta"),
    [faltas, reviews, conQA]);   // eslint-disable-line react-hooks/exhaustive-deps
  const preHour = useMemo(() => {
    const q = busca.trim().toLowerCase().replace(/\s/g, "");
    return visibles.filter((f) =>
      (fCam === "all" || f.cam === fCam) &&
      (fKind === "all" || f.kind === fKind) &&
      (fEstado === "all" || estadoDe(f) === fEstado) &&
      (!q || expedienteDe(f).placa.toLowerCase().replace(/\s/g, "").includes(q)
        || String(f.id).includes(q)
        || expedienteDe(f).nombre.toLowerCase().replace(/\s/g, "").includes(q)));
  }, [visibles, fCam, fKind, fEstado, busca, estados]);   // eslint-disable-line react-hooks/exhaustive-deps
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

  const emitir = useCallback((f: Falta) => {
    if (!data) return;
    const exp = expedienteDe(f);
    void postEstado(f, { estado: "boleta", nota: `${boletaNum(data.fecha, f.n)} · ${lps(multaDe(exp))} · placa ${exp.placa}` });
  }, [data, postEstado]);

  const exportCsv = () => {
    if (!data) return;
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((f) => {
      const exp = expedienteDe(f);
      return [
        corr(f.n), data.fecha, horaDe(f), f.camName, KIND_LABEL[f.kind], tipoDe(f) ?? "", f.id,
        exp.placa, `${exp.marca} ${exp.modelo} ${exp.color}`, exp.nombre, exp.dni,
        estadoDe(f), (f.key && estados[f.key]?.nota) || "",
        qaDe(f) ? QA_BADGE[qaDe(f)!].label : "", f.why ?? "",
      ].map(esc).join(",");
    });
    const head = ["correlativo", "fecha", "hora", "camara", "falta", "vehiculo", "id_vehiculo",
      "placa_FICTICIA", "descripcion_vehiculo_FICTICIA", "propietario_FICTICIO", "dni_FICTICIO",
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
        <div className="flex flex-col items-end gap-2">
          <button onClick={exportCsv}
            className="cursor-pointer rounded-lg border border-accent px-4 py-2.5 font-mono text-[12px] font-semibold text-accent transition-colors hover:bg-[#123a2a]">
            ⬇ Exportar CSV ({nf(filtered.length)})
          </button>
          <span className="rounded-md border border-warning/40 bg-[#2a2410] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-warning">
            Demo · placas y personas ficticias
          </span>
        </div>
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
              viendo {hora12(fHour)} · ver todo el día
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
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Placa / ID / nombre</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar…"
            className={`${selCls} w-[170px] placeholder:text-text-faint`} />
        </label>
        <button onClick={() => setConQA((s) => !s)} className="flex items-center gap-2.5 py-2.5 font-sans text-[13px] text-text">
          <span className={`grid size-4 place-items-center rounded border ${conQA ? "border-warning bg-warning text-[#081411]" : "border-[var(--border-strong)]"}`}>{conQA ? "✓" : ""}</span>
          Incluir descartadas por control de calidad
        </button>
        <button onClick={() => { setFCam("all"); setFKind("all"); setFEstado("all"); setFHour("all"); setBusca(""); setConQA(false); }}
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
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border)] font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                {["Nº", "Hora", "Cámara / cruce", "Falta", "Placa*", "Vehículo", "Calidad", "Estado DNVT", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((f) => {
                const est = estadoDe(f);
                const qa = qaDe(f);
                const exp = expedienteDe(f);
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
                    </td>
                    <td className="px-4 py-2"><Placa placa={exp.placa} size={0.74} /></td>
                    <td className="px-4 py-2.5 font-sans text-[12px] text-text-muted">{exp.marca} {exp.modelo} · {tipoDe(f) ?? "Auto"} <span className="font-mono text-[10px] text-text-faint">#{f.id}</span></td>
                    <td className={`px-4 py-2.5 font-mono text-[10.5px] ${qa ? QA_BADGE[qa].cls : "text-text-faint"}`}>{qa ? QA_BADGE[qa].label : "—"}</td>
                    <td className="px-4 py-2.5">
                      {est === "boleta" ? (
                        <span className="rounded-md border border-accent bg-[#123a2a] px-2 py-1 font-mono text-[10px] text-accent">Boleta emitida</span>
                      ) : est === "desestimada" ? (
                        <span className="rounded-md border border-danger bg-[#2a1512] px-2 py-1 font-mono text-[10px] text-danger">Desestimada</span>
                      ) : (
                        <span className="rounded-md border border-[var(--border)] bg-bg-input px-2 py-1 font-mono text-[10px] text-text-faint">Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={() => setModal({ tipo: "evidencia", falta: f })}
                          className="cursor-pointer whitespace-nowrap rounded-md border border-[var(--border-strong)] px-2.5 py-1.5 font-mono text-[10px] text-text-muted transition-colors hover:border-accent hover:text-accent">
                          ▶ Evidencia
                        </button>
                        <button onClick={() => setModal({ tipo: "boleta", falta: f })}
                          className={`cursor-pointer whitespace-nowrap rounded-md border px-2.5 py-1.5 font-mono text-[10px] transition-colors ${est === "boleta" ? "border-[var(--border)] text-text-faint hover:border-text-muted" : "border-accent text-accent hover:bg-[#123a2a]"}`}>
                          {est === "boleta" ? "Ver boleta" : "⚑ Emitir"}
                        </button>
                      </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint">* Placas, propietarios y documentos son datos simulados de demostración</span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className={pageBtn}>‹ Anterior</button>
              <span className="px-2 font-mono text-[12px] text-text-muted">{cur + 1} / {pages}</span>
              <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={pageBtn}>Siguiente ›</button>
            </div>
          )}
        </div>
      </div>

      {modal?.tipo === "evidencia" && (
        <EvidenceModal falta={modal.falta} media={media} fecha={data.fecha}
          estado={estadoDe(modal.falta)}
          onBoleta={() => setModal({ tipo: "boleta", falta: modal.falta })}
          onDesestimar={() => { void postEstado(modal.falta, { estado: "desestimada" }); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.tipo === "boleta" && (
        <BoletaModal falta={modal.falta} fecha={data.fecha} emitida={estadoDe(modal.falta) === "boleta"}
          onEmitir={() => emitir(modal.falta)}
          onVerEvidencia={() => setModal({ tipo: "evidencia", falta: modal.falta })}
          onClose={() => setModal(null)} />
      )}
    </DnvtShell>
  );
}

// Barras de faltas por hora (24 slots); clic filtra la tabla a esa hora.
function HourBars({ byHour, current, onPick }: {
  byHour: Record<string, number>; current: string; onPick: (hk: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, h) => String((h + 12) % 24).padStart(2, "0"));
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
            <title>{`${hora12(hk)} · ${v} faltas`}</title>
            <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
            {v > 0 && <rect x={x - barW / 2} y={baseY - h} width={barW} height={h} rx={1.5}
              fill={on ? "#3dd68c" : "#b04a42"} className="transition-[fill] hover:brightness-125" />}
            {i % 3 === 0 && <text x={x} y={baseY + 16} fill="#5f7468" fontFamily="IBM Plex Mono, monospace" fontSize={9} textAnchor="middle">{hora12(hk)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// Visor de evidencia: video de la hora con cajas sobre el crudo; la falta va resaltada en rojo
// y el resto de vehículos apagados. Arranca 3 s antes del momento de la falta. Incluye el
// expediente simulado del vehículo y el paso a emitir la boleta.
function EvidenceModal({ falta, media, fecha, estado, onBoleta, onDesestimar, onClose }: {
  falta: Falta; media: (p: string) => string; fecha: string; estado: string;
  onBoleta: () => void; onDesestimar: () => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detRef = useRef<Det | null>(null);
  const [loading, setLoading] = useState(true);
  const exp = expedienteDe(falta);

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
                const lb = `${tipoDe(falta) ?? TIPO[d.ids[id] ?? 2] ?? ""} #${id} ⚠`;
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
      <div className="max-h-[94vh] w-full max-w-[980px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Evidencia · <span className="text-text">{corr(falta.n)}</span> · {KIND_LABEL[falta.kind]}
            </div>
            <div className="mt-1 truncate font-mono text-[10.5px] text-text-faint">
              {falta.camName} · {horaDe(falta)} · {tipoDe(falta) ?? "vehículo"} #{falta.id}
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

          {/* expediente simulado del vehículo */}
          <div className="mb-3 overflow-hidden rounded-xl border border-[var(--border-strong)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-bg-card px-4 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Expediente del vehículo</span>
              <span className="rounded bg-[#2a2410] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-warning">Datos ficticios · demo</span>
            </div>
            <div className="grid gap-x-6 gap-y-2.5 px-4 py-3.5 sm:grid-cols-2">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">Placa</div>
                <div className="mt-1.5"><Placa placa={exp.placa} size={1.55} /></div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">Vehículo</div>
                <div className="mt-0.5 font-sans text-[13px] text-text">{exp.marca} {exp.modelo} {exp.anio} · {exp.color}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">Propietario registral</div>
                <div className="mt-0.5 font-sans text-[13px] text-text">{exp.nombre}</div>
                <div className="font-mono text-[10.5px] text-text-muted">DNI {exp.dni} · Lic. {exp.licencia}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">Domicilio / contacto</div>
                <div className="mt-0.5 font-sans text-[12.5px] text-text-muted">{exp.direccion}</div>
                <div className="font-mono text-[10.5px] text-text-muted">Tel. {exp.telefono}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">Historial (últimos 12 meses)</div>
                <div className={`mt-0.5 font-sans text-[12.5px] ${exp.previas > 0 ? "text-warning" : "text-text-muted"}`}>
                  {exp.previas === 0 ? "Sin faltas previas registradas"
                    : exp.previas === 1 ? "1 falta previa — reincidencia: multa +50% y suspensión de licencia (6 meses)"
                    : "2 faltas previas — reincidencia agravada: multa +100%"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={rejump} className="cursor-pointer rounded-md border border-[var(--border-strong)] px-3 py-1.5 font-mono text-[11px] text-text-muted transition-colors hover:border-accent hover:text-accent">⟲ Volver a la falta</button>
            <span className="flex-1" />
            <button onClick={() => { onDesestimar(); onClose(); }}
              className="cursor-pointer rounded-md border border-danger px-3 py-2 font-mono text-[11px] text-danger transition-colors hover:bg-[#2a1512]">
              Desestimar falta
            </button>
            <button onClick={onBoleta}
              className={`cursor-pointer rounded-md border px-3.5 py-2 font-mono text-[11px] font-semibold transition-colors ${estado === "boleta" ? "border-[var(--border-strong)] text-text-muted hover:border-accent hover:text-accent" : "border-accent bg-[#123a2a] text-accent hover:brightness-110"}`}>
              {estado === "boleta" ? "Ver boleta emitida" : "⚑ Emitir infracción"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Boleta de infracción (demo): previsualización con la tipificación real de la Ley de
// Tránsito, multa con recargo por reincidencia y datos ficticios del expediente. "Confirmar"
// guarda el estado en el backend; "Imprimir" abre una versión de papel en ventana nueva.
function BoletaModal({ falta, fecha, emitida, onEmitir, onVerEvidencia, onClose }: {
  falta: Falta; fecha: string; emitida: boolean;
  onEmitir: () => void; onVerEvidencia: () => void; onClose: () => void;
}) {
  const exp = expedienteDe(falta);
  const legal = LEGAL[falta.kind];
  const monto = multaDe(exp);
  const num = boletaNum(fecha, falta.n);
  const [ok, setOk] = useState(emitida);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const imprimir = () => {
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) return;
    // mini placa hondureña en la versión de papel (mismos elementos que el componente Placa)
    const placaHtml = `<div style="display:inline-block;width:158px;height:76px;background:#fff;border:2px solid #1c1c1c;border-radius:8px;position:relative;overflow:hidden;vertical-align:middle">
      <div style="height:20px;background:${AZUL_PLACA};color:#fff;text-align:center;font:800 10px Arial,sans-serif;letter-spacing:2.5px;line-height:20px">HONDURAS</div>
      <div style="position:absolute;left:4px;top:3px;width:22px;height:14px;border:1px solid rgba(255,255,255,.75);border-radius:2px;overflow:hidden">
        <div style="height:4px;background:${AZUL_PLACA}"></div><div style="height:5px;background:#fff;color:${AZUL_PLACA};font-size:4px;text-align:center;line-height:5px">★★★</div><div style="height:4px;background:${AZUL_PLACA}"></div>
      </div>
      <div style="text-align:center;font:900 30px 'Arial Narrow',Arial,sans-serif;letter-spacing:1px;color:#0d0d0d;margin-top:2px;transform:scaleY(1.25)">${exp.placa}</div>
      <div style="position:absolute;bottom:2px;left:0;right:0;text-align:center;color:${AZUL_PLACA};font:700 8px Arial,sans-serif;letter-spacing:2px">CENTROAMÉRICA</div>
    </div>`;
    const filas = [
      ["Boleta No.", num], ["Fecha de la falta", `${fecha} · ${horaDe(falta)}`],
      ["Lugar", falta.camName + ", San Pedro Sula, Cortés"],
      ["Falta", KIND_LABEL[falta.kind]], ["Tipificación", legal.texto],
      ["Categoría", `Infracción ${legal.categoria} — Ley de Tránsito (Decreto 205-2005)`],
      ["Placa", placaHtml], ["Vehículo", `${exp.marca} ${exp.modelo} ${exp.anio}, ${exp.color}`],
      ["Propietario registral", exp.nombre], ["DNI", exp.dni], ["Licencia", exp.licencia],
      ["Domicilio", exp.direccion],
      ["Reincidencia", exp.previas === 0 ? "No registra" : `${exp.previas} falta(s) previa(s) en 12 meses`],
      ["Multa", lps(monto) + (exp.previas === 1 ? " (base L 600.00 + 50% reincidencia; conlleva suspensión de licencia 6 meses)" : exp.previas === 2 ? " (base L 600.00 + 100% reincidencia agravada)" : " (Art. 101, infracción grave)")],
      ["Evidencia", `Video cámara "${falta.camShort}", registro ${corr(falta.n)}, vehículo rastreado #${falta.id}`],
    ].map(([k, v]) => `<tr><td style="padding:6px 10px;border:1px solid #bbb;font-weight:600;white-space:nowrap">${k}</td><td style="padding:6px 10px;border:1px solid #bbb">${v}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>${num} (DEMO)</title></head>
<body style="font-family:Georgia,serif;color:#111;margin:36px;position:relative">
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
  <div style="transform:rotate(-28deg);font-size:54px;font-weight:bold;color:rgba(180,30,30,.13);border:6px solid rgba(180,30,30,.13);padding:14px 30px;border-radius:12px">DEMOSTRACIÓN</div>
</div>
<div style="text-align:center;border-bottom:3px double #333;padding-bottom:12px">
  <div style="font-size:13px;letter-spacing:.18em;font-weight:bold">SISTEMA SENTTRA — DEMO</div>
  <div style="font-size:19px;font-weight:bold;margin-top:6px">BOLETA DE INFRACCIÓN DE TRÁNSITO</div>
  <div style="font-size:12px;margin-top:4px">Documento de demostración · Todos los datos personales, placas y documentos son FICTICIOS</div>
</div>
<table style="border-collapse:collapse;width:100%;margin-top:18px;font-size:13.5px">${filas}</table>
<div style="margin-top:16px;font-size:12px;line-height:1.5">El presunto infractor dispone del plazo legal para pagar o impugnar esta boleta ante la autoridad competente. La reincidencia dentro del período de un (1) año aumenta la multa y puede conllevar la suspensión de la licencia de conducir (Ley de Tránsito, Decreto 205-2005).</div>
<div style="display:flex;justify-content:space-between;margin-top:52px;font-size:12px">
  <div style="border-top:1px solid #333;padding-top:6px;width:40%;text-align:center">Agente / sistema emisor</div>
  <div style="border-top:1px solid #333;padding-top:6px;width:40%;text-align:center">Recibí copia (presunto infractor)</div>
</div>
<script>window.print()</script></body></html>`);
    w.document.close();
  };

  const row = (k: string, v: React.ReactNode, strong = false) => (
    <div className="flex gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0">
      <span className="w-[150px] shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">{k}</span>
      <span className={`min-w-0 font-sans text-[13px] ${strong ? "font-semibold text-text" : "text-text-muted"}`}>{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(4,10,8,0.82)] p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-[680px] overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Boleta de infracción · <span className="text-text">{num}</span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-warning">demo — placas, personas y documentos ficticios</div>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-md border border-[var(--border)] px-2.5 py-1.5 font-mono text-[11px] text-text-muted transition-colors hover:border-danger hover:text-danger">✕ Cerrar</button>
        </div>

        <div className="m-5 overflow-hidden rounded-xl border border-[var(--border-strong)]">
          {row("Registro", <>{corr(falta.n)} · {KIND_LABEL[falta.kind]}</>, true)}
          {row("Fecha y hora", `${fecha} · ${horaDe(falta)}`)}
          {row("Lugar", `${falta.camName}, San Pedro Sula`)}
          {row("Tipificación", legal.texto)}
          {row("Categoría", <>Infracción <span className="font-semibold text-danger">{legal.categoria}</span> · Ley de Tránsito (Decreto 205-2005)</>)}
          {row("Placa", <Placa placa={exp.placa} size={1.3} />)}
          {row("Vehículo", `${exp.marca} ${exp.modelo} ${exp.anio} · ${exp.color}`)}
          {row("Propietario", <>{exp.nombre} <span className="font-mono text-[11px] text-text-faint">· DNI {exp.dni} · Lic. {exp.licencia}</span></>)}
          {row("Reincidencia", exp.previas === 0 ? "No registra faltas previas"
            : exp.previas === 1 ? <span className="text-warning">1 falta previa — multa +50% y suspensión de licencia 6 meses</span>
            : <span className="text-warning">2 faltas previas — multa +100%</span>)}
          {row("Multa", <span className="font-display text-[19px] font-extrabold text-danger">{lps(monto)}</span>, true)}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
          <button onClick={onVerEvidencia} className="cursor-pointer rounded-md border border-[var(--border-strong)] px-3 py-2 font-mono text-[11px] text-text-muted transition-colors hover:border-accent hover:text-accent">▶ Ver evidencia</button>
          <span className="flex-1" />
          {ok ? (
            <>
              <span className="rounded-md border border-accent bg-[#123a2a] px-3 py-2 font-mono text-[11px] text-accent">✓ Boleta emitida</span>
              <button onClick={imprimir} className="cursor-pointer rounded-md border border-[var(--border-strong)] px-3.5 py-2 font-mono text-[11px] text-text transition-colors hover:border-accent hover:text-accent">⎙ Imprimir</button>
            </>
          ) : (
            <button onClick={() => { onEmitir(); setOk(true); }}
              className="cursor-pointer rounded-lg bg-accent px-4 py-2.5 font-display text-[13px] font-bold text-[#062017] transition-opacity hover:opacity-90">
              ⚑ Confirmar y emitir boleta
            </button>
          )}
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
          Dirección Nacional de Vialidad y Transporte<br />registro diario de faltas · San Pedro Sula · <span className="text-warning">demo</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
