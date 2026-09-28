import type { Detection } from "./live-detections";

export type HistoryFrame = {
  camera: string; session: string; captured_at: number; width: number; height: number;
  source_pts: number; region_revision: number; objects: Detection[];
  signal?: { state: string; reason?: string };
};
export type Playback = { camera: string; at: number; run_id: string; track_uid?: string; incident_uid?: string };
export type HistoryItem = {
  uid: string; run_id?: string; camera: string; title: string; type?: string; color?: string;
  first?: number; last?: number; at?: number; best_time?: number;
  thumbnail_url?: string | null; playback: Playback; track_uid?: string;
  kind?: string; review?: string; clip_url?: string | null; clip_status?: string;
  similarity?: number; details?: { stop_band?: number[]; trajectory?: number[][]; light?: { state: string }; heading_change_deg?: number };
};
export type Coverage = { runs: {
  id: string; kind: string; title: string; started: number; ended: number | null; status: string;
  cameras: { camera: string; first: number; last: number; frames: number }[];
  totals: { appearances: number; with_attributes: number };
}[] };
export type ToolResult = {
  items?: HistoryItem[]; total?: number; next_cursor?: string | null;
  filters?: Record<string, string | number>; counting?: string; coverage?: Coverage;
  playback?: Playback; runs?: Coverage["runs"]; note?: string; reason?: string; identity_confirmed?: boolean;
  cameras?: { camera: string; title: string; receiving: boolean }[];
};

export function historyTime(value: number | string | null | undefined, date = true) {
  let milliseconds = NaN;
  if (typeof value === "number") milliseconds = value * 1000;
  else if (typeof value === "string") {
    const text = value.trim();
    if (/^\d{9,10}(?:\.\d{1,9})?$/.test(text)) milliseconds = Number(text) * 1000;
    else if (/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(text)) {
      const local = text.length === 10 ? `${text}T00:00:00` : text.replace(" ", "T");
      // The API treats a date without a zone as Honduras, regardless of the
      // browser's timezone. Explicit offsets and UTC keep their original instant.
      const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(local) ? local
        : /[+-]\d{2}$/.test(local) ? `${local}:00` : `${local}-06:00`;
      milliseconds = Date.parse(zoned);
    }
  }
  const instant = new Date(milliseconds);
  if (!Number.isFinite(instant.getTime())) return "Hora no disponible";
  return new Intl.DateTimeFormat("es-HN", {
    timeZone: "America/Tegucigalpa", ...(date ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(instant);
}

export function historyFrameAt(frames: HistoryFrame[], at: number): HistoryFrame | null {
  if (!Number.isFinite(at)) return null;
  let left = 0, right = frames.length - 1, found = -1;
  while (left <= right) {
    const mid = (left + right) >>> 1;
    if (frames[mid].captured_at <= at + .00001) { found = mid; left = mid + 1; } else right = mid - 1;
  }
  if (found < 0 || at - frames[found].captured_at > .28) return null;
  const before = frames[found], after = frames[found + 1];
  if (!after || after.session !== before.session || after.region_revision !== before.region_revision || after.captured_at - before.captured_at > .28) return before;
  const distance = after.captured_at - before.captured_at;
  if (distance <= 0) return before;
  const ratio = Math.max(0, Math.min(1, (at - before.captured_at) / distance));
  const next = new Map(after.objects.map(object => [object.id, object]));
  return { ...before, objects: before.objects.map(object => {
    const other = next.get(object.id);
    return other && other.class_id === object.class_id ? { ...object, box: object.box.map((x, i) => x + (other.box[i] - x) * ratio) as Detection["box"] } : object;
  }) };
}
