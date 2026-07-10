import Image from "next/image";
import { Container, Eyebrow, PrimaryButton, SecondaryButton } from "./ui";

const kpis = [
  { value: "16", label: "Cámaras en\npiloto", accent: false },
  { value: "Segundos", label: "Tiempo de\ndetección", accent: true },
  { value: "24/7", label: "Vigilancia\ncontinua", accent: false },
  { value: "San Pedro Sula", label: "Despliegue\nactivo", accent: false },
];

export function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/assets/hero-satellite.png"
          alt=""
          fill
          priority
          className="object-cover object-[center_32%]"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg,rgba(8,20,17,.9),rgba(8,20,17,.66) 46%,rgba(8,20,17,.3)),linear-gradient(0deg,#081411 0%,#081411 24%,rgba(8,20,17,.4) 56%,rgba(8,20,17,0) 84%)",
        }}
      />

      <Container className="relative pb-12 pt-24 sm:pb-16 sm:pt-28 lg:pb-[84px] lg:pt-[122px]">
        <svg
          width="520"
          height="520"
          viewBox="0 0 56 56"
          className="pointer-events-none absolute -right-[120px] top-9 overflow-visible opacity-28"
          aria-hidden
        >
          <circle
            cx="28"
            cy="28"
            r="18"
            fill="none"
            stroke="#3dd68c"
            strokeWidth="0.7"
            className="origin-center animate-sn-ripple"
            style={{ transformBox: "fill-box" }}
          />
          <circle
            cx="28"
            cy="28"
            r="18"
            fill="none"
            stroke="#1f8a5b"
            strokeWidth="0.7"
            className="origin-center animate-sn-ripple [animation-delay:1.8s]"
            style={{ transformBox: "fill-box" }}
          />
          <circle
            cx="28"
            cy="28"
            r="10"
            fill="none"
            stroke="#1f8a5b"
            strokeOpacity="0.5"
            strokeWidth="0.7"
          />
        </svg>

        <Eyebrow>Smart City · Monitoreo vial con IA</Eyebrow>

        <h1 className="relative max-w-[920px] font-display text-[2.125rem] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl sm:leading-[0.95] lg:text-[88px]">
          Los accidentes no nos toman por{" "}
          <span className="text-accent">sorpresa</span>.
        </h1>

        <p className="relative mt-5 max-w-[680px] text-base leading-[1.55] text-text-muted sm:mt-[30px] sm:text-lg lg:text-[21px]">
          Senttra convierte las cámaras y sensores de tu ciudad en datos
          inteligentes que ayudan a prevenir accidentes, anticipar riesgos y
          decidir con evidencia — en segundos, no en horas
          <span className="text-accent">.</span>
        </p>

        <div className="relative mt-10 flex flex-col gap-3 sm:flex-row sm:gap-3.5">
          <PrimaryButton href="#contacto">Agenda una demo</PrimaryButton>
          <SecondaryButton href="#plataforma">Ver la plataforma</SecondaryButton>
        </div>

        <div className="relative mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(141,168,154,0.16)] pt-6 sm:mt-[60px] sm:flex sm:flex-wrap sm:gap-[46px] sm:pt-[30px]">
          {kpis.map((kpi) => (
            <div key={kpi.label}>
              <div
                className={`font-display text-2xl font-semibold leading-none tracking-[-0.02em] sm:text-[28px] lg:text-[30px] ${kpi.accent ? "text-accent" : ""}`}
              >
                {kpi.value}
              </div>
              <div className="mt-[7px] whitespace-pre-line font-mono text-[11px] font-medium uppercase leading-snug tracking-[0.12em] text-text-faint">
                {kpi.label}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
