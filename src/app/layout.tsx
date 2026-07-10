import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteDescription =
  "Senttra convierte las cámaras y sensores de tu ciudad en datos inteligentes para prevenir accidentes, anticipar riesgos y decidir con evidencia.";

export const metadata: Metadata = {
  metadataBase: new URL("https://senttra.com"),
  title: {
    default: "Senttra — Smart City · Resiliencia y Monitoreo",
    template: "%s · Senttra",
  },
  description: siteDescription,
  applicationName: "Senttra",
  authors: [{ name: "Senttra", url: "https://senttra.com" }],
  creator: "Senttra",
  publisher: "Senttra",
  keywords: [
    "Senttra",
    "Smart City",
    "San Pedro Sula",
    "monitoreo",
    "resiliencia",
    "inteligencia artificial",
    "seguridad vial",
    "medio ambiente",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_HN",
    url: "https://senttra.com",
    siteName: "Senttra",
    title: "Senttra — Smart City · Resiliencia y Monitoreo",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Senttra — Smart City · Resiliencia y Monitoreo",
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#081411",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-HN"
      className={`${archivo.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-bg font-sans text-text">
        {children}
      </body>
    </html>
  );
}
