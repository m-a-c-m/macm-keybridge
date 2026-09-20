import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type Bootstrap, type Config, type Status } from "./lib/ipc";
import { translator } from "./lib/i18n";
import Dashboard from "./views/Dashboard";
import Keys from "./views/Keys";
import Tester from "./views/Tester";
import Settings from "./views/Settings";
import Onboarding from "./views/Onboarding";
import Diagnose from "./views/Diagnose";
import Substitute from "./views/Substitute";

export type View = "dashboard" | "keys" | "substitute" | "tester" | "diagnose" | "settings";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "nav.dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { id: "keys", label: "nav.keys", icon: "M4 14h6v6H4zM14 14h6v6h-6zM7 14v-3a5 5 0 0110 0v3" },
  { id: "substitute", label: "nav.substitute", icon: "M4 7h9a4 4 0 010 8H8m0 0l3-3m-3 3l3 3M20 7l-3 3m3-3l-3-3" },
  { id: "tester", label: "nav.tester", icon: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10" },
  { id: "diagnose", label: "nav.diagnose", icon: "M12 3a6 6 0 016 6c0 2.5-1.5 3.5-2 5H8c-.5-1.5-2-2.5-2-5a6 6 0 016-6zM9 19h6M10 22h4" },
  { id: "settings", label: "nav.settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 002.9-1.2V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

function applyTheme(theme: Config["theme"]) {
  const dark = theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bootstrap().then((b) => {
      setBoot(b);
      setConfig(b.config);
      setStatus(b.status);
      if (b.hotkeyError) setError(`Hotkey: ${b.hotkeyError}`);
    });
    const unlisten = listen<Status>("status", (e) => setStatus(e.payload));
    const timer = window.setInterval(() => api.status().then(setStatus).catch(() => {}), 1000);
    return () => {
      unlisten.then((u) => u());
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    applyTheme(config.theme);
    document.documentElement.lang = config.language;
  }, [config]);

  const t = useMemo(() => translator(config?.language ?? "es"), [config?.language]);

  const save = useCallback(async (next: Config) => {
    try {
      const saved = await api.saveConfig(next);
      setConfig(saved);
      setError(null);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  if (!boot || !config || !status) {
    return <div className="grid h-full place-items-center bg-background" />;
  }

  if (!config.onboarded) {
    return <Onboarding t={t} config={config} save={save} />;
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/40 bg-surface/60 p-4">
        <div className="mb-8 flex items-center gap-3 px-2">
          <img src="/logo.svg" alt="" className="h-10 w-10" />
          <div className="leading-tight">
            <div className="font-display text-base font-semibold">
              MACM <span className="gradient-text">KeyBridge</span>
            </div>
            <div className="text-[11px] text-text-muted">v{boot.version}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm transition ${
                view === item.id ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {t(item.label)}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-border/40 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${status.blocking ? "bg-success" : status.paused ? "bg-warn" : "bg-text-muted"}`} />
            <span className="text-text">{status.blocking ? t("dash.on") : status.paused ? t("dash.paused") : t("dash.off")}</span>
          </div>
          <p className="mt-1 text-text-muted">{t("tagline")}</p>
        </div>
      </aside>
      <main className="grid-bg flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">
          {error && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
              <span>{error}</span>
              <button type="button" className="cursor-pointer text-xs underline" onClick={() => setError(null)}>
                OK
              </button>
            </div>
          )}
          {view === "dashboard" && <Dashboard t={t} config={config} status={status} setStatus={setStatus} goTo={setView} />}
          {view === "keys" && <Keys t={t} config={config} save={save} />}
          {view === "tester" && <Tester t={t} />}
          {view === "diagnose" && <Diagnose t={t} />}
          {view === "substitute" && <Substitute t={t} config={config} save={save} />}
          {view === "settings" && <Settings t={t} config={config} status={status} save={save} version={boot.version} />}
        </div>
      </main>
    </div>
  );
}
