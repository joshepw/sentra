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

Next.js reenvía exclusivamente `/edge` y sus rutas al servicio existente
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
