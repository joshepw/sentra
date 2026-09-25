import type { Frame, Track } from "./edge-replay";

export type Point = [number, number];
export type Region = { id: string; name: string; kind: "include" | "exclude"; enabled: boolean; points: Point[] };
export type Profile = { schema_version: 1; dataset_id: string; coordinate_space: "normalized"; frame_size: { width: number; height: number }; name: string; anchor: "center" | "bottom_center"; regions: Region[] };
export type RegionState = { revision: number; profiles: Record<string, Profile> };

// Same boundary semantics as Crowne: a point on an exclusion edge is excluded.
export function contains([x, y]: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(cross) <= 1e-10 && x >= Math.min(a[0], b[0]) - 1e-10 && x <= Math.max(a[0], b[0]) + 1e-10 && y >= Math.min(a[1], b[1]) - 1e-10 && y <= Math.max(a[1], b[1]) + 1e-10) return true;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function allowed(track: Track, profile?: Profile) {
  if (!profile) return true;
  const [x, y, right, bottom] = track.xyxy;
  const point: Point = [(x + right) / (2 * profile.frame_size.width), (profile.anchor === "center" ? (y + bottom) / 2 : bottom) / profile.frame_size.height];
  const enabled = profile.regions.filter(region => region.enabled);
  const includes = enabled.filter(region => region.kind === "include");
  return (!includes.length || includes.some(region => contains(point, region.points))) && !enabled.some(region => region.kind === "exclude" && contains(point, region.points));
}

export function filterFrames(frames: Frame[], profile?: Profile) {
  if (!profile?.regions.some(region => region.enabled)) return frames;
  return frames.map(frame => ({ ...frame, native_tracks: frame.native_tracks.filter(track => allowed(track, profile)) }));
}
