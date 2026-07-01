import { Container, Eyebrow, SectionTitle } from "./ui";

export function Ciencia() {
  return (
    <section id="ciencia" className="py-12 sm:py-16 lg:py-[90px]">
      <Container className="flex flex-wrap gap-12">
        <div className="min-w-[340px] flex-1">
          <Eyebrow>Ciencia & metadata</Eyebrow>
          <SectionTitle className="mb-[22px] sm:text-[2.75rem] lg:text-[54px] lg:leading-[1.02]">
            Cada evento es un dato para la ciudad
          </SectionTitle>
          <p className="mb-[22px] text-lg leading-relaxed text-text-muted">
            No solo reaccionamos: estructuramos. Cada detección genera metadata
            —tipo, severidad, ubicación, hora— que alimenta estudios de
            movilidad y seguridad vial para tomar decisiones de
            infraestructura con evidencia.
          </p>
          <p className="text-lg leading-relaxed text-text-muted">
            Nuestros modelos se entrenan y validan con datos locales y
            participamos en estudios técnicos sobre el uso de IA y metadata
            aplicada al territorio.
          </p>
        </div>

        <div className="flex min-w-[340px] flex-1 flex-col gap-3.5">
          <div className="rounded-[14px] border border-[rgba(141,168,154,0.16)] bg-bg-card p-[28px_30px]">
            <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.16em] text-accent">
              METADATA ESTRUCTURADA
            </div>
            <div className="font-mono text-[13.5px] leading-[1.7] text-text-muted">
              {"{ \"evento\": \"colisión\","}
              <br />
              {"  \"severidad\": \"alta\","}
              <br />
              {"  \"ubicacion\": \"Circunvalación\","}
              <br />
              {"  \"hora\": \"14:32:08\","}
              <br />
              {"  \"confianza\": 0.98 }"}
            </div>
          </div>
          <div className="flex gap-3.5">
            {[
              { title: "Local", desc: "Modelos validados\ncon datos de la ciudad" },
              { title: "Abierto", desc: "Datos exportables\npara estudios" },
            ].map((item) => (
              <div
                key={item.title}
                className="flex-1 rounded-[14px] border border-[rgba(141,168,154,0.16)] bg-bg-card p-[26px_28px]"
              >
                <div className="font-display text-[30px] font-semibold tracking-[-0.02em]">
                  {item.title}
                </div>
                <div className="mt-2.5 whitespace-pre-line font-mono text-[11px] font-medium uppercase leading-snug tracking-[0.1em] text-text-faint">
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
