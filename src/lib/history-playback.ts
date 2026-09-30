export const HISTORY_BUFFER_SECONDS = 3;
export const HISTORY_PREFETCH_SECONDS = 20;

type Media = Pick<HTMLVideoElement, "buffered" | "currentTime" | "duration" | "readyState" | "seeking" | "error">;

// Count only the continuous range containing the playhead, never add across gaps.
export function historyBufferedAhead(media: Media, at = media.currentTime): number {
  for (let i = 0; i < media.buffered.length; i++) {
    if (media.buffered.start(i) <= at + .04 && media.buffered.end(i) > at) return media.buffered.end(i) - at;
  }
  return 0;
}

// undefined means the archive ends here; null means a contiguous next video is loading.
export function historyBufferReady(media: Media, next?: Media | null): boolean {
  if (media.readyState < 2 || media.seeking || media.error || !Number.isFinite(media.duration)) return false;
  const remaining = Math.max(0, media.duration - media.currentTime);
  if (historyBufferedAhead(media) + .04 < Math.min(HISTORY_BUFFER_SECONDS, remaining)) return false;
  if (remaining >= HISTORY_BUFFER_SECONDS || next === undefined || next?.error) return true;
  return !!next && next.readyState >= 2 && !next.seeking && next.currentTime < .04
    && Number.isFinite(next.duration)
    && historyBufferedAhead(next, 0) + .04 >= Math.min(HISTORY_BUFFER_SECONDS - remaining, next.duration);
}
