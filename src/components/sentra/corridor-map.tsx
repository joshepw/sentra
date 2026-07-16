"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAP, type MapPin } from "@/components/sentra/corridor-map-data";

type MapCam = { id: string; nombre: string; n_giro: number; n_rojo: number };

const { vw: VW, vh: VH } = MAP;
const DEFAULT_PIN: MapPin = { x: 0.5, y: 0.5, bearing: 90 };
const norm360 = (d: number) => ((d % 360) + 360) % 360;

// Cono + punta de la flecha "hacia dónde ve la cámara" a partir del rumbo (grados, horario desde el norte).
function facing(cx: number, cy: number, bearing: number, len = 26) {
  const a = ((bearing - 90) * Math.PI) / 180;   // svg: 0°=este, norte=-90°
  const s = 22;
  const cone = `M${cx} ${cy} L${(cx + s * Math.cos(a + 0.35)).toFixed(1)} ${(cy + s * Math.sin(a + 0.35)).toFixed(1)} L${(cx + s * Math.cos(a - 0.35)).toFixed(1)} ${(cy + s * Math.sin(a - 0.35)).toFixed(1)} Z`;
  return { cone, tip: [cx + len * Math.cos(a), cy + len * Math.sin(a)] as const };
}

export function CorridorMap({ cams, sel, onPick, admin, api, token }: {
  cams: MapCam[]; sel: number; onPick: (i: number) => void;
  admin: boolean; api: string; token: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [layout, setLayout] = useState<Record<string, MapPin>>(MAP.camDefaults);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "rot" } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "ok">("idle");
  // viewport: encuadre movible (pan) + zoom del mapa. k=escala, tx/ty=desplazamiento en unidades viewBox.
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const pan = useRef<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // Cargar el layout guardado (posiciones/ángulos que el admin ajustó) y fusionar sobre los defaults.
  useEffect(() => {
    let alive = true;
    fetch(`${api}/api/map?k=${encodeURIComponent(token)}&_=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((saved: Record<string, MapPin>) => { if (alive && saved && typeof saved === "object") setLayout({ ...MAP.camDefaults, ...saved }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [api, token]);

  const pin = (id: string) => layout[id] ?? MAP.camDefaults[id] ?? DEFAULT_PIN;

  // coords locales del grupo transformado (= coords viewBox donde viven los pines), para arrastrar pines
  const toUser = useCallback((clientX: number, clientY: number) => {
    const g = gRef.current; const ctm = g?.getScreenCTM(); if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);
  // coords en el espacio del viewBox (antes del transform del grupo), para zoom hacia el cursor
  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current; const ctm = svg?.getScreenCTM(); if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (pan.current) {   // arrastrando el mapa (encuadre)
      const svg = svgRef.current; const s = svg?.getScreenCTM()?.a || 1;   // px pantalla por unidad viewBox
      const dx = (e.clientX - pan.current.x) / s, dy = (e.clientY - pan.current.y) / s;
      pan.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      return;
    }
    if (!drag) return;
    const u = toUser(e.clientX, e.clientY); if (!u) return;
    setLayout((L) => {
      const cur = L[drag.id] ?? MAP.camDefaults[drag.id] ?? DEFAULT_PIN;
      if (drag.mode === "move") {
        return { ...L, [drag.id]: { ...cur, x: Math.min(1, Math.max(0, u.x / VW)), y: Math.min(1, Math.max(0, u.y / VH)) } };
      }
      const cx = cur.x * VW, cy = cur.y * VH;
      const deg = (Math.atan2(u.y - cy, u.x - cx) * 180) / Math.PI + 90;   // inverso de bearing-90
      return { ...L, [drag.id]: { ...cur, bearing: Math.round(norm360(deg)) } };
    });
    setDirty(true);
  }, [drag, toUser]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (pan.current) { pan.current = null; setPanning(false); try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {} }
    if (drag) { try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {} setDrag(null); }
  }, [drag]);

  // empezar a mover el mapa (pointerdown en el fondo, no en un pin)
  const startPan = (e: React.PointerEvent) => {
    pan.current = { x: e.clientX, y: e.clientY }; setPanning(true);
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch {}
  };

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor));
      const rf = k / v.k;
      return { k, tx: cx - rf * (cx - v.tx), ty: cy - rf * (cy - v.ty) };
    });
  }, []);
  const resetView = () => setView({ k: 1, tx: 0, ty: 0 });

  // zoom con rueda hacia el cursor (listener no-pasivo para poder preventDefault)
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = toSvg(e.clientX, e.clientY); if (!c) return;
      zoomAt(c.x, c.y, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toSvg, zoomAt]);

  const start = (id: string, mode: "move" | "rot") => (e: React.PointerEvent) => {
    if (!admin) return;
    e.stopPropagation();
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    setDrag({ id, mode });
  };

  const save = async () => {
    setSaving("saving");
    try {
      await fetch(`${api}/api/map?k=${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout),
      });
      setDirty(false); setSaving("ok"); setTimeout(() => setSaving("idle"), 1800);
    } catch { setSaving("idle"); }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-bg-panel">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Corredor 1ª Calle · Bulevar Morazán <span className="text-text-faint">· San Pedro Sula</span>
        </div>
        {admin ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-text-faint">arrastrá el punto · girá la flecha</span>
            <button onClick={() => { setLayout(MAP.camDefaults); setDirty(true); }}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 font-mono text-[10px] text-text-muted transition-colors hover:text-accent">Restablecer</button>
            <button onClick={save} disabled={!dirty && saving !== "ok"}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] transition-colors ${saving === "ok" ? "border-accent bg-[#123a2a] text-accent" : dirty ? "border-accent text-accent hover:bg-[#123a2a]" : "border-[var(--border)] text-text-faint"}`}>
              {saving === "saving" ? "Guardando…" : saving === "ok" ? "✓ Guardado" : "Guardar ubicaciones"}
            </button>
          </div>
        ) : (
          <div className="text-right font-mono text-[10px] tracking-[0.1em] text-text-faint"><span className="text-accent">{cams.length}</span> cámaras</div>
        )}
      </div>

      <div className="relative bg-[#07130e]">
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} className={`block h-auto w-full select-none ${panning ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ touchAction: "none" }} onPointerDown={startPan} onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
          <g ref={gRef} transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {/* calles reales */}
          {(["minor", "major", "corridor"] as const).map((c) =>
            MAP.streets.filter((s) => s.c === c).map((s, i) => (
              <path key={`${c}${i}`} d={s.d} fill="none" strokeLinecap="round" strokeLinejoin="round"
                stroke={c === "corridor" ? "#3dd68c" : c === "major" ? "#356b51" : "#1c3a2c"}
                strokeWidth={c === "corridor" ? 4.4 : c === "major" ? 2.6 : 1.3}
                strokeOpacity={c === "corridor" ? 0.95 : c === "major" ? 0.85 : 0.5} />
            ))
          )}
          {/* etiquetas de avenidas */}
          {MAP.avLabels.map((a, i) => (
            <text key={`av${i}`} x={a.x * VW} y={a.y * VH} fill="#54685c" fontFamily="var(--font-ibm-plex-mono), monospace" fontSize={10} textAnchor="middle">{a.t}av</text>
          ))}
          {/* pines de cámara */}
          {cams.map((c, i) => {
            const p = pin(c.id); const cx = p.x * VW, cy = p.y * VH;
            const hot = c.n_giro + c.n_rojo > 0;
            const col = hot ? "#e0655a" : "#3dd68c";
            const isSel = i === sel;
            const f = facing(cx, cy, p.bearing);
            const showLabel = isSel || hover === c.id || admin;
            return (
              <g key={c.id}>
                <path d={f.cone} fill={col} fillOpacity={0.16} />
                <line x1={cx} y1={cy} x2={f.tip[0]} y2={f.tip[1]} stroke={col} strokeWidth={1.8} />
                {/* manija de rotación (solo admin) */}
                {admin && (
                  <circle cx={f.tip[0]} cy={f.tip[1]} r={6} fill="#0f241b" stroke={col} strokeWidth={1.4}
                    className="cursor-crosshair" onPointerDown={start(c.id, "rot")}>
                    <title>girar dirección</title>
                  </circle>
                )}
                {isSel && <circle cx={cx} cy={cy} r={22} fill="none" stroke="#3dd68c" strokeWidth={1.4} className="origin-center animate-sn-ripout" style={{ transformBox: "fill-box" } as React.CSSProperties} />}
                {/* cuerpo del pin: clic = seleccionar; en admin, arrastrar = mover */}
                <g transform={`translate(${cx} ${cy})`} className={admin ? "cursor-move" : "cursor-pointer"}
                  onPointerDown={start(c.id, "move")}
                  onClick={() => { if (!drag) onPick(i); }}
                  onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover((h) => (h === c.id ? null : h))}>
                  <circle r={16} fill="transparent" />
                  <circle r={isSel ? 8 : 6.5} fill={isSel ? "#3dd68c" : "#0f241b"} fillOpacity={isSel ? 0.2 : 1} stroke={col} strokeWidth={1.8} />
                  <circle r={isSel ? 4 : 2.4} fill={col} />
                </g>
                {showLabel && (
                  <text x={cx} y={cy - 12} fill={col} fontFamily="var(--font-ibm-plex-mono), monospace" fontSize={11} fontWeight={600} textAnchor="middle"
                    className="pointer-events-none" style={{ paintOrder: "stroke", stroke: "#07130e", strokeWidth: 3 } as React.CSSProperties}>
                    {shortName(c.nombre)}{hot && ` · ${c.n_giro + c.n_rojo}`}
                  </text>
                )}
              </g>
            );
          })}
          </g>
        </svg>

        {/* controles de zoom / encuadre */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          {([["+", () => zoomAt(VW / 2, VH / 2, 1.4)], ["−", () => zoomAt(VW / 2, VH / 2, 1 / 1.4)]] as const).map(([lbl, fn]) => (
            <button key={lbl} onClick={fn} aria-label={lbl === "+" ? "acercar" : "alejar"}
              className="grid size-8 place-items-center rounded-lg border border-[var(--border-strong)] bg-[rgba(8,20,17,0.8)] font-mono text-base text-text-muted backdrop-blur-sm transition-colors hover:text-accent">{lbl}</button>
          ))}
          {(view.k !== 1 || view.tx !== 0 || view.ty !== 0) && (
            <button onClick={resetView} aria-label="restablecer encuadre"
              className="grid size-8 place-items-center rounded-lg border border-[var(--border-strong)] bg-[rgba(8,20,17,0.8)] font-mono text-[13px] text-text-muted backdrop-blur-sm transition-colors hover:text-accent">⟲</button>
          )}
        </div>
        {panning || view.k > 1 ? null : (
          <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">arrastrá para mover · rueda para zoom</div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3.5">
        <span className="size-2 rounded-full bg-accent shadow-[0_0_0_3px_rgba(61,214,140,0.18)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">Seleccionada</span>
        <span className="ml-1 font-display text-[14px] font-bold leading-tight">{cams[sel]?.nombre}</span>
      </div>
    </div>
  );
}

// nombre corto para la etiqueta del pin (usa el paréntesis o el sufijo _N)
function shortName(nombre: string): string {
  const paren = nombre.match(/\(([^)]+)\)/)?.[1];
  const suf = nombre.match(/_\s*0?(\d+)\s*$/)?.[1];
  const base = (paren ?? nombre.split("-").pop() ?? nombre).replace(/\s*_\s*0?\d+\s*$/, "").trim();
  return suf ? `${base} ·${suf}` : base;
}
