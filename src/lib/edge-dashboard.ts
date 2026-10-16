import type { HistoryItem } from "./history-detections";
import { COLOR, TYPE } from "./edge-replay";

export type PortalScreen = "home" | "explorer" | "activity" | "control";
export type ExploreMode = "vehicle_colors" | "shirt_colors" | "vehicle_types" | "combined" | "similar" | "archive";
export type DashboardNavigation = {
  screen: PortalScreen;
  explorer: { mode: ExploreMode | null; type: string; color: string; camera: string; when: string };
  map: { level: "region" | "honduras" | "cortes" | "sps"; zoom: number; nodesVisible: boolean };
};
export const INITIAL_DASHBOARD_NAVIGATION: DashboardNavigation = {
  screen: "home", explorer: { mode: null, type: "", color: "", camera: "", when: "" },
  map: { level: "region", zoom: 1, nodesVisible: true },
};
export type DashboardCamera = { key: string; title: string; receiving: boolean; url?: string; preview_url?: string };
export type Distribution = { key: string; total: number };
export type DashboardSummary = {
  totals: { uturn: number; rojo: number };
  distributions: { vehicle_colors: Distribution[]; shirt_colors: Distribution[]; vehicle_types: Distribution[] };
  hours: { hour: number; vehicles: number; uturn: number; rojo: number }[];
  featured: HistoryItem | null;
  events: HistoryItem[];
  counting: "appearances_per_camera_session";
};
export type CatalogFilter = { category: "incidents" | "vehicles" | "persons"; kind?: string; type?: string; color?: string; camera?: string };
export type MapArea = { id: string; name: string; path: string; label: [number, number]; centroid: [number, number]; bounds: number[] };
export type GeoMap = {
  name: string; viewBox: string;
  projection: { type: string; scale: number; translate: [number, number]; geoBounds: number[] };
  areas?: MapArea[];
  attribution: { text?: string; label?: string; name?: string; url?: string; license?: string }[];
  boundary?: { path: string };
  roads?: { path: string; class?: string; name?: string }[];
  water?: { path: string; class?: string; name?: string }[];
  parks?: { path: string; name?: string }[];
  labels?: { name: string; x: number; y: number; class?: string }[];
};
export type DashboardMaps = Record<"region" | "honduras" | "cortes" | "sps", GeoMap>;
export const numberText = (value: number) => new Intl.NumberFormat("es-HN").format(value);
const TYPE_LABELS: Record<string, string> = { ...TYPE, moto: "Motocicleta", auto: "Automóvil" };
const COLOR_LABELS: Record<string, string> = { ...COLOR, morado: "Morado", rosado: "Rosado", rosa: "Rosado" };
export const attributeLabel = (key: string, type = false) => key === "sin_clasificar" ? "Sin clasificar" : (type ? TYPE_LABELS : COLOR_LABELS)[key] ?? key;
export const SWATCHES: Record<string, string> = { blanco: "#e2e8e5", negro: "#3a4544", gris: "#88978f", plata: "#b8c7c3", plateado: "#b8c7c3", rojo: "#eb7872", azul: "#5f9ce5", verde: "#5bd3a4", amarillo: "#eac76a", cafe: "#987158", marron: "#987158", beige: "#d7c1a1", naranja: "#e9a065", morado: "#b59bdf", rosado: "#e6a6bf", rosa: "#e6a6bf", otro_color: "#8aa7a5", sin_clasificar: "#526b61" };
export const SERIES = ["#57dba5", "#72b3da", "#c4d582", "#ac9be1", "#ecb074", "#85bba5", "#ef8e86", "#a9bac7"];

export function project(map: GeoMap, longitude: number, latitude: number): [number, number] {
  const mercator = Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 180 / Math.PI;
  return [longitude * map.projection.scale + map.projection.translate[0], -mercator * map.projection.scale + map.projection.translate[1]];
}

let mapPromise: Promise<DashboardMaps> | undefined;
export function loadDashboardMaps(): Promise<DashboardMaps> {
  if (!mapPromise) mapPromise = Promise.all((["region", "honduras", "cortes", "sps"] as const).map(async key => {
    const response = await fetch(`/senttra/maps/${key}.json`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("No se pudo preparar el mapa.");
    return [key, await response.json()] as const;
  })).then(entries => Object.fromEntries(entries) as DashboardMaps).catch(error => { mapPromise = undefined; throw error; });
  return mapPromise;
}

// Warm only same-origin media belonging to the signed-in viewer. No players are
// mounted here; the real HLS player remains responsible for playback and retries.
export async function warmCamera(camera: DashboardCamera, signal: AbortSignal) {
  const source = camera.preview_url ?? camera.url;
  if (!camera.receiving || !source) return;
  const safe = (value: string, base = location.href) => {
    const url = new URL(value, base);
    return url.origin === location.origin && url.pathname.startsWith("/edge/media/") ? url.href : null;
  };
  let url = safe(source);
  if (!url) return;
  try {
    for (let depth = 0; depth < 2; depth++) {
      const response = await fetch(url, { signal, cache: "default" });
      if (!response.ok) return;
      const manifest = await response.text();
      if (!manifest.startsWith("#EXTM3U")) return;
      const entries = manifest.split(/\r?\n/).filter(line => line && !line.startsWith("#"));
      if (manifest.includes("#EXT-X-STREAM-INF")) { url = safe(entries[0], url); if (!url) return; continue; }
      const init = /#EXT-X-MAP:.*URI="([^"]+)"/.exec(manifest)?.[1];
      const urls = [init, entries.at(-2) ?? entries.at(-1)].filter((entry): entry is string => !!entry).map(entry => safe(entry, url!)).filter((entry): entry is string => !!entry);
      await Promise.allSettled(urls.map(async fragment => {
        const part = await fetch(fragment, { signal, cache: "default" });
        if (part.ok) await part.arrayBuffer();
      }));
      return;
    }
  } catch { /* A preview is optional; playback will reconnect on demand. */ }
}
