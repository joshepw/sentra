import Link from "next/link";
import { Container, Eyebrow, SectionTitle } from "./ui";

const impactCards = [
  {
    value: (
      <>
        20 <span className="font-display text-2xl text-text-faint">→</span>{" "}
        <span className="text-accent">2</span>
      </>
    ),
    desc: "Monitoristas necesarios por centro. La IA vigila; las personas validan y deciden.",
  },
  {
    value: (
      <>
        9<span className="text-xl text-text-muted sm:text-[30px]"> en 1</span>
      </>
    ),
    desc: "Cámaras procesadas por una sola unidad de inferencia. Menos costo, mismo alcance.",
  },
  {
    value: "Segundos",
    desc: "Frente a horas de revisión manual fotograma por fotograma para reconstruir un incidente.",
  },
];

export function Impacto() {
  return (
    <section
      id="impacto"
      className="border-t border-[rgba(141,168,154,0.16)] bg-bg-panel py-12 sm:py-16 lg:py-[90px]"
    >
      <Container>
        <Eyebrow>Impacto operativo</Eyebrow>
        <SectionTitle className="mb-8 max-w-[740px] sm:mb-[50px]">
          Más cobertura, con una fracción del equipo
        </SectionTitle>

        <div className="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-3">
          {impactCards.map((card) => (
            <div
              key={card.desc}
              className="rounded-2xl border border-[rgba(141,168,154,0.16)] bg-bg-card p-6 lg:p-[38px]"
            >
              <div className="font-display text-4xl font-semibold leading-none tracking-[-0.03em] sm:text-5xl lg:text-[56px]">
                {card.value}
              </div>
              <div className="mt-[18px] text-base leading-normal text-text-muted">
                {card.desc}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-[rgba(61,214,140,0.28)] bg-bg-card-2 p-6 sm:gap-6 lg:p-[40px_44px]">
          <div className="max-w-[740px] font-display text-xl font-bold leading-tight tracking-[-0.02em] sm:text-2xl lg:text-[30px]">
            Sobre la infraestructura que ya pagaste, Sentra multiplica lo que tu
            equipo puede <span className="text-accent">ver y prevenir</span>.
          </div>
          <Link
            href="#contacto"
            className="shrink-0 rounded-[10px] bg-accent px-[26px] py-4 text-sm font-semibold text-bg"
          >
            Calcular mi ROI
          </Link>
        </div>
      </Container>
    </section>
  );
}
