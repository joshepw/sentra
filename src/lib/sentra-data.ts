export const threatCards = [
  { num: "01", title: "Inundaciones", desc: "Zonas urbanas anegadas en cada temporada de lluvias." },
  { num: "02", title: "Crecidas repentinas", desc: "Ríos que suben en minutos, sin previo aviso." },
  { num: "03", title: "Incendios forestales", desc: "Pérdida de bosque y cobertura en la cuenca." },
  { num: "04", title: "Pérdida de biodiversidad", desc: "Hábitat y fauna en presión constante." },
  { num: "05", title: "Crecimiento urbano", desc: "Expansión que reduce el margen natural." },
  { num: "06", title: "Tráfico", desc: "Congestión creciente que hoy se gestiona sin datos." },
  { num: "07", title: "Accidentes", desc: "Siniestros viales que se conocen tarde y sin evidencia." },
  { num: "08", title: "Falta de metadatos", desc: "Lo que ocurre en la ciudad no queda registrado ni medible." },
  { num: "09", title: "Decisiones a ciegas", desc: "Se decide por percepción: las autoridades se atienen a lo que la gente dice, no a los números." },
  { num: "10", title: "Poca tecnología", desc: "Infraestructura urbana con escasa inteligencia y sensores." },
];

export const tabsData = [
  {
    title: "Detección de accidentes",
    tag: "colisión · 98%",
    cam: "CAM-07 · CIRCUNVALACIÓN",
    desc: "Visión por computadora identifica colisiones y trayectorias de riesgo en tiempo real y dispara la alerta antes de que alguien levante el teléfono.",
    bullets: [
      "Detección de colisiones y trayectorias en segundos",
      "Clasificación automática por severidad",
      "Evidencia con fotograma y hora exacta",
    ],
  },
  {
    title: "Telemetría de tráfico",
    tag: "vehículo · 98%",
    cam: "CAM-03 · BLVD DEL NORTE",
    desc: "Convierte cada cámara en un sensor de flujo: cuántos vehículos pasan, a qué hora y dónde se forma la congestión.",
    bullets: [
      "Vehículos por hora y por carril",
      "Niveles de congestión por franja horaria",
      "Patrones para planificar semáforos e infraestructura",
    ],
  },
  {
    title: "Infracciones",
    tag: "infracción · 95%",
    cam: "CAM-11 · BLVD DEL SUR",
    desc: "Semáforo en rojo, exceso de velocidad y maniobras indebidas detectadas y documentadas automáticamente.",
    bullets: [
      "Cruce de semáforo en rojo",
      "Velocidad y maniobras indebidas",
      "Evidencia lista para la autoridad competente",
    ],
  },
  {
    title: "Alertas preventivas",
    tag: "evento · 97%",
    cam: "CAM-02 · ANILLO PERIFÉRICO",
    desc: "Ante un evento, las entidades correctas reciben la notificación al instante: tránsito, policía municipal o bomberos.",
    bullets: [
      "Notificación automática a cada entidad",
      "Priorización por tipo y severidad",
      "Respuesta coordinada, sin intermediarios",
    ],
  },
  {
    title: "Conteo de biodiversidad",
    tag: "venado · 96%",
    cam: "CÁMARA SOLAR · MERENDÓN",
    desc: "Cámaras solares con IA identifican y cuentan la fauna automáticamente, construyendo un inventario digital vivo de las especies del territorio.",
    bullets: [
      "Identificación automática por especie",
      "Conteo e inventario digital de fauna",
      "Datos abiertos para conservación y estudios",
    ],
  },
  {
    title: "Clima y predicción",
    tag: "lluvia · +6 h",
    cam: "ESTACIÓN · CUENCA",
    desc: "Estaciones ambientales leen lluvia, temperatura, viento y radiación minuto a minuto; la IA proyecta el clima con horas de anticipación.",
    bullets: [
      "Variables meteorológicas en tiempo real",
      "Predicción con horas de anticipación",
      "Base para alertas tempranas del territorio",
    ],
  },
  {
    title: "Alertas de inundación",
    tag: "nivel · crítico",
    cam: "SENSOR · RÍO / VADO",
    desc: "Sensores en ríos, quebradas y vados detectan el nivel del agua, la velocidad de la crecida y el riesgo de desbordamiento — con lógica de semáforo.",
    bullets: [
      "Nivel y velocidad de crecida en vivo",
      "Semáforo: normal, vigilancia, crítico",
      "Aviso automático a protección civil",
    ],
  },
  {
    title: "Historial & metadata",
    tag: "evento · 96%",
    cam: "ARCHIVO · INDEXADO",
    desc: "Todo evento queda indexado. Encuentra qué pasó por hora y lugar sin revisar horas de video fotograma por fotograma.",
    bullets: [
      "Búsqueda por hora, lugar y tipo de evento",
      "Reconstrucción de incidentes en minutos",
      "Metadata estructurada para estudios de movilidad",
    ],
  },
];

export const feeds = [
  { t: "Colisión detectada", loc: "Av. Circunvalación", sev: "alta" as const },
  { t: "Semáforo en rojo cruzado", loc: "Bulevar del Norte", sev: "media" as const },
  { t: "Congestión nivel alto", loc: "1 Calle / 7 Avenida", sev: "media" as const },
  { t: "Vehículo detenido en vía", loc: "Salida a La Lima", sev: "baja" as const },
  { t: "Flujo normalizado", loc: "Av. Junior", sev: "baja" as const },
  { t: "Posible colisión", loc: "Anillo Periférico", sev: "alta" as const },
  { t: "Exceso de velocidad", loc: "Bulevar del Sur", sev: "media" as const },
];

export const faunaItems = [
  { name: "Tigrillo", pct: "98%", src: "/assets/fauna-tigrillo.jpeg", position: "center" },
  { name: "Tucán", pct: "94%", src: "/assets/fauna-tucan.jpeg", position: "center" },
  { name: "Pizote", pct: "91%", src: "/assets/fauna-pizote.jpeg", position: "center" },
  { name: "Perezoso", pct: "89%", src: "/assets/fauna-perezoso.jpeg", position: "center 20%" },
  { name: "Guara roja", pct: "96%", src: "/assets/fauna-guara.jpeg", position: "center" },
  { name: "Venado", pct: "87%", src: "/assets/fauna-venado.jpeg", position: "right center" },
];

export const wizTypes = [
  "Municipalidad",
  "Entidad gubernamental",
  "Empresa privada",
  "ONG / academia",
  "Inversor",
  "Otro",
];

export const wizServicesList = [
  "Detección de accidentes",
  "Telemetría de tráfico",
  "Infracciones",
  "Alertas preventivas",
  "Conteo de biodiversidad",
  "Clima y predicción",
  "Alertas de inundación",
  "Historial & metadata",
];

export const navLinks = [
  { href: "#desafio", label: "Desafío" },
  { href: "#plataforma", label: "Plataforma" },
  { href: "#ambiental", label: "Ambiental" },
  { href: "#biodiversidad", label: "Biodiversidad" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#proyectos", label: "Proyectos" },
];
