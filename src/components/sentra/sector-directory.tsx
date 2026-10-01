"use client";

import { PRIMARY_SECTOR, SECTORS, type SectorId } from "@/lib/edge-sectors";

function SectorIcon({ active = false }: { active?: boolean }) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={`h-10 w-10 ${active ? "text-accent" : "text-text-faint"}`}>
    <path d="M9 17 24 8l15 9v18l-15 8-15-8V17Z" stroke="currentColor" strokeWidth="1.3" opacity=".4" />
    <path d="m9 17 15 9 15-9M24 26v17" stroke="currentColor" strokeWidth="1.3" opacity=".4" />
    <path d="M17 16h10a3 3 0 0 1 3 3v7H20a3 3 0 0 1-3-3v-7Zm13 3 6-3v10l-6-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    {active && <circle cx="21" cy="20" r="1.5" fill="currentColor" />}
  </svg>;
}

export function SectorDirectory({ cameras, onSelect }: {
  cameras: { receiving: boolean }[]; onSelect: (sector: SectorId) => void;
}) {
  const receiving = cameras.filter(camera => camera.receiving).length;
  return <section aria-label="Sectores" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.22em] text-accent">San Pedro Sula · Monitoreo</p>
          <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">Sectores</h1>
          <p className="mt-2 text-sm text-text-muted">Elegí un sector para ver sus cámaras.</p></div>
        <p className="font-mono text-xs text-text-faint">{SECTORS.length} sectores <span className="px-2 opacity-40">/</span> {cameras.length} cámaras</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTORS.map((sector, index) => {
          const equipped = sector.id === PRIMARY_SECTOR;
          return <button key={sector.id} type="button" data-sector={sector.id} aria-label={`Abrir sector ${sector.title}`} onClick={() => onSelect(sector.id)}
            className={`group flex min-h-40 cursor-pointer flex-col rounded-2xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:min-h-48 ${equipped ? "border-accent/40 bg-[#102b20] hover:border-accent" : "border-[var(--border)] bg-[#0c1b16] hover:border-text-faint"}`}>
            <div className="mb-5 flex w-full items-start justify-between"><SectorIcon active={equipped && receiving > 0} />
              <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${equipped && cameras.length ? "bg-accent/10 text-accent" : "bg-white/[.03] text-text-faint"}`}>
                {equipped && cameras.length ? `${receiving} en vivo` : "Sin cámaras"}
              </span>
            </div>
            <div className="mt-auto flex w-full items-end justify-between gap-3">
              <div><span className="font-mono text-[10px] text-text-faint">SECTOR {String(index + 1).padStart(2, "0")}</span>
                <h2 className="mt-1 text-lg font-medium text-text">{sector.title}</h2>
                <p className="mt-1 text-xs text-text-muted">{equipped && cameras.length ? `${cameras.length} cámaras` : "Sin cámaras conectadas"}</p></div>
              <span aria-hidden="true" className={`text-xl ${equipped ? "text-accent" : "text-text-faint group-hover:text-text"}`}>↗</span>
            </div>
          </button>;
        })}
      </div>
      <p className="text-xs text-text-faint">También podés decir <span className="text-text-muted">“Mostrame 1era Calle”</span> o <span className="text-text-muted">“Mostrame los sectores”</span>.</p>
    </div>
  </section>;
}

export function EmptySector({ sector, onSelect }: { sector: SectorId; onSelect: (sector: SectorId) => void }) {
  const title = SECTORS.find(row => row.id === sector)?.title;
  return <section aria-label={`Sector ${title}`} data-empty-sector={sector} className="grid min-h-0 flex-1 place-items-center overflow-y-auto px-5 py-8">
    <div className="max-w-md text-center">
      <div className="mb-5 flex justify-center"><SectorIcon /></div>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-text-faint">Sin cámaras conectadas</p>
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">Este sector todavía no tiene cámaras. Podés consultar las cámaras de 1era Calle.</p>
      <button type="button" onClick={() => onSelect(PRIMARY_SECTOR)} className="mt-6 cursor-pointer rounded-lg border border-accent/40 px-4 py-2.5 text-sm text-accent transition-colors hover:border-accent">Ver cámaras de 1era Calle</button>
    </div>
  </section>;
}
