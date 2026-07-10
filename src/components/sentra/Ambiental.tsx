"use client";

import { useEffect, useState } from "react";
import { envForecast, moonData, windCardinal } from "@/lib/sentra-utils";
import { Container, Eyebrow, SectionIntro, SectionTitle } from "./ui";

export function Ambiental() {
  const [env, setEnv] = useState({
    envWind: 7.2,
    envGust: 13.0,
    envSolar: 18,
    envUpdated: "AHORA",
    envRayos: 0,
    envRayoKm: 14,
    envRain: 18,
    envStorm: 9,
    envHeat: 64,
    envConf: 92,
    envDir: 75,
  });

  useEffect(() => {
    const tick = () => {
      const jit = (v: number, amp: number, min: number, max: number) =>
        Math.max(min, Math.min(max, v + (Math.random() - 0.5) * amp));

      setEnv((s) => ({
        ...s,
        envWind: jit(s.envWind, 2.2, 3.5, 12),
        envGust: jit(s.envGust, 3.0, 8, 20),
        envSolar: Math.round(jit(s.envSolar, 8, 6, 44)),
        envRain: Math.round(jit(s.envRain, 5, 8, 34)),
        envStorm: Math.round(jit(s.envStorm, 4, 3, 22)),
        envRayos:
          Math.random() < 0.25 ? Math.min(9, s.envRayos + 1) : s.envRayos,
        envDir: (s.envDir + (Math.random() - 0.5) * 26 + 360) % 360,
        envUpdated: `HACE ${Math.floor(Math.random() * 3) + 1}S`,
      }));
    };

    const iv = setInterval(tick, 3400);
    return () => clearInterval(iv);
  }, []);

  const moon = moonData();
  const windCard = windCardinal(env.envDir);

  return (
    <section id="ambiental" className="border-t border-[rgba(141,168,154,0.16)] py-12 sm:py-16 lg:py-[90px]">
      <Container>
        <Eyebrow>Monitoreo ambiental</Eyebrow>
        <SectionTitle className="mb-3.5 max-w-[820px]">
          El clima del territorio, medido en tiempo real
        </SectionTitle>
        <SectionIntro className="mb-11 max-w-[680px]">
          Estaciones ambientales que leen lluvia, viento, radiación y atmósfera
          minuto a minuto. La misma capa de inteligencia que vigila las calles
          anticipa el riesgo climático<span className="text-accent">.</span>
        </SectionIntro>

        <div className="overflow-hidden rounded-[20px] border border-[rgba(141,168,154,0.28)] bg-bg-panel">
          <div className="flex items-center justify-between border-b border-[rgba(141,168,154,0.16)] px-4 py-4 sm:px-7 sm:py-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Estación ambiental · Senttra One
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.16em] text-accent">
              <span className="block size-2 animate-sn-pulse rounded-full bg-accent" />
              {env.envUpdated}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            <div className="w-full border-b border-[rgba(141,168,154,0.16)] p-5 sm:p-7 lg:flex-[1.2] lg:border-b-0 lg:border-r lg:p-[34px_36px]">
              <div className="mb-[22px] font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                CONDICIONES ACTUALES
              </div>
              <div className="mb-[30px] flex items-center gap-5">
                <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#e6b24d" strokeWidth="1.5" aria-hidden>
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
                </svg>
                <div>
                  <div className="font-display text-4xl font-bold leading-none tracking-[-0.03em] sm:text-5xl lg:text-[62px]">
                    31<span className="text-xl text-text-muted sm:text-[30px]">°C</span>
                  </div>
                  <div className="mt-2 font-mono text-[13px] font-medium tracking-[0.06em] text-text-muted">
                    SOLEADO · SENSACIÓN 37.3°C
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-[18px] flex items-center justify-between">
                  <div className="flex items-center gap-[9px] font-mono text-[10px] font-semibold tracking-[0.16em] text-accent">
                    PREDICCIÓN IA · PRÓXIMAS 6H
                  </div>
                  <span className="font-mono text-[10px] font-medium text-text-muted">
                    CONFIANZA {env.envConf}%
                  </span>
                </div>
                <div className="mb-5 font-display text-lg font-bold leading-tight tracking-[-0.01em] sm:mb-[22px] sm:text-[23px]">
                  {envForecast(env.envStorm, env.envRain)}
                </div>
                {[
                  { label: "Probabilidad de lluvia", value: env.envRain, color: "#3dd68c" },
                  { label: "Riesgo de tormenta eléctrica", value: env.envStorm, color: "#e6b24d" },
                  { label: "Estrés por calor (sensación)", value: env.envHeat, color: "#e0655a" },
                ].map((bar) => (
                  <div key={bar.label} className="mb-4 last:mb-0">
                    <div className="mb-[7px] flex items-baseline justify-between">
                      <span className="text-[12.5px] text-text-muted">{bar.label}</span>
                      <span className="font-mono text-[13px] font-semibold">{bar.value}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-sm bg-bg">
                      <div
                        className="h-full rounded-sm transition-[width] duration-700"
                        style={{ width: `${bar.value}%`, background: bar.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-full flex-col items-center border-b border-[rgba(141,168,154,0.16)] p-5 sm:p-7 lg:flex-1 lg:border-b-0 lg:border-r lg:p-[34px_36px]">
              <div className="mb-[22px] self-start font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                VIENTO
              </div>
              <svg width="180" height="180" viewBox="0 0 176 176" className="sm:h-[212px] sm:w-[212px]">
                <circle cx="88" cy="88" r="78" fill="none" stroke="rgba(141,168,154,.16)" />
                <circle cx="88" cy="88" r="62" fill="none" stroke="rgba(141,168,154,.1)" />
                <g
                  style={{
                    transform: `rotate(${env.envDir.toFixed(1)}deg)`,
                    transformOrigin: "88px 88px",
                    transition: "transform 1.1s cubic-bezier(.4,0,.2,1)",
                  }}
                >
                  <line x1="88" y1="86" x2="88" y2="120" stroke="rgba(141,168,154,.4)" strokeWidth="4.5" strokeLinecap="round" />
                  <line x1="88" y1="90" x2="88" y2="46" stroke="#3dd68c" strokeWidth="4.5" strokeLinecap="round" />
                  <path d="M88 28 L76 52 L88 45 L100 52 Z" fill="#3dd68c" />
                </g>
                <circle cx="88" cy="88" r="6" fill="#0b1d16" stroke="#3dd68c" strokeWidth="2" />
              </svg>
              <div className="mt-4 text-center">
                <span className="font-display text-[30px] font-bold tracking-[-0.02em]">
                  {env.envWind.toFixed(1)}
                </span>
                <span className="ml-[7px] font-mono text-xs font-medium text-text-muted">
                  KM/H · {windCard}
                </span>
              </div>
              <div className="mt-[18px] flex gap-[26px]">
                {[
                  { value: env.envGust.toFixed(1), label: "RÁFAGA" },
                  { value: "33.1", label: "MÁX HOY" },
                  { value: `${Math.round(env.envDir)}°`, label: "RUMBO" },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="font-display text-[17px] font-semibold">{item.value}</div>
                    <div className="mt-1.5 font-mono text-[9px] tracking-[0.1em] text-text-faint">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-full flex-col gap-5 p-5 sm:gap-[22px] sm:p-7 lg:flex-1 lg:p-[34px_36px]">
              <div>
                <div className="mb-4 font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                  RADIACIÓN SOLAR
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-[40px]">{env.envSolar}</span>
                  <span className="font-mono text-[13px] font-medium text-text-muted">W/m²</span>
                </div>
              </div>
              <div className="border-t border-[rgba(141,168,154,0.16)] pt-[22px]">
                <div className="mb-4 font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                  PRECIPITACIÓN
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-[40px]">0</span>
                  <span className="font-mono text-[13px] font-medium text-text-muted">mm hoy</span>
                </div>
              </div>
              <div className="flex items-center gap-4 border-t border-[rgba(141,168,154,0.16)] pt-[22px]">
                <svg width="46" height="46" viewBox="0 0 48 48" className="shrink-0">
                  <circle cx="24" cy="24" r="20" fill="#0f241b" stroke="rgba(141,168,154,.22)" />
                  <path d={moon.d} transform={moon.transform} fill="#cdd8d0" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(141,168,154,.28)" />
                </svg>
                <div>
                  <div className="mb-2.5 font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                    FASE LUNAR
                  </div>
                  <div className="font-display text-lg font-semibold">{moon.name}</div>
                  <div className="mt-[7px] font-mono text-[10px] font-medium text-text-muted">
                    {moon.illum}% ILUMINADA
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[rgba(141,168,154,0.16)] border-t border-[rgba(141,168,154,0.16)] sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
            {[
              { value: "71%", label: "Humedad" },
              { value: "24.8°C", label: "Punto de rocío" },
              { value: "1012hPa", label: "Presión rel." },
              { value: "2.6kPa", label: "Presión de vapor" },
              {
                value: String(env.envRayos),
                label: `Rayos hoy · ${env.envRayos > 0 ? env.envRayoKm : "—"} km`,
                accent: true,
              },
            ].map((kpi) => (
              <div key={kpi.label} className="p-4 sm:p-5">
                <div className={`font-display text-2xl font-semibold tracking-[-0.02em] ${kpi.accent ? "text-accent" : ""}`}>
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
