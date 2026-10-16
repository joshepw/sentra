import type { CSSProperties } from "react";

export type DashboardIconName = "uturn" | "signal" | "incident" | "activity" | "search" | "map" | "car" | "shirt" | "layers" | "route" | "archive" | "camera" | "arrow" | "cross" | "home" | "chevron";
const paths: Record<DashboardIconName, React.ReactNode> = {
  uturn: <><path d="M17 20V8a5 5 0 0 0-10 0v8" /><path d="m3 12 4 4 4-4" /></>,
  signal: <><rect x="8" y="2" width="8" height="18" rx="4" /><path d="M12 20v2" /><circle cx="12" cy="6" r="1" /><circle cx="12" cy="11" r="1" /><circle cx="12" cy="16" r="1" /></>,
  incident: <><path d="m10.5 3.5-9 16A1 1 0 0 0 2.4 21h19.2a1 1 0 0 0 .9-1.5l-9-16a1.7 1.7 0 0 0-3 0Z" /><path d="M12 9v5m0 3v.1" /></>,
  activity: <><path d="M3 3v18h18M6 13l4-6 5 9 5-10" /><path d="M6 17v1m4-6v6m5 2v-1m5-8v7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5M7 10h7m-3.5-3.5v7" /></>,
  map: <><path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Zm6-3v17m6-14v17" /><circle cx="15" cy="11" r="2.5" /></>,
  car: <><path d="m4 10 2-6h12l2 6M3 10h18v8H3v-8Zm2 8v3m14-3v3M7 14h1m8 0h1" /></>,
  shirt: <path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z" />,
  layers: <><path d="m12 2 10 6-10 6L2 8l10-6Zm-9 11 9 6 9-6M3 18l9 5 9-5" /></>,
  route: <><circle cx="5" cy="5" r="3" /><circle cx="19" cy="19" r="3" /><path d="M8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8" /></>,
  archive: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v13h14V8M9 12h6m-4 4 3 2-3 2v-4Z" /></>,
  camera: <><rect x="2" y="5" width="14" height="13" rx="3" /><path d="m16 9 6-4v13l-6-4" /><circle cx="9" cy="11.5" r="2.5" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  cross: <path d="m6 6 12 12M6 18 18 6" />,
  home: <><path d="m2 10 10-8 10 8M5 8v13h14V8M9 21v-8h6v8" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
};
export function DashboardIcon({ name, size = 24, style, className }: { name: DashboardIconName; size?: number; style?: CSSProperties; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className}>{paths[name]}</svg>;
}
