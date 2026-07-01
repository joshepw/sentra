"use client";

import { useEffect, useState } from "react";
import { feeds } from "@/lib/sentra-data";
import { fmt, hhmmss, sevColor } from "@/lib/sentra-utils";
import { Container } from "./ui";

type Event = {
  id: number;
  time: string;
  t: string;
  loc: string;
  sev: "alta" | "media" | "baja";
};

function mkEvent(
  f: (typeof feeds)[number],
  agoSec: number,
): Event {
  return {
    id: Math.random(),
    time: hhmmss(new Date(Date.now() - agoSec * 1000)),
    ...f,
  };
}

function useCounter(to: number, duration: number) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return value;
}

export function LiveDashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const veh = useCounter(4820, 1500);
  const acc = useCounter(37, 1500);
  const cams = useCounter(16, 1200);
  const redu = useCounter(88, 1500);

  useEffect(() => {
    const seed = [0, 1, 3].map((i, k) => mkEvent(feeds[i], (k + 1) * 9));
    setEvents(seed);

    const iv = setInterval(() => {
      const f = feeds[Math.floor(Math.random() * feeds.length)];
      setEvents((prev) => [mkEvent(f, 0), ...prev].slice(0, 5));
    }, 2800);

    return () => clearInterval(iv);
  }, []);

  return (
    <section className="pb-12 sm:pb-16 lg:pb-[90px]">
      <Container>
        <div className="overflow-hidden rounded-[20px] border border-[rgba(141,168,154,0.28)] bg-bg-panel">
          <div className="flex items-center justify-between border-b border-[rgba(141,168,154,0.16)] px-4 py-4 sm:px-7 sm:py-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Centro de monitoreo · San Pedro Sula
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.16em] text-accent">
              <span className="block size-2 animate-sn-pulse rounded-full bg-accent" />
              EN VIVO
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            <div className="w-full border-b border-[rgba(141,168,154,0.16)] p-4 sm:p-6 lg:flex-[1.4] lg:border-b-0 lg:border-r lg:p-7">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="font-mono text-[10px] font-semibold tracking-[0.16em] text-text-muted">
                  CORREDOR 1ª CALLE · BLVD MORAZÁN
                </div>
                <div className="font-mono text-[10px] font-medium tracking-[0.14em] text-text-faint">
                  <span className="text-accent">5</span> CÁMARAS ·{" "}
                  <span className="text-accent">1</span> ACTIVA
                </div>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-[rgba(141,168,154,0.16)]">
                <svg width="100%" height="320" viewBox="0 0 560 320" className="block">
                  <rect width="560" height="320" fill="#081411" />
                  <g transform="rotate(-6 280 160)" fill="none" stroke="#1f8a5b">
                    <line x1="-60" y1="72" x2="640" y2="72" strokeOpacity="0.26" strokeWidth="2.4" />
                    <line x1="-60" y1="250" x2="640" y2="250" strokeOpacity="0.18" strokeWidth="2.4" />
                    <line x1="150" y1="-40" x2="150" y2="380" strokeOpacity="0.2" strokeWidth="2.4" />
                    <line x1="430" y1="-40" x2="430" y2="380" strokeOpacity="0.16" strokeWidth="2.4" />
                  </g>
                  <g transform="rotate(-6 280 160)">
                    <line x1="82" y1="178" x2="484" y2="178" stroke="#3dd68c" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="2 7" />
                    {[82, 183, 383, 484].map((x) => (
                      <g key={x} transform={`translate(${x} 178)`}>
                        <circle r="6.5" fill="#0b1d16" stroke="#3dd68c" strokeWidth="2" />
                        <circle r="2.6" fill="#3dd68c" />
                      </g>
                    ))}
                    <g transform="translate(283 178)">
                      <circle r="30" fill="none" stroke="#3dd68c" strokeWidth="1.6" className="origin-center animate-sn-ripout" style={{ transformBox: "fill-box" }} />
                      <circle r="30" fill="none" stroke="#3dd68c" strokeWidth="1.6" className="origin-center animate-sn-ripout [animation-delay:1.3s]" style={{ transformBox: "fill-box" }} />
                      <circle r="13" fill="#3dd68c" fillOpacity="0.16" stroke="#3dd68c" strokeWidth="1.6" />
                      <circle r="5.5" fill="#3dd68c" />
                    </g>
                  </g>
                </svg>
                <div className="absolute right-4 top-4 flex items-center gap-[7px] rounded-full border border-[rgba(61,214,140,0.28)] bg-[rgba(8,20,17,0.7)] px-[11px] py-[7px] font-mono text-[9px] font-medium tracking-[0.14em] text-accent">
                  <span className="block size-1.5 animate-sn-pulse rounded-full bg-accent" />
                  SATÉLITE
                </div>
              </div>
              <div className="mt-4 flex gap-6">
                {[
                  { color: "#3dd68c", label: "Normal" },
                  { color: "#e6b24d", label: "Congestión" },
                  { color: "#e0655a", label: "Incidente" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 font-mono text-[11px] font-medium text-text-muted">
                    <span className="block size-[9px] rounded-full" style={{ background: item.color }} />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-full flex-col p-4 sm:p-6 lg:flex-1 lg:p-7">
              <div className="mb-4 font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                EVENTOS DETECTADOS POR IA
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex animate-sn-feedin items-start gap-[13px] rounded-[11px] border border-[rgba(141,168,154,0.16)] bg-bg-card p-[13px_15px]"
                  >
                    <span
                      className="mt-[5px] size-[9px] shrink-0 rounded-full"
                      style={{ background: sevColor(ev.sev) }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold leading-snug text-text">{ev.t}</div>
                      <div className="mt-[5px] font-mono text-[11px] font-medium tracking-[0.04em] text-text-muted">
                        {ev.loc}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[11px] font-medium text-text-faint">{ev.time}</div>
                      <div
                        className="mt-1.5 font-mono text-[9px] font-semibold tracking-[0.12em]"
                        style={{ color: sevColor(ev.sev) }}
                      >
                        {ev.sev.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[rgba(141,168,154,0.16)] border-t border-[rgba(141,168,154,0.16)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {[
              { value: fmt(veh), label: "Vehículos / hora", accent: false },
              { value: String(acc), label: "Incidentes hoy", accent: false },
              { value: String(cams), label: "Cámaras activas", accent: true },
              { value: `${redu}%`, label: "Menos carga manual", accent: false },
            ].map((kpi) => (
              <div key={kpi.label} className="p-4 sm:p-[22px_28px]">
                <div className={`font-display text-2xl font-semibold leading-none tracking-[-0.02em] sm:text-[28px] ${kpi.accent ? "text-accent" : "text-text"}`}>
                  {kpi.value}
                </div>
                <div className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
