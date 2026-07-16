"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";
import { CorridorMap } from "@/components/sentra/corridor-map";

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";

const COL: Record<number, string> = { 2: "#3dd68c", 3: "#e6b24d", 5: "#6fc9f2", 7: "#c85adc" };
const TIPO: Record<number, string> = { 2: "Auto", 3: "Moto", 5: "Bus", 7: "Camión" };
const hh2 = (h: number) => String(h).padStart(2, "0");
const nf = (n: number) => n.toLocaleString("es-HN");

type HourInfo = { n_veh: number; base_ts: number };
type Infr = {
  kind: "giro" | "uturn" | "rojo"; id: number; hh: string; t: number;
  tipo?: string; key?: string; why?: string; speed?: number;
};
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
type Rev = { verdict: string; reason: string; ts?: number };

const VERDICTS = [
  { k: "correcta", label: "✓ Correcta", on: "border-accent bg-[#123a2a] text-accent" },
  { k: "incorrecta", label: "✗ Incorrecta", on: "border-danger bg-[#2a1512] text-danger" },
  { k: "dudosa", label: "~ Dudosa", on: "border-warning bg-[#2a2410] text-warning" },
] as const;

export function TrafficViewer({ token, admin = false }: { token: string; admin?: boolean }) {
  const [data, setData] = useState<Dia | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [hour, setHour] = useState("09");
  const [tg, setTg] = useState({ cajas: true, etiquetas: true, rastros: true });
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<Record<string, Rev>>({});
  const [det, setDet] = useState<Det | null>(null);   // det de la hora actual (para la galería)

  const media = useCallback((p: string) => `${API}/data/${p}?k=${encodeURIComponent(token)}`, [token]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detRef = useRef<Det | null>(null);
  const trailsRef = useRef<Map<number, [number, number, number][]>>(new Map());
  const detCache = useRef<Map<string, Det | null>>(new Map());
  const pendingSeek = useRef<number | null>(null);   // seek a aplicar cuando cambia la hora
  const tgRef = useRef(tg);
  tgRef.current = tg;

  const cam = data?.cams[sel];
  const infrIds = useMemo(() => new Set((cam?.infr ?? []).map((v) => v.id)), [cam]);
  const infrById = useMemo(() => new Map((cam?.infr ?? []).map((v) => [v.id, v.kind] as const)), [cam]);
  const infrRef = useRef(infrIds);
  infrRef.current = infrIds;

  // ---- carga inicial ----
  useEffect(() => {
    fetch(`${API}/api/dia?k=${encodeURIComponent(token)}&_=${Date.now()}`)
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
  }, [token]);

  // ---- revisiones existentes (solo admin) ----
  useEffect(() => {
    if (!admin) return;
    fetch(`${API}/api/reviews?k=${encodeURIComponent(token)}&_=${Date.now()}`)
      .then((r) => r.json()).then((m: Record<string, Rev>) => setReviews(m ?? {})).catch(() => {});
  }, [admin, token]);

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
            const drawn = new Set<number>();   // dedup: 2 frames pueden caer en el mismo slot
            if (boxes) for (const [id, x, y, w, h] of boxes) {
              if (drawn.has(id)) continue;
              drawn.add(id);
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
    const onReady = () => setLoading(false);   // quita "CARGANDO" apenas hay imagen, no solo al reproducir
    const READY = ["playing", "canplay", "loadeddata", "error"];
    v?.addEventListener("seeked", onSeeked);
    READY.forEach((e) => v?.addEventListener(e, onReady));
    return () => { cancelAnimationFrame(raf); v?.removeEventListener("seeked", onSeeked);
      READY.forEach((e) => v?.removeEventListener(e, onReady)); };
  }, [data]);

  // ---- cambiar de cámara/hora (+ seek opcional) ----
  const load = useCallback(async (camId: string, hk: string, seek?: number) => {
    const v = videoRef.current; if (!v) return;
    setLoading(true);
    trailsRef.current = new Map();
    const key = `${camId}/${hk}`;
    if (!detCache.current.has(key)) {
      try { detCache.current.set(key, await (await fetch(media(`${camId}/det/${hk}.json`) + "&_=" + Date.now())).json()); }
      catch { detCache.current.set(key, null); }
    }
    detRef.current = detCache.current.get(key) ?? null;
    setDet(detRef.current);
    const target = seek != null ? Math.max(0, seek - 3) : 0;
    v.onloadedmetadata = () => { try { v.currentTime = target; } catch {} void v.play().catch(() => {}); };
    v.src = media(`${camId}/video/${hk}.mp4`); v.load();
  }, [media]);

  // Único punto de carga: al cambiar cámara/hora. Si venía un seek pendiente (de un clic a
  // infracción de OTRA hora) lo aplica; si no, arranca al inicio. Evita el doble-load que
  // competía (uno con seek, otro sin) y dejaba el video en un momento aleatorio.
  useEffect(() => {
    if (!cam) return;
    if (cam.hours[hour]) {
      const s = pendingSeek.current; pendingSeek.current = null;
      void load(cam.id, hour, s ?? undefined);
    }
  }, [cam, hour, load]);

  const pickCam = (i: number) => {
    if (!data) return;
    setSel(i);
    const c = data.cams[i];
    setHour(c.hours[hour] ? hour : Object.keys(c.hours)[0] ?? hour);
  };
  const jump = (v: Infr) => {
    if (!cam) return;
    if (v.hh === hour) void load(cam.id, v.hh, v.t);   // misma hora: el efecto no dispara -> carga directa
    else { pendingSeek.current = v.t; setHour(v.hh); }  // otra hora: el efecto carga con el seek pendiente
  };

  // ---- guardar veredicto/razón de una infracción (admin) ----
  const postReview = useCallback(async (v: Infr, patch: { verdict?: string; reason?: string }) => {
    if (!v.key || !cam) return;
    const cur = reviews[v.key] ?? { verdict: "", reason: "" };
    const next: Rev = { verdict: patch.verdict ?? cur.verdict, reason: patch.reason ?? cur.reason };
    setReviews((s) => ({ ...s, [v.key!]: next }));
    try {
      await fetch(`${API}/api/review?k=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: v.key, cam: cam.id, kind: v.kind, id: v.id, hh: v.hh, ...next }),
      });
    } catch {}
  }, [reviews, cam, token]);

  if (err) return <Shell admin={admin}><p className="rounded-xl border border-[var(--border-strong)] bg-bg-card p-4 font-mono text-sm text-text-muted">No se pudo cargar el backend: {err}</p></Shell>;
  if (!data || !cam) return <Shell admin={admin}><p className="animate-sn-pulse font-mono text-sm text-text-muted">Cargando datos en vivo…</p></Shell>;

  const avg = Math.round(data.totales.veh / 24);
  const hoursList = Array.from({ length: 24 }, (_, h) => hh2(h));
  const anyHour = (hk: string) => data.cams.some((c) => c.hours[hk]);
  const infByHour = cam.infr.reduce<Record<string, number>>((a, v) => { a[v.hh] = (a[v.hh] ?? 0) + 1; return a; }, {});
  const marcadas = admin ? cam.infr.filter((v) => v.key && reviews[v.key]?.verdict).length : 0;

  return (
    <Shell wide admin={admin}>
      {admin && <DemoPassPanel api={API} token={token} />}
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
              className={`rounded-md border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors ${on ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-muted"} ${en ? "cursor-pointer hover:border-accent hover:text-text" : "opacity-25"}`}>
              {hk}h
            </button>
          );
        })}
      </div>

      {/* selector de cámaras (confiable, además del mapa) */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-3">
        <span className="pr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">Cámara:</span>
        {data.cams.map((c, i) => {
          const on = i === sel; const inf = c.n_giro + c.n_rojo;
          const paren = c.nombre.match(/\(([^)]+)\)/)?.[1] ?? c.nombre.split("-").pop()?.trim() ?? c.id;
          const suf = c.nombre.match(/_\s*0?(\d+)\s*$/)?.[1];   // distingue _1/_2/_02
          const short = paren.replace(/\s*_\s*0?\d+\s*$/, "") + (suf ? ` _${suf}` : "");
          return (
            <button key={c.id} onClick={() => pickCam(i)}
              className={`cursor-pointer rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${on ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-muted hover:border-accent hover:text-text"}`}>
              {short}{inf > 0 && <span className="ml-1.5 text-danger">{inf}</span>}
            </button>
          );
        })}
      </div>

      {/* MAPA REAL (calles de SPS) */}
      <CorridorMap cams={data.cams} sel={sel} onPick={pickCam} admin={admin} api={API} token={token} />

      <div className="mb-4 flex flex-col gap-4 lg:flex-row">
        {/* DETECCIÓN */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-5 lg:flex-[2.4]">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Detección anotada · {cam.nombre}</div>
            <div className="flex gap-2">
              {(["cajas", "etiquetas", "rastros"] as const).map((k) => (
                <button key={k} onClick={() => setTg((s) => ({ ...s, [k]: !s[k] }))}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors hover:border-accent ${tg[k] ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-faint"}`}>
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
            {loading && cam.hours[hour] && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-[rgba(8,20,17,0.55)] backdrop-blur-[1px]">
                <span className="size-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Cargando</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-text-faint">
            <span>Hora {hour}:00</span>
            <span className="ml-auto">{nf(cam.hours[hour]?.n_veh ?? 0)} veh en esta hora</span>
          </div>
        </div>

        {/* INFRACCIONES */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel lg:flex-1">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Infracciones ·<br />giros y cruces en rojo
              {admin && <span className="mt-1 block text-[9px] normal-case tracking-normal text-accent">{marcadas}/{cam.infr.length} revisadas</span>}
            </div>
            <div className="font-display text-[26px] font-extrabold text-danger">{cam.infr.length}</div>
          </div>
          <div className={admin ? "max-h-[560px] overflow-y-auto" : "max-h-[430px] overflow-y-auto"}>
            {cam.infr.length === 0 ? (
              <p className="p-5 text-xs text-text-faint">{cam.giros_ok || cam.rojo_ok ? "Sin infracciones detectadas." : "Ángulo en solo conteo."}</p>
            ) : cam.infr.map((v, idx) => {
              const rojo = v.kind === "rojo";
              const label = rojo ? "Cruce en rojo" : v.kind === "uturn" ? "Vuelta en U" : "Giro indebido";
              const tag = rojo ? "ROJO" : v.kind === "uturn" ? "U" : "GIRO";
              const rev = v.key ? reviews[v.key] : undefined;
              const vColor = rev?.verdict === "correcta" ? "border-accent" : rev?.verdict === "incorrecta" ? "border-danger" : rev?.verdict === "dudosa" ? "border-warning" : "border-transparent";
              return (
                <div key={idx} className={`border-b border-[var(--border)] ${admin ? `border-l-2 ${vColor}` : ""}`}>
                  <button onClick={() => jump(v)}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-bg-card active:translate-y-px">
                    <span className={`flex size-[34px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] font-mono text-[9px] font-bold ${rojo ? "bg-[#2a0f14] text-[#ff8598]" : "bg-[#2a1512] text-danger"}`}>{tag}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-danger">{label}</span>
                      <span className="mt-1 block font-mono text-[10px] text-text-muted">#{v.id} {v.tipo ?? ""}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-accent">{v.hh}:00 +{Math.round(v.t)}s</span>
                  </button>
                  {admin && (
                    <div className="px-5 pb-3.5">
                      {v.why && <p className="mb-2 rounded-md bg-bg-card px-2.5 py-2 font-mono text-[10px] leading-relaxed text-text-muted">↳ {v.why}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {VERDICTS.map((vd) => (
                          <button key={vd.k} onClick={() => postReview(v, { verdict: vd.k })}
                            className={`cursor-pointer rounded-md border px-2.5 py-1 font-mono text-[10px] transition-colors ${rev?.verdict === vd.k ? vd.on : "border-[var(--border)] bg-bg-input text-text-faint hover:border-text-muted"}`}>
                            {vd.label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={rev?.reason ?? ""}
                        placeholder="motivo / nota para corregir…"
                        onChange={(e) => v.key && setReviews((s) => ({ ...s, [v.key!]: { verdict: s[v.key!]?.verdict ?? "", reason: e.target.value } }))}
                        onBlur={() => postReview(v, {})}
                        className="mt-2 w-full rounded-md border border-[var(--border)] bg-bg-input px-2.5 py-1.5 font-mono text-[11px] text-text outline-none placeholder:text-text-faint focus:border-accent"
                      />
                    </div>
                  )}
                </div>
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
        <HourlyChart hoursList={hoursList} hoursData={cam.hours} infByHour={infByHour} current={hour} onPick={setHour} />
      </div>

      {/* GALERÍA DE VEHÍCULOS (fotitos, recortadas del video en el navegador) */}
      <VehicleGallery camId={cam.id} camName={cam.nombre} hour={hour} det={det} media={media}
        infrById={infrById} onSeek={(t) => void load(cam.id, hour, t)} />
    </Shell>
  );
}

// Panel de admin para cambiar la contraseña PÚBLICA del demo (senttra.com/demo). Lee/escribe
// el pass en el backend (/api/demo-pass, solo admin); nunca queda hardcodeado en el repo.
function DemoPassPanel({ api, token }: { api: string; token: string }) {
  const [cur, setCur] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => {
    fetch(`${api}/api/demo-pass?k=${encodeURIComponent(token)}&_=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.pass) { setCur(d.pass); setVal(d.pass); } })
      .catch(() => {});
  }, [api, token]);

  const save = async () => {
    const p = val.trim();
    if (p.length < 4) { setState("err"); return; }
    setState("saving");
    try {
      const r = await fetch(`${api}/api/demo-pass?k=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pass: p }),
      });
      if (r.ok) { setCur(p); setState("ok"); setTimeout(() => setState("idle"), 2200); } else setState("err");
    } catch { setState("err"); }
  };

  const changed = cur !== null && val.trim() !== cur;
  return (
    <div className="mb-4 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">Contraseña del demo público</div>
          <div className="mt-1 font-mono text-[10px] text-text-faint">para <span className="text-accent">senttra.com/demo</span> · cambiarla desconecta a quien tenga la anterior</div>
        </div>
        {state === "ok" && <span className="font-mono text-[11px] text-accent">✓ Guardada</span>}
        {state === "err" && <span className="font-mono text-[11px] text-danger">Error (mín. 4 caracteres)</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input type={show ? "text" : "password"} value={val} onChange={(e) => { setVal(e.target.value); setState("idle"); }}
            placeholder={cur === null ? "cargando…" : "nueva contraseña"}
            className="w-[220px] rounded-lg border border-[var(--border)] bg-bg-input py-2.5 pl-3.5 pr-16 font-mono text-sm text-text outline-none focus:border-accent" />
          <button type="button" onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint hover:text-accent">{show ? "ocultar" : "ver"}</button>
        </div>
        <button onClick={save} disabled={!changed || state === "saving"}
          className={`rounded-lg border px-3.5 py-2.5 font-mono text-[11px] transition-colors ${changed ? "border-accent text-accent hover:bg-[#123a2a]" : "border-[var(--border)] text-text-faint"}`}>
          {state === "saving" ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </div>
    </div>
  );
}

// Galería de vehículos: un tile por vehículo detectado en la hora seleccionada. La miniatura
// se RECORTA del video en el navegador (canvas), así "todos los vehículos" no requiere generar
// miles de imágenes en el servidor. Solo se generan las miniaturas de la página visible.
type Veh = { id: number; cls: number; t: number; x: number; y: number; w: number; h: number; infr: boolean; kind?: "giro" | "uturn" | "rojo" };
const KIND_LABEL: Record<string, string> = { giro: "GIRO", uturn: "VUELTA U", rojo: "ROJO" };

function VehicleGallery({ camId, camName, hour, det, media, infrById, onSeek }: {
  camId: string; camName: string; hour: string; det: Det | null;
  media: (p: string) => string; infrById: Map<number, "giro" | "uturn" | "rojo">;
  onSeek: (t: number) => void;
}) {
  const PAGE = 24;
  const [fTipo, setFTipo] = useState("Todos");
  const [fId, setFId] = useState("");
  const [soloInfr, setSoloInfr] = useState(false);
  const [page, setPage] = useState(0);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const thumbsRef = useRef(thumbs); thumbsRef.current = thumbs;
  const vidRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { setPage(0); setThumbs({}); }, [camId, hour]);
  useEffect(() => { setPage(0); }, [fTipo, fId, soloInfr]);

  const vehicles = useMemo<Veh[]>(() => {
    if (!det) return [];
    const best = new Map<number, { area: number; slot: number; x: number; y: number; w: number; h: number }>();
    for (const [s, arr] of Object.entries(det.boxes)) {
      const slot = +s;
      for (const [id, x, y, w, h] of arr) {
        const a = w * h; const cur = best.get(id);
        if (!cur || a > cur.area) best.set(id, { area: a, slot, x, y, w, h });
      }
    }
    const list: Veh[] = [];
    best.forEach((b, id) => list.push({
      id, cls: det.ids[id] ?? 2, t: b.slot / det.fps, x: b.x, y: b.y, w: b.w, h: b.h,
      infr: infrById.has(id), kind: infrById.get(id),
    }));
    list.sort((a, b) => a.t - b.t);
    return list;
  }, [det, infrById]);

  const filtered = useMemo(() => vehicles.filter((v) => {
    if (soloInfr && !v.infr) return false;
    if (fTipo !== "Todos" && (TIPO[v.cls] ?? "") !== fTipo) return false;
    if (fId.trim() && !String(v.id).includes(fId.trim())) return false;
    return true;
  }), [vehicles, soloInfr, fTipo, fId]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const sliceKey = slice.map((v) => v.id).join(",");

  // Genera las miniaturas de la página visible: busca el frame representativo de cada vehículo
  // en un <video> oculto (crossOrigin, el backend manda ACAO:*) y recorta su caja a un canvas.
  useEffect(() => {
    const v = vidRef.current; if (!v || !det || !slice.length) return;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const waitReady = () => v.readyState >= 2 ? Promise.resolve() : new Promise<void>((res) => {
      const h = () => { v.removeEventListener("loadeddata", h); res(); }; v.addEventListener("loadeddata", h);
    });
    const seekTo = (t: number) => new Promise<void>((res) => {
      const h = () => { v.removeEventListener("seeked", h); res(); };
      v.addEventListener("seeked", h);
      try { v.currentTime = t; } catch { v.removeEventListener("seeked", h); res(); }
    });
    (async () => {
      await waitReady();
      for (const veh of slice) {
        if (cancelled) return;
        if (thumbsRef.current[veh.id] !== undefined) continue;
        await seekTo(veh.t);
        if (cancelled) return;
        const sc = v.videoWidth ? v.videoWidth / det.nw : 1;
        const pad = 0.18, bw = veh.w * sc, bh = veh.h * sc;
        const cw = Math.max(8, bw * (1 + 2 * pad)), ch = Math.max(8, bh * (1 + 2 * pad));
        const px = Math.max(0, veh.x * sc - bw * pad), py = Math.max(0, veh.y * sc - bh * pad);
        const TW = 200, TH = Math.max(60, Math.round(TW * ch / cw));
        canvas.width = TW; canvas.height = TH;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        let url = "";
        try { ctx.drawImage(v, px, py, cw, ch, 0, 0, TW, TH); url = canvas.toDataURL("image/jpeg", 0.72); }
        catch { url = ""; }
        if (!cancelled) setThumbs((s) => ({ ...s, [veh.id]: url }));
      }
    })();
    return () => { cancelled = true; };
  }, [sliceKey, det]); // eslint-disable-line react-hooks/exhaustive-deps

  const time = (t: number) => `${hour}:${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const selCls = "appearance-none rounded-lg border border-[var(--border-strong)] bg-[#0f241b] px-3.5 py-2.5 font-sans text-[13px] text-text outline-none";
  const pageBtn = "rounded-lg border border-[var(--border-strong)] px-3 py-2 font-mono text-[12px] text-text-muted transition-colors hover:text-accent disabled:opacity-35 disabled:hover:text-text-muted";

  return (
    <div className="mt-6 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-6">
      <video ref={vidRef} src={media(`${camId}/video/${hour}.mp4`)} crossOrigin="anonymous" muted playsInline preload="auto" className="hidden" />
      <div className="flex items-baseline gap-3">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Galería de vehículos</div>
        <div className="font-display text-lg font-extrabold text-text">{nf(filtered.length)}</div>
        <div className="font-mono text-[12px] text-accent">vehículos · {camName}</div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Tipo</span>
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={selCls}>
            {["Todos", "Auto", "Moto", "Bus", "Camión"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">Buscar ID</span>
          <input value={fId} onChange={(e) => setFId(e.target.value)} placeholder="# id…" className={`${selCls} w-[130px] placeholder:text-text-faint`} />
        </label>
        <button onClick={() => setSoloInfr((s) => !s)} className="flex items-center gap-2.5 py-2.5 font-sans text-[13px] text-text">
          <span className={`grid size-4 place-items-center rounded border ${soloInfr ? "border-danger bg-danger text-[#081411]" : "border-[var(--border-strong)]"}`}>{soloInfr ? "✓" : ""}</span>
          Solo infracciones
        </button>
        <button onClick={() => { setFTipo("Todos"); setFId(""); setSoloInfr(false); }} className="py-2.5 font-sans text-[13px] text-text-muted transition-colors hover:text-accent">Limpiar</button>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 font-mono text-xs text-text-faint">Sin vehículos para este filtro.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {slice.map((v) => {
            const thumb = thumbs[v.id];
            return (
              <button key={v.id} onClick={() => onSeek(v.t)} title={`#${v.id} · ${time(v.t)}`}
                className="group overflow-hidden rounded-[10px] border border-[var(--border)] bg-bg-card text-left transition-colors hover:border-accent">
                <div className="relative h-[92px] bg-[#081411]">
                  {thumb ? (
                    <img src={thumb} alt={`Vehículo ${v.id}`} className="h-full w-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 120 92" preserveAspectRatio="none" className={`absolute inset-0 h-full w-full ${thumb === undefined ? "animate-sn-pulse" : ""}`}>
                      <path d="M9 22V9h13M98 9h13v13M111 70v13H98M22 83H9V70" fill="none" stroke="rgba(61,214,140,.35)" strokeWidth={2} />
                    </svg>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-[rgba(8,20,17,.82)] px-1.5 py-1 font-mono text-[9px] font-semibold text-text">{TIPO[v.cls] ?? "—"}</span>
                  {v.infr && <span className="absolute right-1.5 top-1.5 rounded bg-danger px-1.5 py-1 font-mono text-[8px] font-bold tracking-[0.08em] text-[#081411]">{KIND_LABEL[v.kind ?? "rojo"]}</span>}
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] px-2.5 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: COL[v.cls] ?? "#9aa" }} />
                    <span className="font-mono text-[11px] font-semibold text-text">#{v.id}</span>
                  </span>
                  <span className="font-mono text-[10px] text-accent">{time(v.t)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className={pageBtn}>‹ Anterior</button>
          <span className="px-2 font-mono text-[12px] text-text-muted">{cur + 1} / {pages}</span>
          <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={pageBtn}>Siguiente ›</button>
        </div>
      )}
    </div>
  );
}

// Gráfico por hora: barras de volumen (eje izq) + línea de infracciones (eje der), estilo
// SVG con rejilla y ejes — como el diseño original (no las barras CSS crudas).
function HourlyChart({ hoursList, hoursData, infByHour, current, onPick }: {
  hoursList: string[]; hoursData: Record<string, HourInfo>;
  infByHour: Record<string, number>; current: string; onPick: (hk: string) => void;
}) {
  const VBW = 1180, VBH = 300, padL = 46, padR = 42, padT = 14, padB = 34;
  const plotW = VBW - padL - padR, plotH = VBH - padT - padB, baseY = padT + plotH;
  const slot = plotW / 24, barW = slot * 0.56;
  const niceMax = (v: number) => {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
    const n = v / p; const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  };
  const rawV = Math.max(1, ...hoursList.map((hk) => hoursData[hk]?.n_veh ?? 0));
  const rawI = Math.max(1, ...hoursList.map((hk) => infByHour[hk] ?? 0));
  const maxV = niceMax(rawV), maxI = niceMax(rawI);
  const yV = (v: number) => baseY - (v / maxV) * plotH;
  const yI = (v: number) => baseY - (v / maxI) * plotH;
  const cx = (i: number) => padL + slot * i + slot / 2;
  const STEPS = 4;

  const linePts = hoursList
    .map((hk, i) => (hoursData[hk] ? `${cx(i)},${yI(infByHour[hk] ?? 0)}` : null))
    .filter(Boolean).join(" ");

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" className="mt-4 block h-auto select-none" role="img">
      {/* rejilla + eje izquierdo (vehículos) */}
      {Array.from({ length: STEPS + 1 }, (_, g) => {
        const v = (maxV / STEPS) * g, y = yV(v);
        return (
          <g key={`g${g}`}>
            <line x1={padL} y1={y} x2={VBW - padR} y2={y} stroke="rgba(141,168,154,.10)" strokeWidth={1} />
            <text x={padL - 8} y={y + 3} fill="#5f7468" fontFamily="IBM Plex Mono, monospace" fontSize={9} textAnchor="end">{nf(Math.round(v))}</text>
          </g>
        );
      })}
      {/* eje derecho (infracciones) */}
      {Array.from({ length: STEPS + 1 }, (_, g) => {
        const v = (maxI / STEPS) * g;
        return (
          <text key={`ri${g}`} x={VBW - padR + 8} y={yI(v) + 3} fill="#a06a55" fontFamily="IBM Plex Mono, monospace" fontSize={9} textAnchor="start">{Math.round(v)}</text>
        );
      })}
      {/* barras de volumen (clic = seleccionar hora) */}
      {hoursList.map((hk, i) => {
        const on = !!hoursData[hk]; const nv = hoursData[hk]?.n_veh ?? 0;
        const y = yV(nv); const isCur = hk === current;
        return (
          <g key={`b${hk}`} onClick={() => on && onPick(hk)} className={on ? "cursor-pointer" : undefined}>
            <title>{`${hk}:00 · ${nf(nv)} veh · ${infByHour[hk] ?? 0} infr`}</title>
            <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
            {on && <rect x={cx(i) - barW / 2} y={y} width={barW} height={Math.max(0, baseY - y)} rx={1.5}
              fill={isCur ? "#3dd68c" : "#2e7d64"} className="transition-[fill] hover:brightness-125" />}
          </g>
        );
      })}
      {/* línea de infracciones */}
      <polyline points={linePts} fill="none" stroke="#e0655a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {hoursList.map((hk, i) => (hoursData[hk] ? (
        <circle key={`d${hk}`} cx={cx(i)} cy={yI(infByHour[hk] ?? 0)} r={2.6} fill="#e0655a" />
      ) : null))}
      {/* etiquetas de hora cada 3 */}
      {hoursList.map((hk, i) => (i % 3 === 0 ? (
        <text key={`hl${hk}`} x={cx(i)} y={baseY + 18} fill="#5f7468" fontFamily="IBM Plex Mono, monospace" fontSize={9} textAnchor="middle">{hk}</text>
      ) : null))}
    </svg>
  );
}

function Shell({ children, wide = false, admin = false }: { children: React.ReactNode; wide?: boolean; admin?: boolean }) {
  return (
    <div className="min-h-screen w-full bg-bg text-text">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(8,20,17,0.9)] px-6 py-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <SentraLogoMark size={26} />
          <SentraWordmark />
          <span className={`ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] ${admin ? "text-warning" : "text-accent"}`}>{admin ? "Revisión" : "Demo"}</span>
        </Link>
        <div className="text-right font-mono text-[11px] leading-relaxed text-text-faint">
          {admin ? <>Modo revisión · marcá cada infracción<br />se guarda para corregir el algoritmo</>
                 : <>Monitoreo de tráfico · SPS<br />cajas dibujadas <span className="text-accent">en vivo</span> sobre video crudo</>}
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 sm:px-6 ${wide ? "max-w-[1600px]" : "max-w-[900px]"}`}>{children}</main>
    </div>
  );
}
