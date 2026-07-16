"use client";

import { ServerGate } from "@/components/sentra/server-gate";
import { TrafficViewer } from "@/components/sentra/traffic-viewer";

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";

// Revisión (admin): la contraseña se valida contra el backend (/api/verify-admin), no está
// en el repo. Solo un pass admin entra acá.
export default function DemoAdminPage() {
  return (
    <ServerGate api={API} verifyPath="/api/verify-admin" label="Revisión" storageKey="sentra-admin">
      {(token) => <TrafficViewer token={token} admin />}
    </ServerGate>
  );
}
