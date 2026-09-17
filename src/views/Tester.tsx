import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button, Card, PageHeader, SectionTitle } from "../components/ui";
import { api, type KeyObserved } from "../lib/ipc";
import type { T } from "../lib/i18n";
import { hex, KEYBOARD, vkName } from "../lib/keys";

const LOG_SIZE = 60;
const UNIT = 44;

const SIDE_ALIASES: Record<number, number> = { 0x10: 0xa0, 0x11: 0xa2, 0x12: 0xa4 };

export default function Tester({ t }: { t: T }) {
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [blockedSeen, setBlockedSeen] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<KeyObserved[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.setInspect(true);
    const unlisten = listen<KeyObserved>("key", ({ payload }) => {
      const vk = SIDE_ALIASES[payload.vk] ?? payload.vk;
      setPressed((prev) => {
        const next = new Set(prev);
        if (payload.down) next.add(vk);
        else next.delete(vk);
        return next;
      });
      if (payload.down && !payload.injected) {
        setSeen((prev) => (prev.has(vk) ? prev : new Set(prev).add(vk)));
        if (payload.blocked) setBlockedSeen((prev) => (prev.has(vk) ? prev : new Set(prev).add(vk)));
      }
      setLog((prev) => {
        const last = prev[0];
        if (last && last.vk === payload.vk && last.down && payload.down) return prev;
        return [payload, ...prev].slice(0, LOG_SIZE);
      });
    });
    return () => {
      unlisten.then((u) => u());
      api.setInspect(false);
    };
  }, []);

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

  return (
    <>
      <PageHeader title={t("tester.title")} intro={t("tester.intro")} />

      <Card className="mb-5 overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t("tester.seen", { n: seen.size })}</span>
          <Button variant="ghost" className="h-8 px-3" onClick={reset}>
            {t("tester.reset")}
          </Button>
        </div>
        <div className="flex min-w-max flex-col gap-1.5">
          {KEYBOARD.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((key, j) => {
                if (key.vk === 0) return <div key={j} style={{ width: (key.w ?? 1) * UNIT }} />;
                const isDown = pressed.has(key.vk);
                const blocked = blockedSeen.has(key.vk);
                const tone = isDown
                  ? blocked
                    ? "border-danger bg-danger/25 text-danger"
                    : "border-primary bg-primary/30 text-primary glow"
                  : blocked
                    ? "border-danger/50 bg-danger/10 text-danger"
                    : seen.has(key.vk)
                      ? "border-primary/40 bg-primary/10 text-text"
                      : "border-border/50 bg-surface-2/60 text-text-muted/60";
                return (
                  <div
                    key={j}
                    title={`${vkName(key.vk)} ${hex(key.vk)}`}
                    style={{ width: (key.w ?? 1) * UNIT + ((key.w ?? 1) - 1) * 6 }}
                    className={`grid h-11 place-items-center rounded-lg border-b-2 text-[11px] font-medium transition-colors duration-75 ${tone}`}
                  >
                    {key.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-muted">{t("tester.fn")}</p>
      </Card>

      <Card>
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
    </>
  );
}
