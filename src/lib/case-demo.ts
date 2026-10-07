import type { HistoryItem } from "./history-detections";

export type DemoDecision = "pending" | "confirmed" | "dismissed";
export type DemoCase = {
  decision: DemoDecision;
  note: string;
  activity: { decision: DemoDecision; at: number; note: string }[];
};
export type DemoCaseChange = { note: string } | { decision: DemoDecision; at: number };
export const EMPTY_DEMO_CASE: DemoCase = { decision: "pending", note: "", activity: [] };
export const DEMO_DECISION: Record<DemoDecision, string> = {
  pending: "Pendiente", confirmed: "Confirmada", dismissed: "Descartada",
};

// UI-only identities. Never send these records or decisions to the history API.
export function demoCaseKey(item: HistoryItem) {
  return JSON.stringify([item.run_id ?? item.playback.run_id ?? "", item.camera, item.uid]);
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function demoCaseNumber(item: HistoryItem) {
  return `DEM-${hash(demoCaseKey(item)).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function demoVehicleProfile(item: HistoryItem) {
  if (item.type === "persona" || item.class_id === 0) return null;
  const track = item.track_uid ?? item.playback.track_uid ?? item.uid;
  const seed = hash(JSON.stringify([item.run_id ?? item.playback.run_id ?? "", item.camera, track]));
  const names = ["Andrea Ríos", "Carlos Duarte", "Elena Mejía", "Daniel Pineda", "Lucía Paz", "Jorge Molina", "Ana Rivera", "Luis Flores"];
  return {
    plate: `DMO ${String(seed % 10000).padStart(4, "0")}`,
    owner: names[seed % names.length],
    document: `DEMO-${String(seed).padStart(10, "0")}`,
    license: `DEMO-L${String(seed % 1000000).padStart(6, "0")}`,
  };
}

export function demoCaseChange(previous: DemoCase, change: DemoCaseChange): DemoCase {
  if ("note" in change) return { ...previous, note: change.note.slice(0, 1000) };
  if (change.decision === previous.decision || !Number.isFinite(change.at)) return previous;
  return { ...previous, decision: change.decision,
    activity: [...previous.activity, { ...change, note: previous.note }].slice(-12) };
}

export function incidentTitle(kind: string | undefined) {
  return kind === "incidente" ? "Incidente" : kind === "uturn" ? "Posible vuelta en U" : kind === "rojo" ? "Posible cruce en rojo"
    : kind === "giro" ? "Posible giro indebido" : kind ? "Incidencia por revisar" : "Observación de cámara";
}
