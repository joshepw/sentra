"use client";

/* eslint-disable @next/next/no-img-element -- Evidence thumbnails use the authenticated browser session. */
import { useRef, useState } from "react";
import { historyTime, type HistoryItem } from "@/lib/history-detections";
import { vehicleName } from "@/lib/edge-replay";
import { DEMO_DECISION, demoCaseNumber, demoVehicleProfile, incidentTitle, type DemoCase, type DemoCaseChange, type DemoDecision } from "@/lib/case-demo";
import styles from "./case-file.module.css";

export function CaseFile({ item, value, onChange, onReplay }: {
  item: HistoryItem; value: DemoCase; onChange: (change: DemoCaseChange) => void; onReplay: () => Promise<void>;
}) {
  const profile = demoVehicleProfile(item);
  const number = demoCaseNumber(item);
  const at = item.at ?? item.best_time ?? item.first ?? item.playback.at;
  const dialog = useRef<HTMLDialogElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [replaying, setReplaying] = useState(false), [error, setError] = useState("");
  const latest = value.activity.at(-1);
  const decide = (decision: DemoDecision) => onChange({ decision, at: Date.now() / 1000 });
  const replay = async () => {
    setReplaying(true); setError("");
    try { await onReplay(); }
    catch { setError("No se pudo volver al momento. Puede intentarlo de nuevo."); }
    finally { setReplaying(false); }
  };
  return <div className={styles.file} data-case-file>
    <div className={styles.body} data-case-scroll>
      <section className={styles.section}>
        <div className="flex items-center justify-between gap-2">
          <span className={styles.eyebrow}>Ficha del caso</span>
          <span className={styles.badge}>DEMOSTRACIÓN</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-text-faint" data-case-number>{number}</p>
        <h3 className="mt-2 text-[15px] leading-snug font-semibold">{incidentTitle(item.kind)}</h3>
        {item.kind && <p className={`${styles.status} mt-2`} data-decision={value.decision} data-case-decision>{DEMO_DECISION[value.decision]} · Demo</p>}
        <div className={styles.vehicle}>
          {item.thumbnail_url && !imageFailed ? <img className={styles.thumbnail} src={item.thumbnail_url} onError={() => setImageFailed(true)} alt="Recorte de la observación" />
            : <div className={`${styles.thumbnail} ${styles.missing}`}>Sin recorte disponible</div>}
          <div className="min-w-0">
            {profile && <div className={styles.plate} aria-label={`Placa de demostración ${profile.plate}`}>
              <div className={styles.plateTop}>HONDURAS</div>
              <div className={styles.plateNumber} data-demo-plate>{profile.plate}</div>
              <div className={styles.plateBottom}>PLACA SIMULADA</div>
            </div>}
            <p className="mt-2 text-xs text-text-muted">{vehicleName(item.type, item.color, item.class_id)}</p>
          </div>
        </div>
        {profile && <p className="mt-2 text-[10px] leading-relaxed text-text-faint">La placa y el titular son datos de ejemplo.</p>}
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>Evidencia de cámara</p>
        <p className="mt-2 text-xs">{item.title || item.camera}</p>
        <p className="mt-1 text-xs text-text-muted">{historyTime(at)} · Honduras</p>
        {item.kind && <p className="mt-2 text-[11px] text-text-faint">Revisión guardada: {item.review === "confirmed" ? "confirmada" : item.review === "dismissed" ? "descartada" : "pendiente"}.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={styles.action} disabled={replaying} onClick={() => void replay()}>{replaying ? "Abriendo momento…" : "Volver al momento"}</button>
          {item.clip_url && <a className={styles.action} href={item.clip_url} download>Descargar evidencia</a>}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-warning">{error}</p>}
      </section>

      {profile && <details className={`${styles.section} ${styles.details}`}>
        <summary><span>Titular registrado <span className="ml-1 text-[10px] text-warning">Simulado</span></span></summary>
        <dl>
          <div><dt>Nombre de ejemplo</dt><dd>{profile.owner}</dd></div>
          <div><dt>Identificación simulada</dt><dd>{profile.document}</dd></div>
          <div><dt>Licencia simulada</dt><dd>{profile.license}</dd></div>
          <div><dt>Conductor</dt><dd>Sin identificar</dd></div>
        </dl>
      </details>}

      <section className={styles.section}>
        <label htmlFor="case-review-note" className="text-xs">Observación del agente <span className="text-text-faint">· Demo</span></label>
        <textarea id="case-review-note" value={value.note} maxLength={1000} rows={3} onChange={event => onChange({ note: event.target.value })}
          placeholder="Describa lo observado en el video…" className="mt-2 block w-full resize-none rounded-lg border border-[var(--border)] bg-[#07130e] p-2.5 text-xs leading-relaxed outline-none focus:border-accent" />
        <p className="mt-1 text-right font-mono text-[9px] text-text-faint">{value.note.length}/1000</p>
      </section>

      <details className={`${styles.section} ${styles.details}`}>
        <summary>Actividad de la demostración{value.activity.length > 0 && ` · ${value.activity.length}`}</summary>
        {value.activity.length ? <ol className="mt-3 space-y-3 text-xs">{value.activity.toReversed().map((event, index) => <li key={`${event.at}:${index}`}>
          <p>{DEMO_DECISION[event.decision]} <span className="text-text-faint">· {historyTime(event.at, false)}</span></p>
          {event.note && <p className="mt-1 break-words whitespace-pre-wrap text-text-muted">{event.note}</p>}
        </li>)}</ol> : <p className="mt-3 text-xs text-text-faint">Todavía no hay decisiones en esta demostración.</p>}
      </details>
    </div>

    <div className={styles.actions} data-case-actions>
      {item.kind ? <>
        {value.decision === "confirmed" ? <button type="button" className={`${styles.action} ${styles.primary}`} onClick={() => dialog.current?.showModal()}>Preparar acta · Demo</button>
          : <button type="button" className={`${styles.action} ${styles.primary}`} onClick={() => decide("confirmed")}>Confirmar infracción · Demo</button>}
        <div className={styles.secondary}>
          <button type="button" className={styles.action} disabled={value.decision === "dismissed"} onClick={() => decide("dismissed")}>Descartar · Demo</button>
          <button type="button" className={styles.action} disabled={value.decision === "pending"} onClick={() => decide("pending")}>Dejar pendiente</button>
        </div>
        <p className={styles.notice} role="status">{latest ? `${DEMO_DECISION[latest.decision]} en esta demostración. ` : "Revisión de demostración. "}El registro original se conserva. El demo se reinicia al recargar.</p>
      </> : <p className="text-xs leading-relaxed text-text-muted">Esta observación no tiene una incidencia asociada. Puede revisar el video y anotar lo observado.</p>}
    </div>

    <dialog ref={dialog} className={styles.dialog} aria-labelledby="demo-report-title">
      <div className={styles.report}>
        <div className="flex items-center justify-between gap-3"><span className={styles.badge}>SIN VALIDEZ OFICIAL</span><button type="button" className={styles.action} onClick={() => dialog.current?.close()} autoFocus>Cerrar acta</button></div>
        <p className={`${styles.eyebrow} mt-6`}>Senttra · Revisión de incidente</p>
        <h2 id="demo-report-title" className="mt-2 text-xl font-semibold">Acta de demostración</h2>
        <p className="mt-1 font-mono text-xs text-accent">{number}</p>
        <dl>
          <div><dt>Evento observado</dt><dd>{incidentTitle(item.kind)}</dd></div>
          <div><dt>Fecha y hora de la evidencia</dt><dd>{historyTime(at)} · Honduras</dd></div>
          <div><dt>Cámara</dt><dd>{item.title || item.camera}</dd></div>
          <div><dt>Decisión de demostración</dt><dd>{DEMO_DECISION[value.decision]}</dd></div>
          {profile && <><div><dt>Placa simulada</dt><dd>{profile.plate}</dd></div><div><dt>Titular simulado</dt><dd>{profile.owner}</dd></div></>}
        </dl>
        <p className={styles.eyebrow}>Observación del agente</p>
        <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed">{value.note || "Sin observación adicional."}</p>
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs leading-relaxed text-text-faint">Vista previa de demostración. Los datos de registro son ficticios; esta acción no emite una sanción.</p>
      </div>
    </dialog>
  </div>;
}
