import type { RegionState } from "./edge-regions";
export type Camera = { key: string; title: string; fps: number; width: number; height: number; url: string };
export type Track = {
  native_id: number; native_class: number; visible: boolean;
  xyxy: [number, number, number, number];
  attributes?: { type: string; color: string; completed_s: number } | null;
};
export type Frame = { camera: string; source_seconds: number; analysed_fps_5s: number; native_tracks: Track[] };
export type Metrics = { output_fps: number; delay_ms: number; vram_gib: number; gpu_util: number; input_fps: number };
export type Packet = { seconds: number; epoch_unix: number; frames: Frame[]; metrics: Metrics };
export type Run = {
  run_id: string | null; status: "idle" | "loading" | "running" | "complete" | "failed";
  server_time: number; packet: Packet | null; frames: Frame[]; error: string | null;
};
export type Bootstrap = { user: { name: string; email: string; csrf: string }; cameras: Camera[]; run: Run; duration: number; buffer_seconds: number; regions: RegionState };
export type Vehicle = { id: number; time: number; box: Track["xyxy"]; type: string; color: string };

export const TYPE: Record<string, string> = { turismo: "Turismo", camioneta: "Camioneta", paila: "Paila", camion_pequeno: "Camión pequeño", camion_grande: "Camión grande", busito: "Busito", bus: "Bus", otro: "Otro", dudoso: "No se distingue" };
export const COLOR: Record<string, string> = { blanco: "Blanco", negro: "Negro", gris: "Gris", plata: "Plata", plateado: "Plateado", otro_color: "Otro color", rojo: "Rojo", azul: "Azul", verde: "Verde", amarillo: "Amarillo", cafe: "Café", marron: "Marrón", beige: "Beige", naranja: "Naranja" };
const NATIVE: Record<number, string> = { 2: "Auto", 3: "Moto", 5: "Bus", 7: "Camión" };
export const isVehicle = (track: Track) => track.visible && [2, 3, 5, 7].includes(track.native_class);
export const typeName = (track: Track) => track.attributes ? (TYPE[track.attributes.type] ?? track.attributes.type) : (NATIVE[track.native_class] ?? "Vehículo");
export const colorName = (track: Track) => track.attributes ? (COLOR[track.attributes.color] ?? track.attributes.color) : "Por clasificar";
export const clock = (seconds: number) => {
  const t = Math.max(0, Math.min(90, seconds));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
};

// Never look ahead to a future observation or keep a stale box on screen.
export function frameAt(frames: Frame[], seconds: number) {
  let low = 0, high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].source_seconds <= seconds + .00002) low = middle + 1;
    else high = middle;
  }
  const frame = frames[low - 1];
  return frame && seconds - frame.source_seconds <= .28 ? frame : undefined;
}

export function vehiclesIn(frames: Frame[]): Vehicle[] {
  const vehicles = new Map<number, Vehicle>();
  for (const frame of frames) for (const track of frame.native_tracks) {
    if (!isVehicle(track)) continue;
    const old = vehicles.get(track.native_id);
    const [x, y, right, bottom] = track.xyxy;
    const area = (right - x) * (bottom - y);
    const oldArea = old ? (old.box[2] - old.box[0]) * (old.box[3] - old.box[1]) : -1;
    const sample = area > oldArea ? { time: frame.source_seconds, box: track.xyxy } : { time: old!.time, box: old!.box };
    vehicles.set(track.native_id, { id: track.native_id, ...sample,
      type: track.attributes || !old ? typeName(track) : old.type,
      color: track.attributes || !old ? colorName(track) : old.color });
  }
  return [...vehicles.values()].sort((a, b) => a.time - b.time);
}

export class ReplayClock {
  frames = new Map<string, Frame[]>();
  packets: Packet[] = [];
  mode: "idle" | "replay" | "live" = "idle";
  paused = false;
  position = 0;
  started = 0;
  epoch = 0;
  offset = 0;
  revision = 0;

  time() {
    if (this.mode === "idle") return 0;
    if (this.mode === "live") return Math.min(90, Date.now() / 1000 + this.offset - this.epoch - .6);
    return Math.min(90, this.paused ? this.position : this.position + (performance.now() - this.started) / 1000);
  }
  append(frames: Frame[], live = false) {
    for (const frame of frames) {
      if (frame.source_seconds < 0 || frame.source_seconds > 90) continue;
      const list = this.frames.get(frame.camera) ?? [];
      if (list.length && frame.source_seconds <= list[list.length - 1].source_seconds) continue;
      list.push(frame);
      if (live) while (list.length && list[0].source_seconds < frame.source_seconds - 4) list.shift();
      this.frames.set(frame.camera, list);
    }
  }
  reset() { this.frames.clear(); this.packets = []; this.mode = "idle"; this.paused = false; this.position = 0; this.revision++; }
  replay(packets: Packet[]) {
    this.reset(); this.packets = packets;
    for (const packet of packets) this.append(packet.frames);
    this.mode = "replay"; this.seek(0); this.paused = false;
  }
  seek(seconds: number) {
    if (this.mode !== "replay") return;
    this.position = Math.max(0, Math.min(90, seconds)); this.started = performance.now(); this.revision++;
  }
  pause() { this.position = this.time(); this.paused = !this.paused; this.started = performance.now(); }
  playFrom(seconds: number) { this.seek(seconds); this.paused = false; }
}
