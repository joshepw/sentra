"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 py-16 text-text">
      <div className="mb-10 flex items-center gap-[7px]">
        <SentraLogoMark />
        <SentraWordmark />
      </div>

      <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#e0655a]">
        Error 500
      </p>
      <h1 className="max-w-[560px] text-center font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
        Algo falló en el sistema.
      </h1>
      <p className="mt-5 max-w-[440px] text-center text-base leading-relaxed text-text-muted sm:text-lg">
        Tuvimos un problema al cargar esta vista. Puedes reintentar o volver al
        inicio mientras lo resolvemos.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-[11px] bg-accent px-7 py-3.5 text-sm font-semibold text-bg transition-transform hover:-translate-y-px"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="rounded-[11px] border border-[rgba(141,168,154,0.28)] px-7 py-3.5 text-sm font-semibold text-text transition-colors hover:border-accent"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
