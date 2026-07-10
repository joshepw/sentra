import { Container, Eyebrow, SectionTitle } from "./ui";
import { CaptureIcon } from "./icons";

const values = [
  {
    num: "01 · TERRITORIO PRIMERO",
    desc: "Modelos entrenados y validados con datos de nuestras propias calles, no con supuestos de otro país.",
  },
  {
    num: "02 · POTENCIAR, NO REEMPLAZAR",
    desc: "Aprovechamos las cámaras y sistemas que la ciudad ya pagó, sumando una capa de inteligencia encima.",
  },
  {
    num: "03 · DECISIONES CON EVIDENCIA",
    desc: "Cada detección se convierte en metadata estructurada que sustenta política pública e infraestructura.",
  },
];

const captureItems = [
  "Cámaras y sensores",
  "Estaciones ambientales",
  "Telemetría vial y de ríos",
  "Cámaras solares de fauna",
  "Sensores de nivel en vados",
  "Radar y conteo vehicular",
];

export function Nosotros() {
  return (
    <section
      id="nosotros"
      className="border-t border-[rgba(141,168,154,0.16)] bg-bg-panel py-12 sm:py-16 lg:py-[90px]"
    >
      <Container className="flex flex-wrap gap-14">
        <div className="min-w-[360px] flex-[1.1]">
          <Eyebrow>Quiénes somos</Eyebrow>
          <SectionTitle className="mb-6 max-w-[640px] sm:text-[2.75rem] lg:text-[54px] lg:leading-[1.02]">
            Un equipo local resolviendo problemas de ciudad
          </SectionTitle>
          <p className="mb-5 max-w-[600px] text-lg leading-relaxed text-text-muted">
            Senttra es un equipo hondureño que construye inteligencia artificial
            aplicada a los retos reales de nuestras ciudades: seguridad vial,
            seguridad ciudadana y resiliencia climática.
          </p>
          <p className="mb-[34px] max-w-[600px] text-lg leading-relaxed text-text-muted">
            Trabajamos desde San Pedro Sula, cerca del territorio y de quienes
            toman decisiones. No importamos soluciones genéricas: entrenamos y
            validamos con datos locales, sobre la infraestructura que la ciudad
            ya tiene.
          </p>
          <div className="inline-flex items-center gap-[11px] rounded-full border border-[rgba(141,168,154,0.22)] px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-faint">
            <span className="block size-[7px] rounded-full bg-accent" />
            Con base en San Pedro Sula, Honduras
          </div>
        </div>

        <div className="flex min-w-[340px] flex-1 flex-col gap-3.5">
          {values.map((v) => (
            <div
              key={v.num}
              className="rounded-[14px] border border-[rgba(141,168,154,0.16)] bg-bg-card p-[28px_30px]"
            >
              <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.16em] text-accent">
                {v.num}
              </div>
              <div className="text-base leading-[1.55] text-text-muted">{v.desc}</div>
            </div>
          ))}
        </div>
      </Container>

      <Container className="mt-[52px] border-t border-[rgba(141,168,154,0.16)] pt-[42px]">
        <Eyebrow className="mb-7">Cómo lo hacemos</Eyebrow>
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex min-w-[230px] flex-1 flex-col gap-3">
            <div className="mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
              Captura de datos
            </div>
            {captureItems.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3.5 rounded-xl border border-[rgba(141,168,154,0.16)] bg-bg-card px-[18px] py-4"
              >
                <CaptureIcon label={item} />
                <span className="font-display text-[17px] font-semibold">{item}</span>
              </div>
            ))}
          </div>

          <Arrow />

          <div className="min-w-[190px] flex-[0.85] rounded-[14px] border border-accent-deep bg-bg-card-2 p-[30px_24px]">
            <svg width="56" height="56" viewBox="0 0 56 56" className="mb-[18px] block">
              <circle
                cx="28"
                cy="28"
                r="22"
                fill="none"
                stroke="#3dd68c"
                strokeWidth="2.4"
                strokeDasharray="8 9"
                strokeLinecap="round"
                className="origin-center animate-sn-spin"
                style={{ transformBox: "fill-box" }}
              />
              <circle cx="28" cy="28" r="12" fill="none" stroke="#3dd68c" strokeOpacity="0.5" strokeWidth="2.4" />
              <circle cx="28" cy="28" r="4" fill="#3dd68c" className="origin-center animate-sn-pulse" style={{ transformBox: "fill-box" }} />
            </svg>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Procesamiento
            </div>
            <div className="mt-3 font-display text-[26px] font-bold leading-tight">
              Inteligencia Artificial
            </div>
            <div className="mt-2.5 text-sm text-text-muted">Predicción y alertas</div>
          </div>

          <Arrow />

          <div className="min-w-[220px] flex-1 rounded-[14px] border border-accent bg-gradient-to-br from-[#143a27] to-[#0f2a1c] p-[34px_28px]">
            <svg width="56" height="56" viewBox="0 0 56 56" className="mb-[18px] block overflow-visible">
              <circle cx="28" cy="28" r="22" fill="none" stroke="#3dd68c" strokeWidth="2.4" className="origin-center animate-sn-ripout" style={{ transformBox: "fill-box" }} />
              <circle cx="28" cy="28" r="22" fill="none" stroke="#3dd68c" strokeOpacity="0.9" strokeWidth="2.6" />
              <circle cx="28" cy="28" r="9" fill="#3dd68c" />
            </svg>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Plataforma única
            </div>
            <div className="mt-3 font-display text-[28px] font-bold leading-tight">
              Senttra One · Centro de Monitoreo
            </div>
          </div>
        </div>
        <p className="mt-[26px] font-display text-[26px] font-semibold tracking-[-0.01em]">
          Todo conectado a <span className="text-accent">una sola plataforma.</span>
        </p>
      </Container>
    </section>
  );
}

function Arrow() {
  return (
    <svg width="40" height="24" viewBox="0 0 120 40" className="shrink-0" aria-hidden>
      <line x1="0" y1="20" x2="108" y2="20" stroke="#3dd68c" strokeWidth="3" />
      <polyline points="96,10 110,20 96,30" fill="none" stroke="#3dd68c" strokeWidth="3" />
    </svg>
  );
}
