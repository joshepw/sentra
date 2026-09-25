"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Camera } from "@/lib/edge-replay";
import type { Point, Profile, Region, RegionState } from "@/lib/edge-regions";

const button = "rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs hover:border-accent disabled:opacity-40";

export function EdgeZoneEditor({ camera, initial, time, csrf, onClose, onSaved }: {
  camera: Camera; initial: RegionState; time: number; csrf: string; onClose: () => void; onSaved: (state: RegionState) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null);
  const [profile, setProfile] = useState<Profile>(() => structuredClone(initial.profiles[camera.key]));
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Point[]>([]), [drawing, setDrawing] = useState(false);
  const [kind, setKind] = useState<Region["kind"]>("exclude");
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(Math.max(0, Math.min(89, time)));
  useEffect(() => { dialog.current?.showModal(); }, []);
  const update = (id: string, values: Partial<Region>) => setProfile(old => ({ ...old, regions: old.regions.map(region => region.id === id ? { ...region, ...values } : region) }));
  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  };
  const finish = () => {
    if (draft.length < 3) return;
    const id = crypto.randomUUID();
    setProfile(old => ({ ...old, regions: [...old.regions, { id, name: `${kind === "exclude" ? "Excluir" : "Incluir"} ${old.regions.length + 1}`, kind, enabled: true, points: draft }] }));
    setSelected(id); setDrawing(false); setDraft([]);
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/edge/api/regions", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ camera: camera.key, revision: initial.revision, profile }) });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? "Sesión vencida. Volvé a entrar para guardar." : result.error || "No se pudieron guardar las zonas.");
      onSaved(result);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const current = profile.regions.find(region => region.id === selected);
  const coordinates = (points: Point[]) => points.map(([x, y]) => `${x * 1000},${y * 562.5}`).join(" ");
  return <dialog ref={dialog} aria-labelledby="zone-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="fixed m-auto max-h-[94dvh] w-[min(1100px,96vw)] overflow-auto rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-4 text-text shadow-2xl backdrop:bg-black/75 sm:p-6">
    <div className="mb-3 flex items-center justify-between gap-3"><h2 id="zone-title" className="font-display text-xl font-bold">Zonas · {camera.title}</h2><button disabled={busy} onClick={onClose} className={button}>Cerrar sin guardar</button></div>
    <p className="mb-3 text-sm text-text-muted">Marcá un polígono para ignorar las detecciones cuyo centro caiga dentro. El video queda intacto. Las zonas verdes limitan el área que se analiza.</p>
    <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border)] bg-black">
      <video ref={video} src={`/edge${camera.url}`} muted playsInline preload="auto" onLoadedMetadata={() => { if (video.current) video.current.currentTime = position; }} className="h-full w-full object-contain" />
      <svg data-zone-canvas viewBox="0 0 1000 562.5" className={`absolute inset-0 h-full w-full touch-none ${drawing ? "cursor-crosshair" : ""}`} aria-label="Dibujar zonas sobre la cámara" onPointerDown={event => { if (drawing && !busy && draft.length < 128) { const p = point(event); setDraft(old => [...old, p]); } }} onPointerMove={event => {
        if (!drag || busy) return;
        const p = point(event); setProfile(old => ({ ...old, regions: old.regions.map(region => region.id !== drag.id ? region : { ...region, points: region.points.map((value, index) => index === drag.index ? p : value) }) }));
      }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {profile.regions.map(region => <g key={region.id} opacity={region.enabled ? 1 : .3}>
          <polygon points={coordinates(region.points)} fill={region.kind === "exclude" ? "#f8717135" : "#3dd68c35"} stroke={region.kind === "exclude" ? "#f87171" : "#3dd68c"} strokeWidth={region.id === selected ? 3 : 1.5} onPointerDown={event => { if (!drawing && !busy) { event.stopPropagation(); setSelected(region.id); } }}><title>{region.name}</title></polygon>
          {region.id === selected && !drawing && region.points.map(([x, y], index) => <circle key={index} cx={x * 1000} cy={y * 562.5} r={6} fill="white" stroke="#081411" className="cursor-move" onPointerDown={event => { if (busy) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: region.id, index }); }} />)}
        </g>)}
        {draft.length > 0 && <><polyline points={coordinates(draft)} fill="none" stroke="#fbbf24" strokeWidth={2} />{draft.map(([x, y], index) => <circle key={index} cx={x * 1000} cy={y * 562.5} r={4} fill="#fbbf24" />)}</>}
      </svg>
    </div>
    <label className="mt-3 flex items-center gap-3 text-xs text-text-muted">Cuadro de referencia<input aria-label="Cuadro de referencia" type="range" min="0" max="89" step="0.1" value={position} onChange={event => { const t = Number(event.target.value); setPosition(t); if (video.current) video.current.currentTime = t; }} className="min-w-0 flex-1 accent-accent" /><span>{position.toFixed(1)} s</span></label>
    <div className="my-4 flex flex-wrap gap-2">
      {!drawing ? <><button disabled={busy || profile.regions.length >= 32} className={button} onClick={() => { setKind("exclude"); setDrawing(true); setSelected(null); }}>Nueva exclusión</button><button disabled={busy || profile.regions.length >= 32} className={button} onClick={() => { setKind("include"); setDrawing(true); setSelected(null); }}>Nueva inclusión</button></> : <><span className="self-center text-xs text-warning">Tocá las esquinas · {draft.length}/128 puntos</span><button disabled={draft.length < 3} className={button} onClick={finish}>Cerrar polígono</button><button disabled={!draft.length} className={button} onClick={() => setDraft(old => old.slice(0, -1))}>Deshacer punto</button><button className={button} onClick={() => { setDraft([]); setDrawing(false); }}>Cancelar dibujo</button></>}
    </div>
    <div className="flex flex-wrap gap-2">{profile.regions.map(region => <button disabled={busy || drawing} key={region.id} className={`${button} ${selected === region.id ? "border-accent text-accent" : ""}`} aria-pressed={selected === region.id} onClick={() => setSelected(region.id)}>{region.name}{region.enabled ? "" : " · desactivada"}</button>)}</div>
    {current && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><label>Nombre <input aria-label="Nombre de zona" disabled={busy} maxLength={80} className="ml-2 max-w-[180px] rounded border border-[var(--border)] bg-bg p-2" value={current.name} onChange={event => update(current.id, { name: event.target.value })} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={current.enabled} disabled={busy} onChange={event => update(current.id, { enabled: event.target.checked })} />Activa</label><button disabled={busy} className={button} onClick={() => { setProfile(old => ({ ...old, regions: old.regions.filter(region => region.id !== current.id) })); setSelected(null); }}>Eliminar zona</button><span className="text-text-faint">Arrastrá los puntos para ajustar.</span></div>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><p className="max-w-[700px] text-xs leading-relaxed text-text-muted">Guardar aplica las zonas al visor para todos los usuarios. La siguiente prueba las usa antes de asignar IDs. Para recuperar detecciones de una zona quitada, ejecutá una nueva prueba.</p><button disabled={busy || drawing} className="rounded-lg bg-accent px-4 py-2 font-bold text-[#062017] disabled:opacity-40" onClick={save}>{busy ? "Guardando…" : "Guardar zonas"}</button></div>
  </dialog>;
}
