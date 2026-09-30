import type { Playback } from "./history-detections";

export type ViewerState = {
  camera: string;
  all: boolean;
  boxes: boolean;
  mode: "live" | "history";
  revision: number;
};
export type ViewChanges = Partial<Omit<ViewerState, "revision">> & { close_video?: boolean };
export type MediaCommand = { operation: "pause" } | { operation: "play" } | { operation: "seek"; seconds: number };
export type ActionFailure = "no_more_results" | "no_video" | "unavailable_time" | "playback_blocked" | "recording_unavailable" | "playback_timeout";
export type PlaybackDiagnostics = {
  camera: string; stage: "lookup" | "archive" | "loading" | "seeking" | "play" | "pause" | "ready"; elapsed_ms: number;
  failure?: "load_timeout" | "seek_timeout" | "request_timeout" | "media_error" | "http_error" | "network_error" | "autoplay_denied" | "cancelled" | "unavailable_time" | "no_video";
  target_at?: number; at?: number; segment_id?: string; current_time?: number; duration?: number;
  ready_state?: number; network_state?: number; media_error?: number; http_status?: number; paused?: boolean; seeking?: boolean;
};
export type ViewerAction =
  | { kind: "view"; revision: string; changes: ViewChanges }
  | { kind: "open_video"; revision: string; uid: string; playback: Playback }
  | { kind: "open_archive"; revision: string; playback: Playback }
  | { kind: "navigate"; revision: string; uid: string; direction: "next" | "previous" }
  | ({ kind: "media"; revision: string; uid?: string; playback?: Playback } & MediaCommand);
