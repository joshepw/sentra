import Image from "next/image";
import { faunaItems } from "@/lib/sentra-data";
import { Container, Eyebrow, SectionTitle } from "./ui";

export function Biodiversidad() {
  return (
    <section
      id="biodiversidad"
      className="border-t border-[rgba(141,168,154,0.16)] bg-bg-panel py-12 sm:py-16 lg:py-[90px]"
    >
      <Container>
        <Eyebrow>Monitoreo de biodiversidad</Eyebrow>
        <SectionTitle className="mb-11 max-w-[820px]">
          Un inventario vivo de la fauna, identificado por IA
        </SectionTitle>

        <div className="grid items-stretch gap-8 lg:grid-cols-[1fr_2fr] lg:gap-11">
          <div className="flex flex-col justify-center">
            <p className="text-lg leading-relaxed text-text-muted">
              Cámaras solares con IA que identifican especies automáticamente y
              construyen un inventario digital de la fauna del Merendón — una
              herramienta de conservación que hoy no existe en la región.
            </p>
            <div className="mt-9 border-t border-[rgba(141,168,154,0.16)] pt-[30px]">
              <div className="font-display text-[2.75rem] font-extrabold leading-none tracking-[-0.02em] text-accent sm:text-5xl lg:text-[66px]">
                247
              </div>
              <div className="mt-2 font-mono text-[11px] font-medium uppercase leading-snug tracking-[0.12em] text-text-faint">
                especies registradas · meta conceptual
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {faunaItems.map((item) => (
              <div
                key={item.name}
                className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[rgba(141,168,154,0.16)] bg-[#0c1d14]"
              >
                <Image
                  src={item.src}
                  alt={item.name}
                  fill
                  className="object-cover"
                  style={{ objectPosition: item.position }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,20,17,0.72)] to-transparent to-55%" />
                <div className="absolute bottom-3 left-3 rounded-[7px] border border-accent-deep bg-[rgba(8,20,17,0.78)] px-[11px] py-1.5 font-mono text-xs font-medium text-accent">
                  {item.name} · {item.pct}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
