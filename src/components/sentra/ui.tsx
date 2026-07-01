import Link from "next/link";

export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-[22px] flex items-center gap-[11px] font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent ${className}`}
    >
      <span className="block size-2.5 bg-accent" />
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`font-display text-[2rem] font-bold leading-none tracking-[-0.02em] sm:text-[2.75rem] lg:text-[60px] ${className}`}
    >
      {children}
    </h2>
  );
}

export function SectionIntro({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-base leading-normal text-text-muted sm:text-[19px] ${className}`}>
      {children}
    </p>
  );
}

export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </div>
  );
}

export function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-[11px] bg-accent px-5 py-3.5 text-sm font-semibold text-bg transition-transform hover:-translate-y-px sm:px-[30px] sm:py-[17px] sm:text-[15px] ${className}`}
    >
      {children}
    </Link>
  );
}

export function SecondaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-[11px] border border-[rgba(141,168,154,0.28)] px-5 py-3.5 text-sm font-semibold text-text transition-colors hover:border-accent sm:px-[30px] sm:py-[17px] sm:text-[15px] ${className}`}
    >
      {children}
    </Link>
  );
}

export function SentraLogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <circle
        cx="28"
        cy="28"
        r="22"
        fill="none"
        stroke="#3dd68c"
        strokeWidth="2.4"
        className="origin-center animate-sn-ripout"
        style={{ transformBox: "fill-box" }}
      />
      <circle
        cx="28"
        cy="28"
        r="22"
        fill="none"
        stroke="#3dd68c"
        strokeOpacity="0.9"
        strokeWidth="2.6"
      />
      <circle cx="28" cy="28" r="9" fill="#3dd68c" />
    </svg>
  );
}

export function SentraWordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const textSize = size === "sm" ? "text-[18px]" : "text-[19px]";
  const dotSize = size === "sm" ? "text-[25px]" : "text-[26px]";

  return (
    <span className={`inline-flex items-baseline font-display font-bold tracking-[-0.01em] ${textSize}`}>
      Sentra
      <span className={`ml-px leading-none text-accent animate-sn-caret ${dotSize}`}>
        .
      </span>
    </span>
  );
}
