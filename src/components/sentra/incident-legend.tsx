export function IncidentLegend({ inspection = false }: { inspection?: boolean }) {
  return <p aria-label="Leyenda de incidencias" className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[10px] text-text-faint">
    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm border-2 border-[#ffdb68]" />Pendiente de revisión</span>
    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm border-2 border-[#ff5263]" />Confirmada</span>
    {inspection && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm border-2 border-white" />Inspeccionando</span>}
  </p>;
}
