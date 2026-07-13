"use client";

import { Gate } from "@/components/sentra/gate";
import { TrafficViewer } from "@/components/sentra/traffic-viewer";

export default function DemoPage() {
  return (
    <Gate password="munidemosps26" storageKey="sentra-demo" label="Demo">
      {(token) => <TrafficViewer token={token} />}
    </Gate>
  );
}
