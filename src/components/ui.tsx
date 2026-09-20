import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Safety } from "../lib/keys";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-2xl p-5 ${className}`}>{children}</section>;
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`mb-3 text-xs font-semibold tracking-wider text-text-muted uppercase ${className}`}>{children}</h2>;
}

type Variant = "primary" | "ghost" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:brightness-110",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  outline: "border border-border/70 text-text hover:border-primary/60 hover:text-primary",
};

export function Button({ variant = "outline", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-6 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-text">{label}</span>
        {hint && <span className="text-xs leading-snug text-text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${checked ? "bg-primary" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}

const badge: Record<Safety, string> = {
  safe: "border-success/40 bg-success/10 text-success",
  info: "border-primary/40 bg-primary/10 text-primary",
  warn: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

export function SafetyNote({ level, children }: { level: Safety; children: ReactNode }) {
  return <p className={`rounded-xl border px-3 py-2 text-xs leading-snug ${badge[level]}`}>{children}</p>;
}

export function Keycap({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "primary" }) {
  return (
    <kbd
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg border-b-2 px-2 font-mono text-xs ${
        tone === "primary" ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-surface-2 text-text"
      }`}
    >
      {children}
    </kbd>
  );
}

export function PageHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
      {intro && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{intro}</p>}
    </header>
  );
}
