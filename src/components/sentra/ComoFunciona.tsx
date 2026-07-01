import { Container, Eyebrow, SectionTitle } from "./ui";
import { StepIcon } from "./icons";

const steps = [
  {
    num: "01",
    title: "Cámaras existentes",
    desc: "Usamos la red de cámaras de tránsito que ya está instalada. Cero inversión en hardware nuevo.",
    highlight: false,
  },
  {
    num: "02",
    title: "IA de visión en el borde",
    desc: "Procesamos hasta 9 cámaras en una sola unidad y enviamos fotogramas optimizados, no video pesado.",
    highlight: false,
  },
  {
    num: "03",
    title: "Detección y clasificación",
    desc: "Colisiones, infracciones y congestión se identifican y clasifican automáticamente con su nivel de severidad.",
    highlight: false,
  },
  {
    num: "04",
    title: "Alertas + dashboard",
    desc: "Notificación automática a tránsito, policía y bomberos. Todo queda como metadata para análisis.",
    highlight: true,
  },
];

export function ComoFunciona() {
  return (
    <section id="como" className="pb-9 pt-12 sm:pt-16 lg:pt-[90px]">
      <Container>
        <Eyebrow>Cómo funciona</Eyebrow>
        <SectionTitle className="mb-8 max-w-[720px] sm:mb-[50px]">
          Del fotograma a la decisión, en segundos
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.num}
              className={`rounded-2xl border p-5 sm:p-8 ${
                step.highlight
                  ? "border-[rgba(61,214,140,0.28)] bg-bg-card-2"
                  : "border-[rgba(141,168,154,0.16)] bg-bg-card"
              }`}
            >
              <div className="mb-6 font-mono text-xs font-semibold tracking-[0.18em] text-accent">
                {step.num}
              </div>
              <StepIcon num={step.num} />
              <div className="mb-2 text-[19px] font-semibold">{step.title}</div>
              <div className="text-[14.5px] leading-[1.55] text-text-muted">
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
