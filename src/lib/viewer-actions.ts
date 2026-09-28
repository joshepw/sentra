import type { Playback } from "./history-detections";

export type ViewerState = {
  camera: string;
  all: boolean;
  boxes: boolean;
  mode: "live" | "history";
  revision: number;
};
export type ViewChanges = Partial<Omit<ViewerState, "revision">> & { close_video?: boolean };
export type ViewerAction =
  | { kind: "view"; revision: string; changes: ViewChanges }
  | { kind: "open_video"; revision: string; uid: string; playback: Playback };
