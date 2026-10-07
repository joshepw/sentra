export type VehicleAttributes = {
  type: string;
  color: string;
  type_score: number;
  color_score: number;
  ready_source_pts: number;
  view_source_pts: number[];
};

export type Detection = {
  id: number;
  class_id: number;
  label: string;
  score: number;
  box: [number, number, number, number];
  display_box?: [number, number, number, number];
  attributes?: VehicleAttributes;
};

export type DetectionFrame = {
  camera: string;
  session: string;
  segment: string;
  offset: number;
  sequence: number;
  width: number;
  height: number;
  region_revision: number;
  captured_at?: number | null;
  segment_started_at?: number;
  source_pts?: number;
  objects: Detection[];
};

function validAttributes(object: Detection, sourcePTS: number | undefined) {
  const value = object.attributes;
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || ![2, 5, 7].includes(object.class_id)) return false;
  return [value.type, value.color].every(label => typeof label === "string" && label.length > 0 && label.length <= 32) &&
    [value.type_score, value.color_score].every(score => Number.isFinite(score) && score >= 0 && score <= 1) &&
    typeof sourcePTS === "number" && Number.isFinite(sourcePTS) &&
    Number.isFinite(value.ready_source_pts) && value.ready_source_pts <= sourcePTS + .00001 &&
    Array.isArray(value.view_source_pts) && value.view_source_pts.length === 3 &&
    value.view_source_pts.every((pts, index) => Number.isFinite(pts) && pts <= value.ready_source_pts + .00001 &&
      (index === 0 || pts - value.view_source_pts[index - 1] >= .4998));
}

export type VideoFragment = {
  url: string;
  start: number;
  duration: number;
  startPTS?: number;
  endPTS?: number;
  elementaryStreams?: { video?: { startPTS: number; endPTS: number } | null };
};

// Detection geometry is current to the decoded source frame. The older `box`
// remains the tracker's smoothed position for compatibility and incident rules.
// Keep the fallback so a rolling server update or malformed optional field
// cannot hide an otherwise usable observation.
export function displayDetections<T extends { objects: Detection[] }>(frame: T): T {
  return { ...frame, objects: frame.objects.map(object => {
    const box = object.display_box;
    const valid = Array.isArray(box) && box.length === 4 && box.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
      && box[2] > box[0] && box[3] > box[1];
    return valid ? { ...object, box } : object;
  }) };
}

export function fragmentName(url: string) {
  return url.split("?", 1)[0].split("/").at(-1) ?? "";
}

export function fragmentPosition(fragments: VideoFragment[], mediaTime: number) {
  // Hls.js corrects these timestamps after demuxing. Manifest duration alone
  // cannot account for a missing packet, discontinuity or a new MSE timeline.
  for (let index = fragments.length - 1; index >= 0; index--) {
    const fragment = fragments[index];
    const start = fragment.elementaryStreams?.video?.startPTS ?? fragment.startPTS;
    const end = fragment.elementaryStreams?.video?.endPTS ?? fragment.endPTS;
    if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (mediaTime >= start - .00001 && mediaTime < end) {
      return { segment: fragmentName(fragment.url), offset: Math.max(0, mediaTime - start) };
    }
  }
  return null;
}

export function validFrame(value: unknown, camera: string): value is DetectionFrame {
  if (!value || typeof value !== "object") return false;
  const row = value as DetectionFrame;
  return row.camera === camera && typeof row.session === "string" && row.session.length <= 64 &&
    typeof row.segment === "string" && /^[A-Za-z0-9_-]+\.mp4$/.test(row.segment) &&
    Number.isFinite(row.offset) && row.offset >= 0 && row.offset <= 20 && Number.isSafeInteger(row.sequence) &&
    Number.isFinite(row.width) && row.width > 0 && Number.isFinite(row.height) && row.height > 0 &&
    Array.isArray(row.objects) && row.objects.length <= 300 && row.objects.every(object =>
      Number.isSafeInteger(object.id) && Number.isInteger(object.class_id) &&
      typeof object.label === "string" && object.label.length <= 60 &&
      Number.isFinite(object.score) && Array.isArray(object.box) && object.box.length === 4 &&
      object.box.every(number => Number.isFinite(number) && number >= 0 && number <= 1) &&
      object.box[2] >= object.box[0] && object.box[3] >= object.box[1] && validAttributes(object, row.source_pts));
}

export class DetectionBuffer {
  frames = new Map<string, DetectionFrame[]>();
  count = 0;

  append(input: unknown[], camera: string) {
    for (const inputFrame of input.slice(-1000)) {
      if (!validFrame(inputFrame, camera)) continue;
      const value = displayDetections(inputFrame);
      let rows = this.frames.get(value.segment);
      if (!rows) { rows = []; this.frames.set(value.segment, rows); }
      const existing = rows.findIndex(row => Math.abs(row.offset - value.offset) < .00001);
      if (existing !== -1) {
        if (rows[existing].sequence < value.sequence) rows[existing] = value;
        continue;
      }
      rows.push(value);
      rows.sort((a, b) => a.offset - b.offset);
      this.count++;
    }
    // A stream can stay open indefinitely. Retain at most 180 seconds at the
    // worker's maximum 15 fps, and cap segment count after signal reconnects.
    while (this.count > 2700 || this.frames.size > 90) {
      const first = this.frames.keys().next().value;
      if (first === undefined) break;
      this.count -= this.frames.get(first)?.length ?? 0;
      this.frames.delete(first);
    }
  }

  at(segment: string, offset: number): DetectionFrame | null {
    const rows = this.frames.get(segment);
    if (!rows?.length || !Number.isFinite(offset)) return null;
    let low = 0, high = rows.length - 1, index = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (rows[middle].offset <= offset + .00001) { index = middle; low = middle + 1; }
      else high = middle - 1;
    }
    if (index < 0) return null; // Never display future detections.
    const before = rows[index], after = rows[index + 1];
    if (offset - before.offset > .28) return null;
    if (!after || after.session !== before.session || after.region_revision !== before.region_revision || after.offset - before.offset > .28) return before;
    const ratio = Math.min(1, Math.max(0, (offset - before.offset) / (after.offset - before.offset)));
    const following = new Map(after.objects.map(object => [object.id, object]));
    return { ...before, objects: before.objects.map(object => {
      const next = following.get(object.id);
      if (!next || next.class_id !== object.class_id) return object;
      // Only geometry is interpolated. Labels/confidence come from the past.
      return { ...object, box: object.box.map((value, i) => value + (next.box[i] - value) * ratio) as Detection["box"] };
    }) };
  }

  clear() { this.frames.clear(); this.count = 0; }
}

export function containedVideo(width: number, height: number, videoWidth: number, videoHeight: number) {
  if (!width || !height || !videoWidth || !videoHeight) return null;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale, h = videoHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
