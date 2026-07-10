"use client";

import { useCallback, useEffect, useState } from "react";
import type { WeatherSnapshot } from "@/lib/weather";
import { moonData, windCardinal } from "@/lib/sentra-utils";
import { Container, Eyebrow, SectionIntro, SectionTitle } from "./ui";

function conditionIcon(code: number) {
  // sun / cloud / rain / storm strokes
  if (code >= 95) {
    return (
      <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#e6b24d" strokeWidth="1.5" aria-hidden>
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (code >= 51) {
    return (
      <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#3dd68c" strokeWidth="1.5" aria-hidden>
        <path d="M7 16a5 5 0 1 1 1.5-9.7A6 6 0 0 1 20 11a4 4 0 0 1-1 7.9H7z" />
        <path d="M8 19v2M12 18v3M16 19v2" />
      </svg>
    );
  }
  if (code >= 2) {
    return (
      <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#90a89a" strokeWidth="1.5" aria-hidden>
        <path d="M7 17a5 5 0 1 1 1.5-9.7A6 6 0 0 1 20 12a4 4 0 0 1-1 7.9H7z" />
      </svg>
    );
  }
  return (
    <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#e6b24d" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </svg>
  );
}

function formatUpdated(iso: string) {
  const d = new Date(iso.includes("T") && !iso.endsWith("Z") ? `${iso}:00-06:00` : iso);
  if (Number.isNaN(d.getTime())) return "EN VIVO";
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins <= 1) return "AHORA";
  if (mins < 60) return `HACE ${mins} MIN`;
  return d.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" });
}

export function Ambiental() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/weather", { cache: "no-store" });
      if (!res.ok) throw new Error("weather failed");
      const data = (await res.json()) as WeatherSnapshot;
      setWeather(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  const moon = moonData();
  const windCard = windCardinal(weather?.windDir ?? 0);

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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(141,168,154,0.16)] px-4 py-4 sm:px-7 sm:py-5">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Estación ambiental · San Pedro Sula
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.16em] text-accent">
              <span className="block size-2 animate-sn-pulse rounded-full bg-accent" />
              {loading && !weather
                ? "CARGANDO"
                : error && !weather
                  ? "SIN SEÑAL"
                  : formatUpdated(weather?.updatedAt ?? "")}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            <div className="w-full border-b border-[rgba(141,168,154,0.16)] p-5 sm:p-7 lg:flex-[1.2] lg:border-b-0 lg:border-r lg:p-[34px_36px]">
              <div className="mb-[22px] font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                CONDICIONES ACTUALES
              </div>
              <div className="mb-[30px] flex items-center gap-5">
                {conditionIcon(weather?.conditionCode ?? 0)}
                <div>
                  <div className="font-display text-4xl font-bold leading-none tracking-[-0.03em] sm:text-5xl lg:text-[62px]">
                    {weather ? weather.temperature.toFixed(1) : "—"}
                    <span className="text-xl text-text-muted sm:text-[30px]">°C</span>
                  </div>
                  <div className="mt-2 font-mono text-[13px] font-medium tracking-[0.06em] text-text-muted">
                    {weather
                      ? `${weather.condition.toUpperCase()} · SENSACIÓN ${weather.feelsLike.toFixed(1)}°C`
                      : "OBTENIENDO DATOS…"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-[18px] flex items-center justify-between">
                  <div className="flex items-center gap-[9px] font-mono text-[10px] font-semibold tracking-[0.16em] text-accent">
                    PREDICCIÓN · PRÓXIMAS 6H
                  </div>
                  <span className="font-mono text-[10px] font-medium text-text-muted">
                    CONFIANZA {weather?.confidence ?? "—"}%
                  </span>
                </div>
                <div className="mb-5 font-display text-lg font-bold leading-tight tracking-[-0.01em] sm:mb-[22px] sm:text-[23px]">
                  {weather?.forecast ?? "Cargando pronóstico…"}
                </div>
                {[
                  { label: "Probabilidad de lluvia", value: weather?.rainProb ?? 0, color: "#3dd68c" },
                  { label: "Riesgo de tormenta eléctrica", value: weather?.stormRisk ?? 0, color: "#e6b24d" },
                  { label: "Estrés por calor (sensación)", value: weather?.heatStress ?? 0, color: "#e0655a" },
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
                    transform: `rotate(${(weather?.windDir ?? 0).toFixed(1)}deg)`,
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
                  {weather ? weather.windSpeed.toFixed(1) : "—"}
                </span>
                <span className="ml-[7px] font-mono text-xs font-medium text-text-muted">
                  KM/H · {weather ? windCard : "—"}
                </span>
              </div>
              <div className="mt-[18px] flex gap-[26px]">
                {[
                  { value: weather ? weather.windGust.toFixed(1) : "—", label: "RÁFAGA" },
                  { value: weather ? weather.windMaxToday.toFixed(1) : "—", label: "MÁX HOY" },
                  { value: weather ? `${Math.round(weather.windDir)}°` : "—", label: "RUMBO" },
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
                  <span className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-[40px]">
                    {weather ? weather.solar : "—"}
                  </span>
                  <span className="font-mono text-[13px] font-medium text-text-muted">W/m²</span>
                </div>
              </div>
              <div className="border-t border-[rgba(141,168,154,0.16)] pt-[22px]">
                <div className="mb-4 font-mono text-[10px] font-semibold tracking-[0.16em] text-text-faint">
                  PRECIPITACIÓN
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-[40px]">
                    {weather ? weather.precipToday.toFixed(1) : "—"}
                  </span>
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
              { value: weather ? `${weather.humidity}%` : "—", label: "Humedad" },
              { value: weather ? `${weather.dewPoint.toFixed(1)}°C` : "—", label: "Punto de rocío" },
              { value: weather ? `${Math.round(weather.pressure)}hPa` : "—", label: "Presión rel." },
              { value: weather ? `${weather.vaporPressure.toFixed(1)}kPa` : "—", label: "Déficit de vapor" },
              {
                value: weather ? `${weather.cloudCover}%` : "—",
                label: "Nubosidad",
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
