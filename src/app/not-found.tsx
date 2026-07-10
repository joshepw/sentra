import Link from "next/link";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-16 text-text">
      <div className="mb-10 flex items-center gap-[7px]">
        <SentraLogoMark />
        <SentraWordmark />
      </div>

      <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        Error 404
      </p>
      <h1 className="max-w-[520px] text-center font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
        Esta ruta no está en el mapa.
      </h1>
      <p className="mt-5 max-w-[420px] text-center text-base leading-relaxed text-text-muted sm:text-lg">
        La página que buscas no existe o se movió. Vuelve al centro de monitoreo
        de Senttra.
      </p>

      <Link
        href="/"
        className="mt-10 rounded-[11px] bg-accent px-7 py-3.5 text-sm font-semibold text-bg transition-transform hover:-translate-y-px"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
