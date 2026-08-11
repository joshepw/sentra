"use client";

import { ServerGate } from "@/components/sentra/server-gate";
import { DnvtPanel } from "@/components/sentra/dnvt-panel";

// Panel DNVT (demo). La API va FIJA a la nube (Railway) — esta pantalla debe quedar montada
// aunque la estación local esté apagada; la variante edge no aplica acá. La contraseña se
// valida contra el backend (/api/verify-dnvt), no está en el repo: un pass DNVT (o admin)
// entra; el pass del demo público NO.
const API = "https://transito.meteoro.xyz";

export default function DemoDnvtPage() {
  return (
    <ServerGate api={API} verifyPath="/api/verify-dnvt" label="DNVT" storageKey="sentra-dnvt">
      {(token) => <DnvtPanel token={token} api={API} />}
    </ServerGate>
  );
}
