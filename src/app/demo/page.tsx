"use client";

import { ServerGate } from "@/components/sentra/server-gate";
import { TrafficViewer } from "@/components/sentra/traffic-viewer";

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";

// El pass del demo se valida CONTRA EL BACKEND (no está en este código) y es cambiable
// desde /demoadmin. Así nunca queda una contraseña "pelada" en el repo público.
export default function DemoPage() {
  return (
    <ServerGate api={API} verifyPath="/api/verify" label="Demo" storageKey="sentra-demo">
      {(token) => <TrafficViewer token={token} />}
    </ServerGate>
  );
}
