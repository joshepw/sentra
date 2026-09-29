// Six two-second segments keep enough playback margin for transport bursts.
export const LIVE_PLAYBACK_MARGIN_SECONDS = 12;
export const LIVE_HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  liveSyncDurationCount: 6,
  liveMaxLatencyDurationCount: 9,
  maxBufferLength: 24,
  backBufferLength: 30,
  manifestLoadingMaxRetry: 3,
  levelLoadingMaxRetry: 3,
  fragLoadingMaxRetry: 3,
};

type SeekableRanges = Pick<TimeRanges, "length" | "start" | "end">;

// Stay in the newest continuous range, even after a source reconnection.
export function livePlaybackPosition(seekable: SeekableRanges): number | null {
  if (!seekable.length) return null;
  const latest = seekable.length - 1;
  const start = seekable.start(latest), end = seekable.end(latest);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
  return Math.max(start, end - LIVE_PLAYBACK_MARGIN_SECONDS);
}
