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
export type ActionFailure = "no_more_results" | "no_video" | "unavailable_time" | "playback_blocked" | "recording_unavailable";
export type ViewerAction =
  | { kind: "view"; revision: string; changes: ViewChanges }
  | { kind: "open_video"; revision: string; uid: string; playback: Playback }
  | { kind: "open_archive"; revision: string; playback: Playback }
  | { kind: "navigate"; revision: string; uid: string; direction: "next" | "previous" }
  | ({ kind: "media"; revision: string; uid?: string; playback?: Playback } & MediaCommand);
