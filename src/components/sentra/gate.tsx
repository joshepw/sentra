"use client";

import { useEffect, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

/**
 * Compuerta de contraseña client-side. La contraseña ES el token que consume la API
 * (el backend la valida en cada request), así que sirve de gate visual y de credencial.
 * Persiste en localStorage para no re-pedir en cada carga.
 */
export function Gate({
  password, storageKey, label, children,
}: {
  password: string; storageKey: string; label: string;
  children: (token: string) => React.ReactNode;
}) {
  const [ok, setOk] = useState(false);
  const [val, setVal] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(storageKey) === password) setOk(true);
  }, [storageKey, password]);

  if (ok) return <>{children(password)}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (val.trim() === password) { localStorage.setItem(storageKey, password); setOk(true); }
    else { setBad(true); setVal(""); }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-bg px-4 text-text">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <SentraLogoMark size={28} />
          <SentraWordmark />
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-accent">{label}</span>
        </div>
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">Contraseña de acceso</label>
        <input
          type="password" autoFocus value={val}
          onChange={(e) => { setVal(e.target.value); setBad(false); }}
          className={`w-full rounded-lg border bg-bg-input px-3.5 py-2.5 font-mono text-sm text-text outline-none transition-colors ${bad ? "border-danger" : "border-[var(--border)] focus:border-accent"}`}
          placeholder="••••••••••"
        />
        {bad && <p className="mt-2 font-mono text-[11px] text-danger">Contraseña incorrecta.</p>}
        <button type="submit" className="mt-5 w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 font-display text-sm font-bold text-[#062017] transition-opacity hover:opacity-90">
          Entrar
        </button>
      </form>
    </div>
  );
}
