"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";
import { ServerGate } from "@/components/sentra/server-gate";
import { TrafficViewer } from "@/components/sentra/traffic-viewer";

// /edge — el mismo visor que /demo pero contra la ESTACIÓN LOCAL (la máquina en sitio
// que corre el pipeline), no la nube. Si la estación está sin luz o sin red, muestra
// "edge offline" y reintenta sola; el histórico resiliente vive en /demo. La contraseña
// se valida contra el backend del edge (server-side), igual que en /demo — ninguna
// contraseña vive en este código.
const EDGE_API = process.env.NEXT_PUBLIC_SENTRA_EDGE_API ?? "https://edge.meteoro.xyz";
const RETRY_MS = 30000;

export default function EdgePage() {
  const [state, setState] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let alive = true;
    let fails = 0;
    const check = async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(`${EDGE_API}/health?_=${Date.now()}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        if (alive) { fails = 0; setState("online"); }
      } catch {
        fails += 1;
        // estando en línea aguanta 3 fallos seguidos antes de declarar offline (sin parpadeos);
        // si nunca ha conectado, un fallo basta.
        if (alive) setState((s) => (s === "online" && fails < 3 ? s : "offline"));
      } finally {
        clearTimeout(t);
      }
    };
    void check();
    const id = setInterval(check, RETRY_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (state === "checking") return (
    <Centered><p className="animate-sn-pulse font-mono text-sm text-text-muted">Conectando con la estación local…</p></Centered>
  );

  if (state === "offline") return (
    <Centered>
      <div className="w-full max-w-[460px] rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-8 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2.5">
          <SentraLogoMark size={26} /><SentraWordmark />
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-accent">Edge</span>
        </div>
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-bg-input px-4 py-2">
          <span className="size-2.5 animate-sn-pulse rounded-full bg-danger" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-danger">Edge offline</span>
        </div>
        <p className="mx-auto max-w-[380px] text-sm leading-relaxed text-text-muted">
          La estación local no responde — puede ser un corte de energía o de red en el
          sitio. Esta página reintenta sola cada {RETRY_MS / 1000} s.
        </p>
        <Link href="/demo" className="mt-5 inline-block rounded-lg border border-accent bg-[#123a2a] px-4 py-2 font-mono text-[11.5px] font-semibold uppercase tracking-[0.1em] text-accent transition-colors hover:brightness-125">
          Ver el demo histórico (nube) →
        </Link>
      </div>
    </Centered>
  );

  return (
    <ServerGate api={EDGE_API} verifyPath="/api/verify" label="Edge" storageKey="sentra-edge">
      {(token) => <TrafficViewer token={token} api={EDGE_API} label="Edge" />}
    </ServerGate>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full items-center justify-center bg-bg px-4 text-text">{children}</div>;
}
