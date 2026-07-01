import type { ReactNode, SVGProps } from "react";

type StrokeIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  children: ReactNode;
};

export function StrokeIcon({
  size = 24,
  children,
  className,
  stroke = "#3dd68c",
  ...props
}: StrokeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

const threatIcons: Record<string, ReactNode> = {
  "01": (
    <>
      <path d="M2 9c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
      <path d="M2 14c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
      <path d="M2 19c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
    </>
  ),
  "02": (
    <>
      <path d="M12 21V7" />
      <path d="M7 12l5-5 5 5" />
      <path d="M3 4c1.3 1.1 2.7 1.1 4 0s2.7-1.1 4 0 2.7 1.1 4 0 2.7-1.1 4 0" />
    </>
  ),
  "03": (
    <path d="M12 22c3.3 0 6-2.6 6-5.9 0-2-1-3.8-2.3-5.2-.3 1.1-1.1 2-2.2 2.3.6-2.3-.4-4.8-2.5-6.7-.3 1.8-1.2 2.8-2.6 4C8.6 8.4 7 10.6 7 13c0 3.6 2.2 9 5 9z" />
  ),
  "04": (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 7 0 5.5-4.8 7.5-8 7.5" />
      <path d="M2 21c0-3 1.9-6.2 5-7.5" />
    </>
  ),
  "05": (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V8l5-3v16" />
      <path d="M10 21V11l5 3v7" />
      <path d="M19 21v-9l-4-1" />
    </>
  ),
  "06": (
    <>
      <rect x="8" y="2" width="8" height="20" rx="3" />
      <circle cx="12" cy="7" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="12" cy="17" r="1.3" />
    </>
  ),
  "07": (
    <>
      <path d="M10.3 4 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  "08": (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  "09": (
    <>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.6 6.6C3.6 8.3 2 12 2 12s3 8 10 8a9 9 0 0 0 5.4-1.6" />
      <path d="m2 2 20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  "10": (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
};

const stepIcons: Record<string, ReactNode> = {
  "01": (
    <>
      <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  "02": (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  "03": <polyline points="2 12 6 12 9 4 15 20 18 12 22 12" />,
  "04": (
    <>
      <path d="M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
};

const captureIcons: Record<string, ReactNode> = {
  "Cámaras y sensores": (
    <>
      <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  "Estaciones ambientales": (
    <>
      <path d="M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  "Telemetría vial y de ríos": (
    <polyline points="2 12 6 12 9 4 15 20 18 12 22 12" />
  ),
  "Cámaras solares de fauna": (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 7 0 5.5-4.8 7.5-8 7.5" />
      <path d="M2 21c0-3 1.9-6.2 5-7.5" />
    </>
  ),
  "Sensores de nivel en vados": (
    <>
      <path d="M2 6c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
      <path d="M2 12c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
      <path d="M2 18c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
    </>
  ),
  "Radar y conteo vehicular": (
    <>
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 12l7-4" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
};

const wizTypeIcons: Record<string, ReactNode> = {
  Municipalidad: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-5h6v5" />
    </>
  ),
  "Entidad gubernamental": (
    <>
      <path d="M3 21h18" />
      <path d="M4 10h16" />
      <path d="M5 10 12 4l7 6" />
      <path d="M6 10v11" />
      <path d="M18 10v11" />
      <path d="M12 10v11" />
    </>
  ),
  "Empresa privada": (
    <>
      <path d="M3 8h18v12H3z" />
      <path d="M9 8V5h6v3" />
      <path d="M3 13h18" />
    </>
  ),
  "ONG / academia": (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
    </>
  ),
  Inversor: (
    <>
      <path d="M3 17l6-6 4 4 7-8" />
      <path d="M17 7h4v4" />
    </>
  ),
  Otro: (
    <>
      <rect x="4" y="5" width="6" height="6" />
      <rect x="14" y="5" width="6" height="6" />
      <rect x="4" y="15" width="6" height="6" />
      <rect x="14" y="15" width="6" height="6" />
    </>
  ),
};

const wizServiceIcons: Record<string, ReactNode> = {
  "Detección de accidentes": (
    <>
      <path d="M12 2 2 7v6c0 5 4 8 10 9 6-1 10-4 10-9V7z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  "Telemetría de tráfico": (
    <polyline points="M3 12h4l3 8 4-16 3 8h4" />
  ),
  Infracciones: (
    <>
      <rect x="4" y="4" width="16" height="13" />
      <path d="M4 20h16" />
      <path d="M9 9l6 4-6 4z" />
    </>
  ),
  "Alertas preventivas": (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  "Conteo de biodiversidad": (
    <path d="M12 22c3.3 0 6-2.6 6-5.9 0-2-1-3.8-2.3-5.2-.3 1.1-1.1 2-2.2 2.3.6-2.3-.4-4.8-2.5-6.7-.3 1.8-1.2 2.8-2.6 4C8.6 8.4 7 10.6 7 13c0 3.6 2.2 9 5 9z" />
  ),
  "Clima y predicción": (
    <>
      <path d="M12 3v2" />
      <path d="M12 19v2" />
      <path d="M5 12H3" />
      <path d="M21 12h-2" />
      <path d="M6 6 4.5 4.5" />
      <path d="M18 6l1.5-1.5" />
      <path d="M6 18l-1.5 1.5" />
      <path d="M18 18l1.5 1.5" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  "Alertas de inundación": (
    <>
      <path d="M2 15c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
      <path d="M2 20c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0 3.4 1.4 5 0 3.4-1.4 5 0" />
      <path d="M12 3v7" />
      <path d="M8.5 6.5 12 10l3.5-3.5" />
    </>
  ),
  "Historial & metadata": (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
};

export function ThreatIcon({ num }: { num: string }) {
  return <StrokeIcon size={26}>{threatIcons[num]}</StrokeIcon>;
}

export function StepIcon({ num }: { num: string }) {
  return <StrokeIcon size={30} className="mb-[18px]">{stepIcons[num]}</StrokeIcon>;
}

export function CaptureIcon({ label }: { label: string }) {
  return <StrokeIcon size={24}>{captureIcons[label]}</StrokeIcon>;
}

export function WizTypeIcon({
  type,
  active,
}: {
  type: string;
  active: boolean;
}) {
  return (
    <StrokeIcon size={22} stroke={active ? "#3dd68c" : "#90a89a"}>
      {wizTypeIcons[type] ?? wizTypeIcons.Otro}
    </StrokeIcon>
  );
}

export function WizServiceIcon({
  service,
  active,
}: {
  service: string;
  active: boolean;
}) {
  return (
    <StrokeIcon size={19} stroke={active ? "#3dd68c" : "#90a89a"}>
      {wizServiceIcons[service]}
    </StrokeIcon>
  );
}
