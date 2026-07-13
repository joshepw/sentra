"use client";

import { Gate } from "@/components/sentra/gate";
import { TrafficViewer } from "@/components/sentra/traffic-viewer";

export default function DemoAdminPage() {
  return (
    <Gate password="montevideo26" storageKey="sentra-admin" label="Revisión">
      {(token) => <TrafficViewer token={token} admin />}
    </Gate>
  );
}
