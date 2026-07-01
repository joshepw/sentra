import { Container, Eyebrow, SectionTitle } from "./ui";

const projects = [
  {
    num: "PROYECTO 01",
    status: "ACTIVO",
    statusColor: "text-accent",
    pulse: true,
    title: "Monitoreo vial con IA",
    location: "SAN PEDRO SULA",
    desc: "Detección de accidentes, telemetría de tráfico y alertas preventivas sobre la red de cámaras municipal.",
    highlight: true,
  },
  {
    num: "PROYECTO 02",
    status: "EN DISEÑO",
    statusColor: "text-warning",
    pulse: false,
    title: "Seguridad ciudadana",
    location: "VISIÓN PERIMETRAL",
    desc: "Detección de aglomeraciones y eventos de riesgo para espacios públicos y empresas.",
    highlight: false,
  },
  {
    num: "PROYECTO 03",
    status: "EXPLORACIÓN",
    statusColor: "text-text-faint",
    pulse: false,
    title: "Monitoreo ambiental",
    location: "RESILIENCIA CLIMÁTICA",
    desc: "Sensores y visión para anticipar riesgos climáticos sobre cuencas y zonas vulnerables.",
    highlight: false,
  },
];

export function Proyectos() {
  return (
    <section
      id="proyectos"
      className="border-t border-[rgba(141,168,154,0.16)] bg-bg-panel py-12 sm:py-16 lg:py-[90px]"
    >
      <Container>
        <Eyebrow>Proyectos</Eyebrow>
        <SectionTitle className="mb-8 sm:mb-[50px]">Lo que estamos construyendo</SectionTitle>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.num}
              className={`rounded-2xl border p-5 sm:p-7 lg:p-[34px] ${
                p.highlight
                  ? "border-[rgba(61,214,140,0.28)] bg-bg-card"
                  : "border-[rgba(141,168,154,0.16)] bg-bg-card"
              }`}
            >
              <div className="mb-6 flex items-center justify-between">
                <span
                  className={`font-mono text-[11px] font-semibold tracking-[0.16em] ${p.highlight ? "text-accent" : "text-text-faint"}`}
                >
                  {p.num}
                </span>
                <span
                  className={`flex items-center gap-[7px] font-mono text-[10px] font-medium tracking-[0.14em] ${p.statusColor}`}
                >
                  {p.pulse && (
                    <span className="block size-[7px] animate-sn-pulse rounded-full bg-accent" />
                  )}
                  {p.status}
                </span>
              </div>
              <div className="mb-2.5 font-display text-xl font-bold leading-tight sm:text-[26px]">
                {p.title}
              </div>
              <div className="mb-[18px] font-mono text-xs font-medium tracking-[0.1em] text-text-muted">
                {p.location}
              </div>
              <div className="text-[14.5px] leading-[1.55] text-text-muted">
                {p.desc}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
