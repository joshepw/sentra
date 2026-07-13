"use client";

import { useEffect, useState } from "react";
import { SentraLogoMark, SentraWordmark } from "@/components/sentra/ui";

/**
 * Compuerta que valida la contraseña CONTRA EL BACKEND (server-side). El string de la
 * contraseña NUNCA está en este código — se manda lo tecleado a `verifyPath` y el backend
 * responde 200/403. Así no hay password "pelada" en el repo público.
 */
export function ServerGate({
  api, verifyPath, label, storageKey, children,
}: {
  api: string; verifyPath: string; label: string; storageKey: string;
  children: (token: string) => React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = async (pw: string, remember: boolean) => {
    setBusy(true); setBad(false);
    try {
      const r = await fetch(`${api}${verifyPath}?k=${encodeURIComponent(pw)}&_=${Date.now()}`);
      if (r.ok) { if (remember) localStorage.setItem(storageKey, pw); setToken(pw); }
      else { setBad(true); if (remember === false) setVal(""); }
    } catch { setBad(true); }
    setBusy(false);
  };

  useEffect(() => {
    const s = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (s) void check(s, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (token) return <>{children(token)}</>;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-bg px-4 text-text">
      <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) void check(val.trim(), true); }}
        className="w-full max-w-[380px] rounded-2xl border border-[var(--border-strong)] bg-bg-panel p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <SentraLogoMark size={28} /><SentraWordmark />
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-warning">{label}</span>
        </div>
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">Contraseña</label>
        <input type="password" autoFocus value={val}
          onChange={(e) => { setVal(e.target.value); setBad(false); }}
          className={`w-full rounded-lg border bg-bg-input px-3.5 py-2.5 font-mono text-sm text-text outline-none transition-colors ${bad ? "border-danger" : "border-[var(--border)] focus:border-accent"}`}
          placeholder="••••••••••" />
        {bad && <p className="mt-2 font-mono text-[11px] text-danger">Contraseña incorrecta.</p>}
        <button type="submit" disabled={busy}
          className="mt-5 w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 font-display text-sm font-bold text-[#062017] transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
