import Link from "next/link";
import { navLinks } from "@/lib/sentra-data";
import { SentraLogoMark, SentraWordmark } from "./ui";

export function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-100 flex items-center justify-between border-b border-[rgba(141,168,154,0.16)] bg-[rgba(8,20,17,0.82)] px-5 py-3.5 backdrop-blur-[12px] sm:px-8 lg:px-12 lg:py-[18px]">
      <Link href="#inicio" className="flex items-center gap-[7px] text-text">
        <SentraLogoMark />
        <SentraWordmark />
      </Link>

      <div className="hidden items-center gap-[22px] font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-text-muted xl:flex">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="transition-colors hover:text-text"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <Link
        href="#contacto"
        className="rounded-[9px] bg-accent px-3.5 py-2.5 text-xs font-semibold text-bg transition-transform hover:-translate-y-px sm:px-[22px] sm:py-[13px] sm:text-[13px]"
      >
        <span className="sm:hidden">Demo</span>
        <span className="hidden sm:inline">Agenda una demo</span>
      </Link>
    </nav>
  );
}
