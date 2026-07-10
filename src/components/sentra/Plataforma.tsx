"use client";

import { useState } from "react";
import { tabsData } from "@/lib/sentra-data";
import { pad } from "@/lib/sentra-utils";
import { Container, Eyebrow, SectionIntro, SectionTitle } from "./ui";

function CameraPreview({
  cam,
  tag,
}: {
  cam: string;
  tag: string;
}) {
  return (
    <div className="w-full overflow-hidden rounded-[14px] border border-[rgba(141,168,154,0.16)] bg-bg lg:flex-1">
      <div className="flex items-center justify-between border-b border-[rgba(141,168,154,0.16)] px-4 py-3 font-mono text-[10px] font-medium tracking-[0.14em] text-text-faint">
        <span className="truncate pr-2">{cam}</span>
        <span className="shrink-0 text-accent">● REC</span>
      </div>
      <div className="relative h-52 sm:h-60">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 400 240"
          preserveAspectRatio="none"
          className="absolute inset-0 block"
        >
          <defs>
            <pattern
              id="stripe"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="14" height="14" fill="#0b1d16" />
              <rect width="7" height="14" fill="#0e2a1d" />
            </pattern>
          </defs>
          <rect width="400" height="240" fill="url(#stripe)" />
        </svg>
        <div className="absolute inset-x-0 top-0 h-0.5 animate-sn-scan bg-gradient-to-r from-transparent via-accent to-transparent" />
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 400 240"
          preserveAspectRatio="none"
          className="absolute inset-0"
        >
          <rect
            x="118"
            y="88"
            width="120"
            height="84"
            fill="none"
            stroke="#3dd68c"
            strokeWidth="2"
          />
          <path
            d="M118 104V88h16M222 88h16v16M238 156v16h-16M134 172h-16v-16"
            fill="none"
            stroke="#3dd68c"
            strokeWidth="3"
          />
        </svg>
        <div className="absolute left-[118px] top-16 rounded bg-accent px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] text-bg">
          {tag}
        </div>
        <div className="absolute bottom-3 left-3.5 font-mono text-[10px] font-medium tracking-[0.06em] text-text-muted">
          FRAME 380px · INFERENCIA EN BORDE
        </div>
      </div>
    </div>
  );
}

export function Plataforma() {
  const [tab, setTab] = useState(0);
  const active = tabsData[tab];

  return (
    <section
      id="plataforma"
      className="border-t border-[rgba(141,168,154,0.16)] bg-bg-panel py-12 sm:py-16 lg:py-[90px]"
    >
      <Container>
        <Eyebrow>La plataforma · Senttra One</Eyebrow>
        <SectionTitle className="mb-3.5 max-w-[820px]">
          <span className="text-accent">Senttra One:</span> una capa de
          inteligencia sobre tus cámaras y sensores
        </SectionTitle>
        <SectionIntro className="mb-8 max-w-[640px] sm:mb-11">
          Sin reemplazar infraestructura. La IA hace el trabajo de vigilancia;
          tu equipo solo valida y decide.
        </SectionIntro>

        <div className="-mx-1 mb-6 flex gap-2.5 overflow-x-auto pb-2">
          {tabsData.map((t, i) => (
            <button
              key={t.title}
              type="button"
              onClick={() => setTab(i)}
              className={`shrink-0 cursor-pointer rounded-[10px] px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all sm:px-5 sm:py-[13px] sm:text-[13px] ${
                i === tab
                  ? "border border-accent bg-accent text-bg"
                  : "border border-[rgba(141,168,154,0.28)] bg-transparent text-text-muted hover:text-text"
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-5 rounded-[18px] border border-[rgba(141,168,154,0.16)] bg-bg-card p-5 sm:gap-6 sm:p-8 lg:flex-row lg:p-11">
          <div className="min-w-0 flex-1">
            <div className="mb-4 font-mono text-xs font-semibold tracking-[0.2em] text-accent sm:mb-[18px]">
              {pad(tab + 1)} — CAPACIDAD
            </div>
            <h3 className="mb-3 font-display text-2xl font-bold leading-tight tracking-[-0.02em] sm:mb-4 sm:text-3xl lg:text-4xl">
              {active.title}
            </h3>
            <p className="mb-5 text-base leading-[1.55] text-text-muted sm:mb-[26px] sm:text-[17px]">
              {active.desc}
            </p>
            <div className="flex flex-col gap-3 sm:gap-[13px]">
              {active.bullets.map((b) => (
                <div
                  key={b}
                  className="flex items-start gap-3 text-sm leading-snug text-text sm:text-[15.5px]"
                >
                  <span className="mt-[7px] size-[7px] shrink-0 bg-accent" />
                  {b}
                </div>
              ))}
            </div>
          </div>

          <CameraPreview cam={active.cam} tag={active.tag} />
        </div>
      </Container>
    </section>
  );
}
