"use client";

import { useLayoutEffect, useRef } from "react";
import type { DashboardNavigation } from "@/lib/edge-dashboard";

// Only public screen names go into browser history. Results, evidence and form
// values stay in this mounted, authenticated viewer's memory and die on logout.
export type BrowserLocation = {
  screen: DashboardNavigation["screen"];
  explorer: DashboardNavigation["explorer"]["mode"];
  map: DashboardNavigation["map"]["level"];
};
type Entry = { id: string; location: BrowserLocation };
const STATE_KEY = "senttraView";

function readEntry(state: unknown): Entry | undefined {
  const entry = (state as Record<string, unknown> | null)?.[STATE_KEY] as Entry | undefined;
  const location = entry?.location;
  if (typeof entry?.id !== "string" || !location
    || !["home", "explorer", "activity", "control"].includes(location.screen)
    || ![null, "vehicle_colors", "shirt_colors", "vehicle_types", "combined", "similar", "archive"].includes(location.explorer)
    || !["region", "honduras", "cortes", "sps"].includes(location.map)) return;
  return entry;
}

export function useBrowserHistory<T>(key: string, snapshot: T, location: BrowserLocation, restore: (snapshot: T | undefined, location: BrowserLocation) => void) {
  const entries = useRef(new Map<string, { key: string; snapshot: T }>());
  const cursor = useRef<{ id: string; key: string } | null>(null);
  const restoring = useRef(false);
  const onRestore = useRef(restore);

  useLayoutEffect(() => { onRestore.current = restore; });
  useLayoutEffect(() => {
    const pop = (event: PopStateEvent) => {
      const entry = readEntry(event.state);
      if (!entry) return; // Let the browser/Next.js handle leaving Edge normally.
      const saved = entries.current.get(entry.id);
      cursor.current = { id: entry.id, key: saved?.key ?? "" };
      restoring.current = true;
      onRestore.current(saved?.snapshot, entry.location);
    };
    window.addEventListener("popstate", pop);
    const cache = entries.current;
    return () => { window.removeEventListener("popstate", pop); cache.clear(); };
  }, []);

  useLayoutEffect(() => {
    const previous = cursor.current;
    const push = previous !== null && !restoring.current && previous.key !== key;
    const id = !previous || push ? crypto.randomUUID() : previous.id;
    cursor.current = { id, key };
    restoring.current = false;
    entries.current.set(id, { key, snapshot });
    // Bound private snapshots; older entries can still return to their portal.
    if (entries.current.size > 100) entries.current.delete(entries.current.keys().next().value!);
    const entry: Entry = { id, location };
    // Retain Next.js's routing state. Replacing the first entry avoids creating
    // a duplicate home step; only meaningful screen changes push a new entry.
    const state = { ...window.history.state, [STATE_KEY]: entry };
    if (push) window.history.pushState(state, "");
    else if (!previous || previous.key !== key) window.history.replaceState(state, "");
  }, [key, snapshot, location]);
}
