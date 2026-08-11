"use client";

import { ServerGate } from "@/components/sentra/server-gate";
import { DnvtPanel } from "@/components/sentra/dnvt-panel";

const API = process.env.NEXT_PUBLIC_SENTRA_API ?? "https://transito.meteoro.xyz";

// Panel DNVT: la contraseña se valida contra el backend (/api/verify-dnvt), no está en el
// repo. Un pass DNVT (o admin) entra acá; el pass del demo público NO.
export default function DnvtPage() {
  return (
    <ServerGate api={API} verifyPath="/api/verify-dnvt" label="DNVT" storageKey="sentra-dnvt">
      {(token) => <DnvtPanel token={token} />}
    </ServerGate>
  );
}
