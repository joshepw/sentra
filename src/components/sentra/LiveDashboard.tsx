"use client";

import Image from "next/image";
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

  const focusColor = sevColor(events[0]?.sev ?? "baja");

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
              <div className="relative overflow-hidden rounded-xl border border-[rgba(141,168,154,0.16)] aspect-[560/320] bg-bg">
                <Image
                  src="/assets/map-sps.jpg"
                  alt="Mapa satelital del corredor 1ª Calle · Blvd Morazán"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  priority={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(8,20,17,0.35)] via-transparent to-[rgba(8,20,17,0.15)]" />

                {/* Corridor line + markers along the boulevard (tilt: high-left → low-right) */}
                {(() => {
                  const markers = [
                    { left: 14, top: 43, tone: "normal" as const },
                    { left: 32, top: 45.5, tone: "congestion" as const },
                    { left: 48, top: 51, tone: "active" as const },
                    { left: 66, top: 53.5, tone: "normal" as const },
                    { left: 82, top: 56, tone: "incident" as const },
                  ];
                  const linePoints = markers.map((m) => `${m.left},${m.top}`).join(" ");

                  return (
                    <>
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <polyline
                          points={linePoints}
                          fill="none"
                          stroke="#3dd68c"
                          strokeOpacity="0.85"
                          strokeWidth="1.6"
                          strokeDasharray="2 7"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>

                      {markers.map((m) => {
                        const isActive = m.tone === "active";
                        const color = isActive
                          ? focusColor
                          : m.tone === "incident"
                            ? "#e0655a"
                            : m.tone === "congestion"
                              ? "#e6b24d"
                              : "#3dd68c";

                        return (
                          <div
                            key={`${m.left}-${m.top}`}
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${m.left}%`, top: `${m.top}%` }}
                          >
                            {isActive && (
                              <>
                                <span
                                  className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-80 animate-sn-ripout"
                                  style={{ borderColor: color }}
                                />
                                <span
                                  className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-80 animate-sn-ripout [animation-delay:1.3s]"
                                  style={{ borderColor: color }}
                                />
                              </>
                            )}
                            <span
                              className="relative flex size-[13px] items-center justify-center rounded-full border-2 bg-bg-panel transition-colors duration-500"
                              style={{ borderColor: color }}
                            >
                              <span
                                className="size-[5px] rounded-full transition-colors duration-500"
                                style={{ background: color }}
                              />
                            </span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}

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
