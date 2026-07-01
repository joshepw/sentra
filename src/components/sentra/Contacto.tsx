"use client";

import { FormEvent, useState } from "react";
import { wizServicesList, wizTypes } from "@/lib/sentra-data";
import { Container, Eyebrow } from "./ui";
import { WizServiceIcon, WizTypeIcon } from "./icons";

export function Contacto() {
  const [wizStep, setWizStep] = useState(0);
  const [wizType, setWizType] = useState("");
  const [wizServices, setWizServices] = useState<string[]>([]);
  const [wizName, setWizName] = useState("");
  const [wizSent, setWizSent] = useState(false);

  const toggleService = (sv: string) => {
    setWizServices((prev) =>
      prev.includes(sv) ? prev.filter((x) => x !== sv) : [...prev, sv],
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nombre = String(form.get("nombre") || "");
    const contacto = String(form.get("contacto") || "");
    const mensaje = String(form.get("mensaje") || "");
    const body = `Tipo: ${wizType}\nServicios: ${wizServices.join(", ")}\nNombre: ${nombre}\nContacto: ${contacto}\n\n${mensaje}`;

    window.location.href = `mailto:hola@sentra.io?subject=${encodeURIComponent(`Solicitud Sentra — ${wizType}`)}&body=${encodeURIComponent(body)}`;
    setWizName(nombre);
    setWizSent(true);
  };

  return (
    <section id="contacto" className="relative overflow-hidden py-14 sm:py-20 lg:py-[110px]">
      <svg
        width="600"
        height="600"
        viewBox="0 0 56 56"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible opacity-22"
        aria-hidden
      >
        <circle cx="28" cy="28" r="18" fill="none" stroke="#3dd68c" strokeWidth="0.5" className="origin-center animate-sn-ripple" style={{ transformBox: "fill-box" }} />
        <circle cx="28" cy="28" r="18" fill="none" stroke="#3dd68c" strokeWidth="0.5" className="origin-center animate-sn-ripple [animation-delay:2s]" style={{ transformBox: "fill-box" }} />
      </svg>

      <Container className="relative max-w-[1080px]">
        <div className="text-center">
          <Eyebrow className="mb-[30px] inline-flex">
            Para municipalidades, empresas públicas e inversores
          </Eyebrow>
          <h2 className="font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em] sm:text-5xl sm:leading-[0.98] lg:text-[64px]">
            Construyamos la ciudad que se{" "}
            <span className="text-accent">anticipa</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-[600px] text-base leading-[1.55] text-text-muted sm:mt-[26px] sm:text-lg lg:text-xl">
            Agenda una demo del centro de monitoreo o conversemos sobre cómo
            invertir en Sentra.
          </p>
        </div>

        <div className="mt-10 grid gap-8 text-left sm:mt-14 sm:gap-11 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col">
            {[
              { label: "Correo", value: "hola@sentra.io" },
              { label: "Ubicación", value: "San Pedro Sula, Honduras" },
              { label: "Respuesta", value: "En 24–48 horas" },
            ].map((item, i, arr) => (
              <div
                key={item.label}
                className={`py-5 ${i < arr.length - 1 ? "border-b border-[rgba(141,168,154,0.16)]" : ""}`}
              >
                <div className="mb-[9px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                  {item.label}
                </div>
                <div className="font-display text-[19px] font-semibold">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[18px] border border-[rgba(141,168,154,0.2)] bg-bg-card p-5 sm:p-7 lg:p-[34px]">
            {!wizSent && (
              <div className="mb-6 flex items-center justify-between">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                  Paso {wizStep + 1} de 3
                </div>
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`block h-1.5 rounded-[3px] transition-all ${
                        i === wizStep
                          ? "w-[22px] bg-accent"
                          : i < wizStep
                            ? "w-2.5 bg-accent-deep"
                            : "w-2.5 bg-[rgba(141,168,154,0.28)]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {wizSent ? (
              <div className="flex flex-col items-center gap-4 px-1.5 py-6 text-center">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#3dd68c" strokeWidth="1.6" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                </svg>
                <div className="font-display text-2xl font-bold">
                  ¡Gracias{wizName ? `, ${wizName.split(" ")[0]}` : ""}! Recibimos tu solicitud.
                </div>
                <div className="max-w-[360px] text-[15px] leading-normal text-text-muted">
                  Te contactaremos sobre:{" "}
                  <span className="text-text">
                    {wizServices.join(", ") || "los servicios seleccionados"}
                  </span>
                  . También abrimos tu correo hacia hola@sentra.io.
                </div>
              </div>
            ) : wizStep === 0 ? (
              <>
                <div className="mb-2 font-display text-[23px] font-bold leading-tight">
                  ¿Qué tipo de organización eres?
                </div>
                <p className="animate-sn-feedin mb-5 text-sm leading-normal text-text-muted">
                  Cuéntanos quién eres para adaptar la propuesta a tu contexto.
                  Toma menos de un minuto.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {wizTypes.map((ty) => {
                    const selected = wizType === ty;
                    return (
                      <button
                        key={ty}
                        type="button"
                        onClick={() => {
                          setWizType(ty);
                          setWizStep(1);
                        }}
                        className={`flex cursor-pointer items-center gap-3 rounded-[11px] border px-4 py-[15px] text-left text-[13.5px] font-semibold transition-all ${
                          selected
                            ? "border-accent bg-bg-card-2 text-accent"
                            : "border-[rgba(141,168,154,0.28)] bg-bg text-text"
                        }`}
                      >
                        <WizTypeIcon type={ty} active={selected} />
                        {ty}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : wizStep === 1 ? (
              <>
                <div className="mb-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setWizStep(0)}
                    className="size-[34px] shrink-0 cursor-pointer rounded-[9px] border border-[rgba(141,168,154,0.28)] bg-transparent text-base text-text-muted"
                  >
                    ←
                  </button>
                  <div className="font-display text-[23px] font-bold leading-tight">
                    ¿Qué servicios te interesan?
                  </div>
                </div>
                <p className="animate-sn-feedin mb-5 text-sm leading-normal text-text-muted">
                  Elige todo lo que te interese — puedes marcar varias. Con esto
                  priorizamos lo que te mostramos.
                </p>
                <div className="flex flex-col gap-2.5">
                  {wizServicesList.map((sv) => {
                    const selected = wizServices.includes(sv);
                    return (
                      <button
                        key={sv}
                        type="button"
                        onClick={() => toggleService(sv)}
                        className={`flex w-full cursor-pointer items-center gap-[11px] rounded-[11px] border px-4 py-[13px] text-left text-[13.5px] font-semibold transition-all ${
                          selected
                            ? "border-accent bg-bg-card-2 text-text"
                            : "border-[rgba(141,168,154,0.28)] bg-bg text-text"
                        }`}
                      >
                        <span
                          className={`inline-block size-[17px] shrink-0 rounded-[5px] border ${
                            selected
                              ? "border-accent bg-accent shadow-[inset_0_0_0_3px_#0e2a1d]"
                              : "border-[rgba(141,168,154,0.4)]"
                          }`}
                        />
                        <WizServiceIcon service={sv} active={selected} />
                        {sv}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={wizServices.length === 0}
                  onClick={() => setWizStep(2)}
                  className={`mt-5 rounded-[11px] px-[30px] py-4 text-[15px] font-semibold ${
                    wizServices.length > 0
                      ? "cursor-pointer bg-accent text-bg"
                      : "cursor-default border border-[rgba(141,168,154,0.2)] bg-bg-card text-text-faint"
                  }`}
                >
                  Continuar
                </button>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setWizStep(1)}
                    className="size-[34px] shrink-0 cursor-pointer rounded-[9px] border border-[rgba(141,168,154,0.28)] bg-transparent text-base text-text-muted"
                  >
                    ←
                  </button>
                  <div className="font-display text-[23px] font-bold leading-tight">
                    ¿Cómo te contactamos?
                  </div>
                </div>
                <p className="animate-sn-feedin mb-5 text-sm leading-normal text-text-muted">
                  Último paso. Déjanos por dónde escribirte y te contactamos con
                  una propuesta a tu medida.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {[
                    { name: "nombre", label: "Nombre", placeholder: "Tu nombre", required: true },
                    {
                      name: "contacto",
                      label: "Teléfono o punto de contacto",
                      placeholder: "Teléfono, correo o WhatsApp",
                      required: true,
                    },
                  ].map((field) => (
                    <div key={field.name}>
                      <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                        {field.label}
                      </div>
                      <input
                        name={field.name}
                        required={field.required}
                        placeholder={field.placeholder}
                        className="w-full rounded-[10px] border border-[rgba(141,168,154,0.28)] bg-bg px-[15px] py-[13px] text-sm font-medium text-text outline-none"
                      />
                    </div>
                  ))}
                  <div>
                    <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                      Mensaje adicional
                    </div>
                    <textarea
                      name="mensaje"
                      rows={3}
                      placeholder="Opcional — cuéntanos más"
                      className="w-full resize-y rounded-[10px] border border-[rgba(141,168,154,0.28)] bg-bg px-[15px] py-[13px] text-sm font-medium leading-normal text-text outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="self-start rounded-[11px] bg-accent px-[30px] py-4 text-[15px] font-semibold text-bg transition-transform hover:-translate-y-px"
                  >
                    Enviar solicitud
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
