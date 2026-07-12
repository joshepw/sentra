"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";
const TOKEN = process.env.NEXT_PUBLIC_SENTRA_TOKEN ?? "muni2026";
const media = (p: string) => `${API}/data/${p}?k=${encodeURIComponent(TOKEN)}`;

const COL: Record<number, string> = { 2: "#3dd68c", 3: "#e6b24d", 5: "#6fc9f2", 7: "#c85adc" };
const TIPO: Record<number, string> = { 2: "Auto", 3: "Moto", 5: "Bus", 7: "Camión" };
const hh2 = (h: number) => String(h).padStart(2, "0");
const nf = (n: number) => n.toLocaleString("es-HN");

type HourInfo = { n_veh: number; base_ts: number };
type Infr = { kind: "giro" | "uturn" | "rojo"; id: number; hh: string; t: number; tipo?: string };
type Cam = {
  id: string; nombre: string; lat: number; lng: number;
  giros_ok: boolean; rojo_ok: boolean;
  hours: Record<string, HourInfo>; n_veh: number; n_giro: number; n_rojo: number; infr: Infr[];
};
type Dia = { fecha: string; cams: Cam[]; totales: { veh: number; giro: number; rojo: number; n_cams: number } };
type Det = {
  base_ts: number; fps: number; nw: number; nh: number;
  ids: Record<string, number>; boxes: Record<string, [number, number, number, number, number][]>;
};

export default function DemoPage() {
  const [data, setData] = useState<Dia | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [hour, setHour] = useState("09");
  const [tg, setTg] = useState({ cajas: true, etiquetas: true, rastros: true });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detRef = useRef<Det | null>(null);
  const trailsRef = useRef<Map<number, [number, number, number][]>>(new Map());
  const detCache = useRef<Map<string, Det | null>>(new Map());
  const tgRef = useRef(tg);
  tgRef.current = tg;

  const cam = data?.cams[sel];
  const infrIds = useMemo(() => new Set((cam?.infr ?? []).map((v) => v.id)), [cam]);
  const infrRef = useRef(infrIds);
  infrRef.current = infrIds;

  // ---- carga inicial ----
  useEffect(() => {
    fetch(`${API}/api/dia?k=${encodeURIComponent(TOKEN)}`)
      .then((r) => r.json())
      .then((d: Dia) => {
        setData(d);
        const best = d.cams.reduce((bi, c, i, a) =>
          c.n_giro + c.n_rojo > a[bi].n_giro + a[bi].n_rojo ? i : bi, 0);
        setSel(best);
        const cc = d.cams[best];
        setHour(cc.hours["09"] ? "09" : Object.keys(cc.hours)[0] ?? "09");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  // ---- loop de dibujo único ----
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
            const t = tgRef.current;
            if (boxes) for (const [id, x, y, w, h] of boxes) {
              const infr = infrRef.current.has(id);
              const cls = d.ids[id] ?? 2;
              const color = infr ? "#ff2f4d" : (COL[cls] ?? "#9aa");
              if (t.rastros) {
                let tr = trailsRef.current.get(id);
                if (!tr) { tr = []; trailsRef.current.set(id, tr); }
                const cx = (x + w / 2) * sx, cy = (y + h / 2) * sy;
                if (!tr.length || Math.abs(tr[tr.length - 1][2] - slot) >= 1) tr.push([cx, cy, slot]);
                while (tr.length && slot - tr[0][2] > 40) tr.shift();
                ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
                ctx.beginPath();
                tr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
                ctx.stroke(); ctx.globalAlpha = 1;
              }
              if (t.cajas) { ctx.strokeStyle = color; ctx.lineWidth = infr ? 3 : 2; ctx.strokeRect(x * sx, y * sy, w * sx, h * sy); }
              if (t.etiquetas) {
                const lb = `${TIPO[cls] ?? ""} #${id}${infr ? " ⚠" : ""}`;
                ctx.font = "600 11px ui-monospace, monospace";
                const tw = ctx.measureText(lb).width;
                ctx.fillStyle = color; ctx.fillRect(x * sx - 1, y * sy - 17, tw + 10, 16);
                ctx.fillStyle = "#081411"; ctx.fillText(lb, x * sx + 4, y * sy - 5);
              }
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const v = videoRef.current;
    const onSeeked = () => { trailsRef.current = new Map(); };
    v?.addEventListener("seeked", onSeeked);
    return () => { cancelAnimationFrame(raf); v?.removeEventListener("seeked", onSeeked); };
  }, [data]);

  // ---- cambiar de cámara/hora (+ seek opcional) ----
  const load = useCallback(async (camId: string, hk: string, seek?: number) => {
    const v = videoRef.current; if (!v) return;
    trailsRef.current = new Map();
    const key = `${camId}/${hk}`;
    if (!detCache.current.has(key)) {
      try { detCache.current.set(key, await (await fetch(media(`${camId}/det/${hk}.json`))).json()); }
      catch { detCache.current.set(key, null); }
    }
    detRef.current = detCache.current.get(key) ?? null;
    const target = seek != null ? Math.max(0, seek - 3) : 0;
    v.onloadedmetadata = () => { try { v.currentTime = target; } catch {} void v.play().catch(() => {}); };
    v.src = media(`${camId}/video/${hk}.mp4`); v.load();
  }, []);

  useEffect(() => {
    if (!cam) return;
    if (cam.hours[hour]) void load(cam.id, hour);
  }, [cam, hour, load]);

  const pickCam = (i: number) => {
    if (!data) return;
    setSel(i);
    const c = data.cams[i];
    setHour(c.hours[hour] ? hour : Object.keys(c.hours)[0] ?? hour);
  };
  const jump = (v: Infr) => { if (!cam) return; setHour(v.hh); void load(cam.id, v.hh, v.t); };

  if (err) return <Shell><p className="rounded-xl border border-[var(--border-strong)] bg-bg-card p-4 font-mono text-sm text-text-muted">No se pudo cargar el backend: {err}</p></Shell>;
  if (!data || !cam) return <Shell><p className="animate-sn-pulse font-mono text-sm text-text-muted">Cargando datos en vivo…</p></Shell>;

  const avg = Math.round(data.totales.veh / 24);
  const hoursList = Array.from({ length: 24 }, (_, h) => hh2(h));
  const anyHour = (hk: string) => data.cams.some((c) => c.hours[hk]);
  const barMax = Math.max(1, ...hoursList.map((hk) => cam.hours[hk]?.n_veh ?? 0));
  const infByHour = cam.infr.reduce<Record<string, number>>((a, v) => { a[v.hh] = (a[v.hh] ?? 0) + 1; return a; }, {});
  const infMax = Math.max(1, ...Object.values(infByHour));
  const camPos = (i: number, n: number): [number, number] => [34 + (i * 252) / (n - 1), 210 - (i * 120) / (n - 1)];

  return (
    <Shell wide>
      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel lg:grid-cols-4 lg:divide-x">
        {[
          { v: nf(data.totales.veh), l: "Vehículos detectados", c: "text-accent" },
          { v: nf(avg), l: "Promedio / hora", c: "text-text" },
          { v: String(data.totales.giro), l: "Giros indebidos", c: "text-danger" },
          { v: String(data.totales.rojo), l: "Cruces en rojo", c: "text-danger" },
        ].map((k) => (
          <div key={k.l} className="p-5 sm:p-[24px_30px]">
            <div className={`font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] sm:text-[44px] ${k.c}`}>{k.v}</div>
            <div className="mt-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-faint">{k.l}</div>
          </div>
        ))}
      </div>

      {/* selector de horas */}
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-3">
        {hoursList.map((hk) => {
          const on = hk === hour, en = anyHour(hk);
          return (
            <button key={hk} disabled={!en} onClick={() => setHour(hk)}
              className={`rounded-md border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors ${on ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-muted"} ${en ? "" : "opacity-25"}`}>
              {hk}h
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-4 lg:flex-row">
        {/* MAPA */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel lg:flex-1">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Corredor 1ª Calle ·<br />Bulevar Morazán</div>
            <div className="text-right font-mono text-[10px] tracking-[0.1em] text-text-faint"><span className="text-accent">{data.totales.n_cams}</span> cámaras</div>
          </div>
          <div className="relative min-h-[280px] flex-1">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid slice">
              <rect width="320" height="320" fill="#07130e" />
              <text x="14" y="150" fill="#4a5c52" fontFamily="var(--font-ibm-plex-mono)" fontSize="8" transform="rotate(-8 14 150)">BLVD MORAZÁN · 1ª CALLE</text>
              {(() => { const n = data.cams.length; const [ax, ay] = camPos(0, n); const [bx, by] = camPos(n - 1, n);
                return <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#3dd68c" strokeOpacity="0.4" strokeWidth="1.4" strokeDasharray="2 6" />; })()}
              {data.cams.map((c, i) => { const [x, y] = camPos(i, data.cams.length); const hot = c.n_giro + c.n_rojo > 0;
                if (i === sel) return (
                  <g key={c.id} transform={`translate(${x} ${y})`}>
                    <circle r="24" fill="none" stroke="#3dd68c" strokeWidth="1.4" className="origin-center animate-sn-ripout" style={{ transformBox: "fill-box" }} />
                    <circle r="10" fill="#3dd68c" fillOpacity="0.16" stroke="#3dd68c" strokeWidth="1.5" />
                    <circle r="4.6" fill="#3dd68c" />
                  </g>);
                return (
                  <g key={c.id} transform={`translate(${x} ${y})`} className="cursor-pointer" onClick={() => pickCam(i)}>
                    <circle r="7" fill="#0f241b" stroke={hot ? "#e0655a" : "#3dd68c"} strokeWidth="1.6" />
                    <circle r="2.4" fill={hot ? "#e0655a" : "#3dd68c"} />
                  </g>);
              })}
            </svg>
          </div>
          <div className="border-t border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent shadow-[0_0_0_3px_rgba(61,214,140,0.18)]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">Cámara seleccionada</span>
            </div>
            <div className="mt-2 font-display text-[15px] font-bold leading-tight">{cam.nombre}</div>
          </div>
        </div>

        {/* DETECCIÓN */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-5 lg:flex-[2.4]">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Detección anotada · {cam.nombre}</div>
            <div className="flex gap-2">
              {(["cajas", "etiquetas", "rastros"] as const).map((k) => (
                <button key={k} onClick={() => setTg((s) => ({ ...s, [k]: !s[k] }))}
                  className={`rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors ${tg[k] ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-faint"}`}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-strong)] bg-bg">
            <video ref={videoRef} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-sn-scan bg-gradient-to-r from-transparent via-accent to-transparent opacity-60" />
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[rgba(8,20,17,0.66)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
              <span className="size-[7px] animate-sn-pulse rounded-full bg-danger" />REC
            </div>
            {!cam.hours[hour] && <div className="absolute inset-0 flex items-center justify-center bg-bg text-sm text-text-faint">sin video en esta hora</div>}
          </div>
          <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-text-faint">
            <span>Hora {hour}:00</span>
            <span className="ml-auto">{nf(cam.hours[hour]?.n_veh ?? 0)} veh en esta hora</span>
          </div>
        </div>

        {/* INFRACCIONES */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel lg:flex-1">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Infracciones ·<br />giros y cruces en rojo</div>
            <div className="font-display text-[26px] font-extrabold text-danger">{cam.infr.length}</div>
          </div>
          <div className="max-h-[430px] overflow-y-auto">
            {cam.infr.length === 0 ? (
              <p className="p-5 text-xs text-text-faint">{cam.giros_ok || cam.rojo_ok ? "Sin infracciones detectadas." : "Ángulo en solo conteo."}</p>
            ) : cam.infr.map((v, idx) => {
              const rojo = v.kind === "rojo";
              const label = rojo ? "Cruce en rojo" : v.kind === "uturn" ? "Vuelta en U" : "Giro indebido";
              const tag = rojo ? "ROJO" : v.kind === "uturn" ? "U" : "GIRO";
              return (
                <button key={idx} onClick={() => jump(v)}
                  className="flex w-full items-center gap-3 border-b border-[var(--border)] px-5 py-3 text-left transition-colors hover:bg-bg-card">
                  <span className={`flex size-[34px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] font-mono text-[9px] font-bold ${rojo ? "bg-[#2a0f14] text-[#ff8598]" : "bg-[#2a1512] text-danger"}`}>{tag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-danger">{label}</span>
                    <span className="mt-1 block font-mono text-[10px] text-text-muted">#{v.id} {v.tipo ?? ""}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-accent">{v.hh}:00 +{Math.round(v.t)}s</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* GRÁFICO POR HORA */}
      <div className="rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Tráfico por hora · {cam.nombre}</div>
          <div className="flex gap-4 font-mono text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#2e7d64]" />Vehículos</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger" />Infracciones</span>
          </div>
        </div>
        <div className="mt-4 flex h-[170px] items-stretch gap-[3px]">
          {hoursList.map((hk) => {
            const nv = cam.hours[hk]?.n_veh ?? 0, ni = infByHour[hk] ?? 0;
            return (
              <button key={hk} disabled={!cam.hours[hk]} onClick={() => setHour(hk)}
                title={`${hk}:00 · ${nf(nv)} veh · ${ni} infr`}
                className="relative flex flex-1 flex-col justify-end">
                {ni > 0 && <span className="absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ bottom: `${(ni / infMax) * 100}%` }} />}
                <span className={`rounded-t-sm ${hk === hour ? "bg-accent" : "bg-[#2e7d64]"}`} style={{ height: `${(nv / barMax) * 100}%`, minHeight: 1 }} />
              </button>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen w-full bg-bg text-text">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(8,20,17,0.9)] px-6 py-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <SentraLogoMark size={26} />
          <SentraWordmark />
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-accent">Demo</span>
        </Link>
        <div className="text-right font-mono text-[11px] leading-relaxed text-text-faint">
          Monitoreo de tráfico · SPS<br />cajas dibujadas <span className="text-accent">en vivo</span> sobre video crudo
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 sm:px-6 ${wide ? "max-w-[1600px]" : "max-w-[900px]"}`}>{children}</main>
    </div>
  );
}
