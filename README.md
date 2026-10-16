# Senttra

Sitio web oficial de **Senttra One** ([senttra.com](https://senttra.com)) — plataforma de resiliencia y monitoreo Smart City para San Pedro Sula (región Merendón, Honduras).

Construido con [Next.js](https://nextjs.org) y listo para desplegar en [Vercel](https://vercel.com).

## Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3001](http://localhost:3001) en el navegador.

## Scripts

| Comando         | Descripción            |
| --------------- | ---------------------- |
| `npm run dev`   | Servidor de desarrollo |
| `npm run build` | Build de producción    |
| `npm run start` | Servidor de producción |
| `npm run lint`  | Linter ESLint          |

## Estructura

```
src/
├── app/                 # Layout, estilos globales y página principal
├── components/sentra/   # Secciones del landing (Hero, Plataforma, Contacto…)
└── lib/                 # Datos estáticos y utilidades
public/assets/           # Imágenes del sitio (hero, fauna)
```

## Desplegar en Vercel

1. Sube el repositorio a GitHub, GitLab o Bitbucket.
2. Entra a [vercel.com/new](https://vercel.com/new) e importa el repositorio.
3. Vercel detecta Next.js automáticamente.
4. Pulsa **Deploy**.

También puedes desplegar desde la CLI:

```bash
npx vercel
npx vercel --prod
```

## Diseño

El sitio reproduce el handoff de diseño (tema oscuro tipo control room, acento verde `#3dd68c`, tipografías Archivo + IBM Plex). Las referencias originales del ZIP de diseño están en `design-handoff/` (ignorado en git; los assets viven en `public/assets/`).

## Centro de operaciones en /edge

`/edge` y `/edge/live` abren una portada privada con la frase
«Anticipación y seguridad inteligente» y seis accesos: vueltas en U, cruces en
rojo, el incidente destacado, actividad por hora, Explorador y Centro de control.
Los dos contadores consultan todo el historial; el incidente abre directamente
su video y ficha. No hay selector global de período.

El Explorador permite consultar color de vehículo, color de camisa, tipo,
filtros combinados, otras apariciones visualmente similares y una grabación
por cámara/fecha/hora de Honduras. Los gráficos usan apariciones por cámara y
sesión; no representan identidades únicas. Tipo/color de vehículos conservan
la política de 07:00–18:00 HN, y buses/camiones se consultan sin color.

El Centro de control recorre Guatemala/El Salvador/Honduras → Honduras →
Cortés → San Pedro Sula. Todos los territorios mantienen el mismo estilo;
solo esa ruta avanza. La ciudad usa calles reales y una red visual de demostración.
Cualquier nodo abre las siete cámaras configuradas. Las alertas conservan su
cámara/evidencia y las posiciones de referencia del mapa original del corredor.
Los mapas y sus licencias están en `public/senttra/maps/`.

Se preparan los mapas, el resumen, miniaturas y una precarga acotada de medios
tras autenticar. Un fallo conserva un estado de error/reintento sin inventar
contadores. Las cámaras se montan al entrar al visor. Texto/voz, resultados,
ficha, reproducción y sesiones mantienen sus contratos existentes.

Requiere el backend con `GET /edge/api/history/dashboard` (resumen acumulado,
caché privada de 60 s) y `GET /edge/api/history/catalog` (paginación acumulada,
filtros cerrados). Estas rutas no cambian las ventanas de 31 días de las
herramientas conversacionales. Desplegar el backend antes del frontend.

`/edge/replay` conserva las once grabaciones de 90 segundos y «Nueva prueba».
El modo demo de cámaras depende de la configuración del backend y puede
reproducir grabaciones históricas. El acceso requiere Zitadel y el rol Senttra.

Next.js sirve la interfaz y reenvía solamente `/edge/api/*`, `/edge/auth/*`,
`/edge/media/*` y `/edge/healthz` al servicio existente
`https://senttra.filosofiacodigo.com/edge`. Videos con rangos HTTP, eventos SSE,
sesiones y protección CSRF quedan en ese servicio. Vercel no ejecuta modelos ni
almacena las grabaciones; las respuestas privadas no se almacenan en caché.
Los eventos se reconectan antes del límite de 120 segundos del proxy externo.
El sitio y `/demo` conservan sus rutas actuales.

El backend debe configurar `edge_public_url=https://www.senttra.com/edge` y
permitir exactamente `https://www.senttra.com/edge/auth/callback` en su aplicación
OIDC. Las sesiones de este acceso están separadas de las del dominio original.
Las vistas previas permiten comprobar la pantalla pública; el inicio de sesión
real corresponde al dominio canónico registrado en Zitadel.

Para una prueba local aislada, `SENTTRA_EDGE_ORIGIN=http://127.0.0.1:8160` permite
usar un backend de prueba al iniciar Next. Es configuración del servidor, nunca
una credencial de navegador. Producción usa el origen HTTPS predeterminado.

Actualizaciones del visor solo requieren desplegar este repositorio o reiniciar
su backend dedicado. No requieren recargar Caddy. Para revertir la integración,
revertir el commit de `/edge` y desplegar; el servicio original sigue disponible.

Pruebas del reloj, observaciones causales y galería (Node 24):

```bash
node --test tests/edge-replay.test.mjs
```

`tests/edge-classic.browser.mjs` comprueba el mapa, los once videos, sincronización,
pausa, selección, cajas/etiquetas/rastros, galería, pantalla completa, móvil y logout.
Usa un backend OIDC de fixture aislado, nunca credenciales reales. Recibe
`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `EDGE_TEST_ORIGIN` (por defecto localhost
HTTPS 8162) y `EDGE_EVIDENCE_DIR` para adaptarse al entorno de pruebas.

Regresión del dashboard: `node tests/dashboard.browser.mjs`; contratos de voz
y sectores: `node tests/sectors.browser.mjs`; ficha y reproducción:
`node tests/case-file.browser.mjs`. Usan `EDGE_TEST_ORIGIN`, `EDGE_TEST_VIDEO`,
`PLAYWRIGHT_MODULE` y `EDGE_EVIDENCE_DIR` con API/video sintéticos interceptados;
no crean sesiones, revisiones ni datos en producción.
