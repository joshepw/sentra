import type { Detection, DetectionFrame } from "./live-detections";

export type Incident = {
  uid: string; track_uid: string; camera: string; session: string; local_id: number;
  kind: "uturn" | "rojo"; review: "candidate" | "confirmed"; at: number;
};
export type IncidentIndex = Map<string, Incident[]>;
export const incidentColors = { candidate: "#ffdb68", confirmed: "#ff5263", selected: "#ffffff" };

export function indexIncidents(input: unknown, camera: string): IncidentIndex {
  const result: IncidentIndex = new Map();
  if (!Array.isArray(input)) return result;
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const row = value as Incident;
    if (row.camera !== camera || typeof row.session !== "string" || !row.session || row.session.length > 64
      || !Number.isSafeInteger(row.local_id) || !Number.isFinite(row.at) || row.at <= 0
      || !["uturn", "rojo"].includes(row.kind) || !["candidate", "confirmed"].includes(row.review)) continue;
    const key = `${row.session}:${row.local_id}`;
    result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

// Recompute against the displayed instant, including backward seeks. A later
// confirmed event must never promote an earlier, still-pending maneuver.
export function incidentAt(index: IncidentIndex, session: string, id: number, at: number): Incident | undefined {
  if (!Number.isFinite(at)) return;
  let found: Incident | undefined;
  for (const row of index.get(`${session}:${id}`) ?? []) {
    if (row.at > at) continue;
    if (!found || (row.review === "confirmed" && found.review !== "confirmed")
      || (row.review === found.review && row.at > found.at)) found = row;
  }
  return found;
}

export function detectionInstant(frame: DetectionFrame, offset: number) {
  // Demo fragments may hold the previous observation at offset zero. Its
  // captured_at stays the observation time; the fragment has its own clock.
  const start = frame.segment_started_at ?? (typeof frame.captured_at === "number" ? frame.captured_at - frame.offset : NaN);
  return Number.isFinite(start) && Number.isFinite(offset) ? start + offset : NaN;
}

export function detectionColor(object: Pick<Detection, "class_id">, incident?: Incident) {
  return incident ? incidentColors[incident.review] : object.class_id === 0 ? "#68c8ff" : "#57f1aa";
}
