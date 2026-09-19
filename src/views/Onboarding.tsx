import { useEffect, useRef, useState } from "react";
import { Button, Keycap, SafetyNote } from "../components/ui";
import KeyboardMap from "../components/KeyboardMap";
import AirplaneKey from "../components/AirplaneKey";
import AutostartPicker from "../components/AutostartPicker";
import { fromCapture } from "./Keys";
import { type Config, type KeyObserved, type Rule } from "../lib/ipc";
import type { T } from "../lib/i18n";
import { keySafety, newId, PRESETS, vkName, type Preset } from "../lib/keys";
import { useKeyStream, useSwallowBrowserKeys } from "../lib/useKeyStream";

interface Props {
  t: T;
  config: Config;
  save: (c: Config) => Promise<boolean>;
}

const STEPS = ["welcome", "key", "test", "airplane", "startup"] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding({ t, config, save }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]!);
  const back = () => setStep(STEPS[Math.max(index - 1, 0)]!);
  const finish = () => save({ ...config, onboarded: true });
  const bridge = config.rules.find((r) => r.enabled);

  return (
    <div className="grid-bg fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background p-6">
      <div className="glass w-full max-w-2xl rounded-3xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-9 w-9" />
            <span className="font-display font-semibold">
              MACM <span className="gradient-text">KeyBridge</span>
            </span>
          </div>
          <div className="flex gap-1.5" aria-label={`${index + 1}/${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 w-8 rounded-full ${i <= index ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
        </div>

        {step === "welcome" && <Welcome t={t} />}
        {step === "key" && <PickKey t={t} config={config} save={save} bridge={bridge} />}
        {step === "test" && <TestBridge t={t} bridge={bridge} />}
        {step === "airplane" && (
          <div>
            <h2 className="font-display text-xl font-semibold">{t("wiz.airTitle")}</h2>
            <p className="mt-2 mb-4 text-sm leading-relaxed text-text-muted">{t("wiz.airBody")}</p>
            <AirplaneKey t={t} />
          </div>
        )}
        {step === "startup" && (
          <div>
            <h2 className="font-display text-xl font-semibold">{t("wiz.startTitle")}</h2>
            <p className="mt-2 mb-4 text-sm leading-relaxed text-text-muted">{t("wiz.startBody")}</p>
            <AutostartPicker t={t} />
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          {index > 0 ? (
            <Button variant="ghost" onClick={back}>
              {t("wiz.back")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={finish}>
              {t("wiz.skip")}
            </Button>
          )}
          {step === "startup" ? (
            <Button variant="primary" onClick={finish}>
              {t("wiz.finish")}
            </Button>
          ) : (
            <Button variant="primary" disabled={step === "key" && !bridge} onClick={next}>
              {step === "welcome" ? t("wiz.start") : t("wiz.next")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Welcome({ t }: { t: T }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">{t("wiz.welcomeTitle")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{t("wiz.welcomeBody")}</p>
      <ol className="mt-5 flex flex-col gap-3">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex gap-3 rounded-2xl border border-border/50 bg-surface-2/50 p-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{n}</span>
            <span className="text-sm leading-relaxed">{t(`wiz.how${n}`)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <SafetyNote level="warn">{t("wiz.physical")}</SafetyNote>
      </div>
    </div>
  );
}

function PickKey({ t, config, save, bridge }: Props & { bridge: Rule | undefined }) {
  const [capturing, setCapturing] = useState(false);
  const downs = useRef<KeyObserved[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const add = (p: Preset) => {
    const others = config.rules.filter((r) => !(r.vk === p.vk && r.ext === p.ext));
    save({ ...config, rules: [...others.map((r) => ({ ...r, enabled: false })), { ...p, id: newId(), enabled: true }] });
  };

  const done = () => {
    window.clearTimeout(timer.current);
    setCapturing(false);
    const found = fromCapture(downs.current);
    downs.current = [];
    if (found) add(found);
  };

  useSwallowBrowserKeys(capturing);
  useKeyStream((events) => {
    for (const e of events) {
      if (e.injected || !e.down) continue;
      if (downs.current.length === 0) timer.current = window.setTimeout(done, 350);
      if (!downs.current.some((d) => d.vk === e.vk)) downs.current.push(e);
    }
  }, capturing);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const safety = bridge ? keySafety(bridge.vk, bridge.companions) : null;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold">{t("wiz.keyTitle")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{t("wiz.keyBody")}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant={capturing ? "outline" : "primary"} className={capturing ? "pulse-ring border-primary text-primary" : ""} onClick={() => setCapturing((c) => !c)}>
          {capturing ? t("keys.capturing") : t("keys.capture")}
        </Button>
        <span className="text-xs text-text-muted">{t("keys.presets")}:</span>
        {PRESETS.slice(0, 4).map((p) => (
          <Button key={p.name} className="h-8 px-3" onClick={() => add(p)}>
            {p.name}
          </Button>
        ))}
      </div>
      {bridge && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-muted">{t("wiz.selected")}</span>
            {bridge.companions.map((c) => (
              <Keycap key={c}>{vkName(c)}</Keycap>
            ))}
            <Keycap tone="primary">{bridge.name || vkName(bridge.vk)}</Keycap>
          </div>
          {safety && safety.level !== "safe" && <SafetyNote level={safety.level}>{t(safety.reason)}</SafetyNote>}
        </div>
      )}
    </div>
  );
}

function TestBridge({ t, bridge }: { t: T; bridge: Rule | undefined }) {
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [blocked, setBlocked] = useState<Set<number>>(new Set());

  useSwallowBrowserKeys();
  useKeyStream((events) => {
    setPressed((prev) => {
      const nextSet = new Set(prev);
      for (const e of events) {
        if (e.down) nextSet.add(e.vk);
        else nextSet.delete(e.vk);
      }
      return nextSet;
    });
    const real = events.filter((e) => e.down && !e.injected);
    if (real.length) setSeen((prev) => new Set([...prev, ...real.filter((e) => !e.blocked).map((e) => e.vk)]));
    const b = real.filter((e) => e.blocked);
    if (b.length) setBlocked((prev) => new Set([...prev, ...b.map((e) => e.vk)]));
  });

  const bridgeSilenced = bridge ? blocked.has(bridge.vk) : false;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold">{t("wiz.testTitle")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{t("wiz.testBody", { key: bridge?.name ?? "" })}</p>
      <div className="mt-4">
        <KeyboardMap pressed={pressed} seen={seen} blocked={blocked} compact />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Check ok={bridgeSilenced} label={t("wiz.checkSilenced", { key: bridge?.name ?? "" })} />
        <Check ok={seen.size > 0} label={t("wiz.checkTyping", { n: seen.size })} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text-muted">{t("wiz.testHelp")}</p>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${ok ? "border-success/40 bg-success/10 text-success" : "border-border/50 text-text-muted"}`}>
      <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${ok ? "bg-success text-background" : "border border-border"}`}>{ok ? "✓" : ""}</span>
      {label}
    </div>
  );
}
