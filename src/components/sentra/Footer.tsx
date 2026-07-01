import { Container, SentraLogoMark, SentraWordmark } from "./ui";

export function Footer() {
  return (
    <footer className="border-t border-[rgba(141,168,154,0.16)] bg-bg-panel py-8 sm:py-[46px]">
      <Container className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-[7px]">
          <SentraLogoMark />
          <SentraWordmark size="sm" />
        </div>
        <div className="font-mono text-[11px] font-medium uppercase leading-relaxed tracking-[0.1em] text-text-faint">
          IA · Seguridad · Medio Ambiente
          <br />
          San Pedro Sula, Honduras · hola@sentra.io
        </div>
        <div className="font-mono text-[11px] font-medium tracking-[0.1em] text-text-faint">
          © 2026 Sentra
        </div>
      </Container>
    </footer>
  );
}
