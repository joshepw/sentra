import type { Coverage } from "./history-detections";

export type TrafficHour = { hour: number; start: number; end: number };
export type TrafficPlan = { runId: string; camera: string; start: number; end: number; limited: boolean; hours: TrafficHour[] };
export type TrafficCount = TrafficHour & { vehicles: number | null; incidents: number | null };
export type TrafficCache = Map<string, { total: number; expires: number }>;

export function trafficPlan(run: Coverage["runs"][number] | undefined, camera: string): TrafficPlan | null {
  const progress = run?.cameras.find(row => row.camera === camera);
  if (!run || !progress?.frames || !Number.isFinite(progress.first) || !Number.isFinite(progress.last)) return null;
  const first = Math.max(run.started, progress.first);
  // The live chart advances once a minute, rather than fetching counts on each
  // camera-status poll. Only observed time contributes to the chart.
  const observedEnd = run.kind === "live" && Math.floor(progress.last / 60) * 60 > first
    ? Math.floor(progress.last / 60) * 60 : progress.last + .001;
  const end = Math.min(run.ended ?? observedEnd, observedEnd);
  if (!Number.isFinite(first) || !Number.isFinite(end) || end <= first) return null;
  const lastHour = (Math.ceil(end / 3600) - 1) * 3600;
  const start = Math.max(first, lastHour - 23 * 3600);
  const hours: TrafficHour[] = [];
  for (let hour = Math.floor(start / 3600) * 3600; hour < end; hour += 3600) {
    hours.push({ hour, start: Math.max(start, hour), end: Math.min(end, hour + 3600) });
  }
  return { runId: run.id, camera, start, end, limited: start > first, hours };
}

export async function loadTrafficSummary(plan: TrafficPlan, signal: AbortSignal, cache: TrafficCache,
  request: typeof fetch = fetch): Promise<TrafficCount[]> {
  const rows: TrafficCount[] = plan.hours.map(hour => ({ ...hour, vehicles: null, incidents: null }));
  const tasks = rows.flatMap(row => (["vehicles", "incidents"] as const).map(kind => ({ row, kind })));
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      signal.throwIfAborted();
      const { row, kind } = tasks[next++];
      const params = new URLSearchParams({ run_id: plan.runId, camera: plan.camera,
        start: String(row.start), end: String(row.end), limit: "1" });
      if (kind === "incidents") params.set("review", "candidate");
      const url = `/edge/api/history/${kind === "vehicles" ? "search" : "incidents"}?${params}`;
      const saved = cache.get(url);
      if (saved && saved.expires > Date.now()) { row[kind] = saved.total; continue; }
      try {
        const response = await request(url, { signal, cache: "no-store" });
        if (response.status === 401) throw new Error("session_expired");
        if (!response.ok) continue;
        const value: { total?: unknown } = await response.json();
        signal.throwIfAborted();
        // Use the API's total, never the length of its paginated item list.
        if (typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0) continue;
        row[kind] = value.total;
        const ttl = row.end < plan.end - 3600 ? 300000 : 60000;
        cache.set(url, { total: value.total, expires: Date.now() + ttl });
        if (cache.size > 128) cache.delete(cache.keys().next().value!);
      } catch (error) {
        if (signal.aborted || (error as Error).message === "session_expired") throw error;
        // A missing count stays unknown; a failed request is not zero traffic.
      }
    }
  };
  // At most two in-flight requests, and at most 24 hours per chart.
  await Promise.all([worker(), worker()]);
  return rows;
}

export function trafficHourLabel(seconds: number) {
  const hour = new Date((seconds - 6 * 3600) * 1000).getUTCHours();
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}
