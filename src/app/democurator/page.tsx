"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";
import { ServerGate } from "@/components/sentra/server-gate";

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";
const COL: Record<number, string> = { 2: "#3dd68c", 3: "#e6b24d", 5: "#6fc9f2", 7: "#c85adc" };
const TIPO: Record<number, string> = { 2: "Auto", 3: "Moto", 5: "Bus", 7: "Camión" };

type Det = { base_ts: number; fps: number; nw: number; nh: number; ids: Record<string, number>;
  boxes: Record<string, [number, number, number, number, number][]> };
type Curator = { cams: { id: string; hours: string[]; variants: string[] }[]; labels: Record<string, string> };

function Viewer({ token }: { token: string }) {
  const [cur, setCur] = useState<Curator | null>(null);
  const [hour, setHour] = useState("07");
  const [ver, setVer] = useState<"detA" | "detB">("detA");
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState<Record<string, string>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detRef = useRef<Record<string, Det | null>>({});
  const verRef = useRef(ver); verRef.current = ver;
  const cam = "crowne";
  const media = useCallback((p: string) => `${API}/data/democurator/${p}?k=${encodeURIComponent(token)}`, [token]);

  useEffect(() => {
    fetch(`${API}/api/curator?k=${encodeURIComponent(token)}&_=${Date.now()}`)
      .then((r) => r.json()).then((c: Curator) => { setCur(c); const h = c.cams[0]?.hours?.[0]; if (h) setHour(h); }).catch(() => {});
  }, [token]);

  // cargar det de AMBAS versiones para la hora (para togglear al instante)
  const loadDets = useCallback(async (hk: string) => {
    for (const v of ["detA", "detB"]) {
      const key = `${v}/${hk}`;
      if (detRef.current[key] === undefined) {
        try { detRef.current[key] = await (await fetch(media(`${cam}/${v}/${hk}.json`) + "&_=" + Date.now())).json(); }
        catch { detRef.current[key] = null; }
      }
    }
  }, [media]);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    setLoading(true);
    void loadDets(hour);
    v.onloadedmetadata = () => { try { v.currentTime = 0; } catch {} void v.play().catch(() => {}); };
    v.src = media(`${cam}/video/${hour}.mp4`); v.load();
  }, [hour, loadDets, media]);

  // loop de dibujo
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current, c = canvasRef.current;
      if (v && c) {
        if (c.width !== c.clientWidth) { c.width = c.clientWidth; c.height = c.clientHeight; }
        const ctx = c.getContext("2d");
        const d = detRef.current[`${verRef.current}/${hour}`];
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          if (d && !v.seeking && v.readyState >= 2) {
            const slot = Math.round(v.currentTime * d.fps);
            const boxes = d.boxes[slot] ?? d.boxes[slot - 1] ?? d.boxes[slot + 1];
            const sx = c.width / d.nw, sy = c.height / d.nh; const drawn = new Set<number>();
            if (boxes) for (const [id, x, y, w, h] of boxes) {
              if (drawn.has(id)) continue; drawn.add(id);
              const cls = d.ids[id] ?? 2; const color = COL[cls] ?? "#9aa";
              ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x * sx, y * sy, w * sx, h * sy);
              const lb = `${TIPO[cls] ?? ""} #${id}`;
              ctx.font = "600 12px ui-monospace, monospace"; const tw = ctx.measureText(lb).width;
              ctx.fillStyle = color; ctx.fillRect(x * sx - 1, y * sy - 17, tw + 10, 16);
              ctx.fillStyle = "#081411"; ctx.fillText(lb, x * sx + 4, y * sy - 5);
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const v = videoRef.current;
    const onReady = () => setLoading(false);
    v?.addEventListener("playing", onReady); v?.addEventListener("error", onReady);
    return () => { cancelAnimationFrame(raf); v?.removeEventListener("playing", onReady); v?.removeEventListener("error", onReady); };
  }, [hour]);

  const vote = async (verdict: string) => {
    setVoted((s) => ({ ...s, [hour]: verdict }));
    try {
      await fetch(`${API}/api/curator-vote?k=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cam, hour, verdict }),
      });
    } catch {}
  };

  const hours = cur?.cams[0]?.hours ?? ["07", "08", "09", "10"];

  return (
    <div className="min-h-screen w-full bg-bg text-text">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(8,20,17,0.9)] px-6 py-4 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <SentraLogoMark size={26} /><SentraWordmark />
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-warning">Curador</span>
        </Link>
        <div className="text-right font-mono text-[11px] leading-relaxed text-text-faint">
          Comparación ciega de trackers · SPS<br />¿cuál <span className="text-accent">salta menos</span>? Miralo y votá
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        {/* toggle grande V1/V2 */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-3">
          <span className="ml-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Versión:</span>
          {(["detA", "detB"] as const).map((v, i) => (
            <button key={v} onClick={() => setVer(v)}
              className={`cursor-pointer rounded-lg border px-5 py-2 font-display text-[15px] font-bold transition-colors ${ver === v ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-muted hover:border-accent"}`}>
              Versión {i + 1}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-text-faint">Tip: prendé <b className="text-text">rastros</b> con la vista y flipeá V1↔V2 en la misma escena para ver quién brinca de carro.</span>
        </div>

        {/* video + overlay */}
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg">
          <video ref={videoRef} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          <div className="absolute left-3 top-3 rounded-full bg-[rgba(8,20,17,0.72)] px-3 py-1.5 font-display text-sm font-bold text-accent">
            Versión {ver === "detA" ? "1" : "2"} · {hour}:00
          </div>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-[rgba(8,20,17,0.55)]">
              <span className="size-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent" />
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Cargando</span>
            </div>
          )}
        </div>

        {/* selector de horas */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {hours.map((hk) => (
            <button key={hk} onClick={() => setHour(hk)}
              className={`cursor-pointer rounded-md border px-3 py-1.5 font-mono text-[12px] transition-colors ${hk === hour ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-muted hover:border-accent"} ${voted[hk] ? "ring-1 ring-accent/40" : ""}`}>
              {hk}h {voted[hk] ? "✓" : ""}
            </button>
          ))}
        </div>

        {/* veredicto */}
        <div className="mt-4 rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-5">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Para la hora {hour}:00 · ¿cuál es mejor (menos saltos de id)?
          </div>
          <div className="flex flex-wrap gap-2">
            {[{ k: "v1", t: "Versión 1 mejor" }, { k: "v2", t: "Versión 2 mejor" }, { k: "iguales", t: "Iguales" }].map((o) => (
              <button key={o.k} onClick={() => vote(o.k)}
                className={`cursor-pointer rounded-lg border px-4 py-2 font-mono text-[12px] transition-colors ${voted[hour] === o.k ? "border-accent bg-[#123a2a] text-accent" : "border-[var(--border)] bg-bg-input text-text-muted hover:border-accent"}`}>
                {o.t}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono text-[10px] text-text-faint">Tu voto se guarda para que el equipo lo lea. Las versiones son ciegas a propósito.</p>
        </div>
      </main>
    </div>
  );
}

export default function DemoCuratorPage() {
  return (
    <ServerGate api={API} verifyPath="/api/curator" label="Curador" storageKey="sentra-curator">
      {(token) => <Viewer token={token} />}
    </ServerGate>
  );
}
