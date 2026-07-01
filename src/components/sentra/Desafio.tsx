import { threatCards } from "@/lib/sentra-data";
import { Container, Eyebrow, SectionIntro, SectionTitle } from "./ui";
import { ThreatIcon } from "./icons";

export function Desafio() {
  return (
    <section id="desafio" className="py-12 sm:py-16 lg:py-[90px]">
      <Container>
        <Eyebrow>El contexto</Eyebrow>
        <SectionTitle className="mb-3.5 max-w-[760px]">
          El desafío que enfrentamos
        </SectionTitle>
        <SectionIntro className="mb-11 max-w-[660px]">
          San Pedro Sula enfrenta riesgos que crecen más rápido que su
          capacidad de anticiparlos — del clima al tráfico. Hoy se reacciona
          tarde y se decide por percepción, no por datos.
        </SectionIntro>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 sm:min-w-0 sm:grid-cols-[repeat(auto-fit,minmax(198px,1fr))] sm:gap-4">
          {threatCards.map((card) => (
            <div
              key={card.num}
              className="rounded-2xl border border-[rgba(141,168,154,0.16)] bg-bg-card px-5 py-6 sm:px-6 sm:py-[26px]"
            >
              <div className="mb-7 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-accent">
                  {card.num}
                </span>
                <ThreatIcon num={card.num} />
              </div>
              <div className="font-display text-lg font-semibold leading-tight">
                {card.title}
              </div>
              <div className="mt-2 text-[13px] leading-normal text-text-muted">
                {card.desc}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-[34px] border-t border-[rgba(141,168,154,0.16)] pt-[30px]">
          <p className="font-display text-2xl font-bold leading-tight tracking-[-0.01em] sm:text-3xl lg:text-[48px]">
            « La mejor forma de responder a un desastre es{" "}
            <span className="text-accent">
              saber que viene antes de que ocurra »
            </span>
          </p>
        </div>

        <div className="mt-[58px]">
          <Eyebrow className="mb-[18px]">El cambio de modelo</Eyebrow>
          <h3 className="mb-7 max-w-[640px] font-display text-2xl font-bold leading-tight tracking-[-0.02em] sm:text-3xl lg:text-[38px]">
            De reaccionar a anticipar
          </h3>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-[rgba(224,101,90,0.35)] bg-bg-card p-5 sm:p-8">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-danger">
                Hoy · Reacción
              </div>
              <div className="mt-3.5 font-display text-2xl font-bold leading-tight">
                Respondemos después del impacto
              </div>
              <div className="my-6">
                <svg viewBox="0 0 560 180" className="block h-auto w-full">
                  <line
                    x1="0"
                    y1="120"
                    x2="560"
                    y2="120"
                    stroke="rgba(141,168,154,.3)"
                    strokeWidth="2"
                  />
                  <polyline
                    points="0,120 250,120 290,40 560,40"
                    fill="none"
                    stroke="#e0655a"
                    strokeWidth="4"
                  />
                  <circle cx="250" cy="120" r="9" fill="#e0655a" />
                  <circle cx="430" cy="40" r="9" fill="#e0655a" />
                  <text
                    x="250"
                    y="150"
                    fill="#90a89a"
                    fontFamily="IBM Plex Mono"
                    fontSize="17"
                  >
                    Evento
                  </text>
                  <text
                    x="372"
                    y="28"
                    fill="#e0655a"
                    fontFamily="IBM Plex Mono"
                    fontSize="17"
                  >
                    Respuesta tardía
                  </text>
                </svg>
              </div>
              <div className="text-[14.5px] leading-snug text-text-muted">
                Daños ya ocurridos, mayor costo humano y económico, decisiones
                bajo presión.
              </div>
            </div>

            <div className="flex flex-col rounded-2xl border border-[rgba(61,214,140,0.4)] bg-bg-card p-5 sm:p-8">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Sentra · Anticipación
              </div>
              <div className="mt-3.5 font-display text-2xl font-bold leading-tight">
                Actuamos antes del impacto
              </div>
              <div className="my-6">
                <svg viewBox="0 0 560 180" className="block h-auto w-full">
                  <line
                    x1="0"
                    y1="120"
                    x2="560"
                    y2="120"
                    stroke="rgba(141,168,154,.3)"
                    strokeWidth="2"
                  />
                  <polyline
                    points="0,120 150,120 190,40 560,40"
                    fill="none"
                    stroke="#3dd68c"
                    strokeWidth="4"
                  />
                  <circle cx="150" cy="120" r="9" fill="#3dd68c" />
                  <circle cx="380" cy="120" r="9" fill="#3dd68c" />
                  <text
                    x="120"
                    y="150"
                    fill="#3dd68c"
                    fontFamily="IBM Plex Mono"
                    fontSize="17"
                  >
                    Alerta
                  </text>
                  <text
                    x="330"
                    y="150"
                    fill="#90a89a"
                    fontFamily="IBM Plex Mono"
                    fontSize="17"
                  >
                    Evento
                  </text>
                </svg>
              </div>
              <div className="text-[14.5px] leading-snug text-text-muted">
                Horas de ventaja para evacuar, proteger y coordinar. Menos
                pérdidas, mejores decisiones.
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
