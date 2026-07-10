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
