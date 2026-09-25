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

## Monitor simultáneo en /edge

`https://www.senttra.com/edge` muestra las once grabaciones de 90 segundos,
sincronizadas con las detecciones y clasificaciones del equipo local. Es una
reproducción de grabaciones; «Nueva prueba» ejecuta una inferencia compartida.
El acceso requiere Zitadel y el rol del grupo Senttra.

La página conserva el diseño original de Senttra: mapa del corredor con zoom y
selección de cámaras, paneles verdes, detección anotada, gráfico y galería con
recortes del video. Se puede alternar entre las once cámaras simultáneas y una
cámara seleccionada. La línea de tiempo corresponde a los 90 segundos reales;
las infracciones figuran como no evaluadas porque estos resultados no las incluyen.

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

### Zonas por cámara

En `/edge`, seleccionar una cámara y abrir **Editar zonas de esta cámara**. Dibujar exclusiones o inclusiones con varios puntos, cerrar el polígono y guardar. Se pueden arrastrar vértices, desactivar y eliminar zonas. El backend conserva versiones por revisión; ediciones simultáneas producen un conflicto explícito en vez de pisar cambios.

El visor filtra cajas, rastros, galería y conteos con el centro de la detección, incluyendo el borde del polígono. Las exclusiones prevalecen sobre las inclusiones, como en Crowne. Las actualizaciones de otros usuarios se consultan cada 10 s. Al iniciar una inferencia el servidor fija una copia del perfil y filtra después de NMS, antes del tracker. Quitar una exclusión del visor no recrea detecciones ausentes de resultados antiguos: hace falta **Nueva prueba de inferencia**.

El endpoint privado GET/POST `/edge/api/regions` usa la misma sesión Zitadel y CSRF/origen que el resto de escrituras. No usa almacenamiento local del navegador ni cambia los videos.

Pruebas adicionales:

```bash
node --test tests/edge-replay.test.mjs tests/edge-regions.test.mjs
# Con el backend de fixture y PLAYWRIGHT_MODULE/CHROMIUM_PATH configurados:
python3 /ruta/senttra-live/tests/edge_browser_fixture.py "$PWD" "$PWD/tests/edge-zones.browser.mjs"
```
