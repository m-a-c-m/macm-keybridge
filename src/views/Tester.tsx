import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button, Card, PageHeader, SectionTitle } from "../components/ui";
import KeyboardMap from "../components/KeyboardMap";
import { api, type KeyObserved } from "../lib/ipc";
import type { T } from "../lib/i18n";
import { hex, vkName } from "../lib/keys";
import { useKeyStream, useSwallowBrowserKeys } from "../lib/useKeyStream";

const LOG_SIZE = 80;

export default function Tester({ t }: { t: T }) {
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [blockedSeen, setBlockedSeen] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<KeyObserved[]>([]);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useSwallowBrowserKeys();
  useKeyStream((events) => {
    setPressed((prev) => {
      const next = new Set(prev);
      for (const e of events) {
        if (e.down) next.add(e.vk);
        else next.delete(e.vk);
      }
      return next;
    });
    const real = events.filter((e) => e.down && !e.injected);
    if (real.length > 0) {
      setSeen((prev) => new Set([...prev, ...real.map((e) => e.vk)]));
      const blocked = real.filter((e) => e.blocked);
      if (blocked.length > 0) setBlockedSeen((prev) => new Set([...prev, ...blocked.map((e) => e.vk)]));
    }
    setLog((prev) => {
      const next = [...prev];
      for (const e of events) {
        const last = next[0];
        if (last && last.vk === e.vk && last.down && e.down) continue;
        next.unshift(e);
      }
      return next.slice(0, LOG_SIZE);
    });
  });

  const reset = () => {
    setSeen(new Set());
    setBlockedSeen(new Set());
    setPressed(new Set());
    setLog([]);
  };

  const copy = async () => {
    const text = [...log]
      .reverse()
      .map((e) => `${e.t}ms ${e.down ? "DOWN" : "UP  "} vk=${hex(e.vk)} ${vkName(e.vk)} scan=${hex(e.scan)} ext=${+e.ext} inj=${+e.injected} blocked=${+e.blocked}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const exportReport = async () => {
    setExportError(null);
    try {
      setExported(await api.exportDiagnostics());
    } catch (e) {
      setExportError(String(e));
    }
  };

  return (
    <>
      <PageHeader title={t("tester.title")} intro={t("tester.intro")} />

      <Card className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t("tester.seen", { n: seen.size })}</span>
          <Button variant="ghost" className="h-8 px-3" onClick={reset}>
            {t("tester.reset")}
          </Button>
        </div>
        <KeyboardMap pressed={pressed} seen={seen} blocked={blockedSeen} />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-muted">
          <Legend className="border-primary/40 bg-primary/10" label={t("tester.legendWorks")} />
          <Legend className="border-danger/50 bg-danger/10" label={t("tester.legendBlocked")} />
          <Legend className="border-border/50 bg-surface-2/60" label={t("tester.legendUnseen")} />
        </div>
        <p className="mt-2 text-xs text-text-muted">{t("tester.fn")}</p>
      </Card>

      <Card className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>{t("tester.log")}</SectionTitle>
          <Button variant="ghost" className="h-8 px-3" disabled={log.length === 0} onClick={copy}>
            {copied ? t("tester.copied") : t("tester.copy")}
          </Button>
        </div>
        <div className="h-56 overflow-y-auto rounded-xl bg-background/60 p-3 font-mono text-xs select-text">
          {log.length === 0 ? (
            <p className="text-text-muted">{t("tester.empty")}</p>
          ) : (
            log.map((e, i) => (
              <div key={`${e.t}-${i}`} className="flex gap-3 py-0.5">
                <span className="w-16 text-right text-text-muted tabular-nums">{e.t}</span>
                <span className={`w-10 ${e.down ? "text-primary" : "text-text-muted"}`}>{e.down ? "DOWN" : "UP"}</span>
                <span className="w-28 truncate text-text">{vkName(e.vk)}</span>
                <span className="text-text-muted">
                  vk {hex(e.vk)} · scan {hex(e.scan)}
                  {e.ext ? " · ext" : ""}
                </span>
                {e.blocked && <span className="text-danger">{t("tester.blocked")}</span>}
                {e.injected && <span className="text-warn">{t("tester.injected")}</span>}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("diag.title")}</SectionTitle>
        <p className="mb-3 text-xs leading-relaxed text-text-muted">{t("diag.body")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={exportReport}>{t("diag.export")}</Button>
          {exported && (
            <Button variant="ghost" onClick={() => revealItemInDir(exported)}>
              {t("diag.show")}
            </Button>
          )}
        </div>
        {exported && <p className="mt-2 font-mono text-[11px] break-all text-success select-text">{exported}</p>}
        {exportError && <p className="mt-2 text-xs text-danger">{exportError}</p>}
      </Card>
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-4 rounded border-b-2 ${className}`} />
      {label}
    </span>
  );
}
