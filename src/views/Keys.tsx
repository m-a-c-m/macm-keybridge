import { useRef, useState } from "react";
import { Button, Card, Keycap, PageHeader, SafetyNote, SectionTitle } from "../components/ui";
import { api, type Config, type KeyObserved, type Rule } from "../lib/ipc";
import { useKeyStream, useSwallowBrowserKeys } from "../lib/useKeyStream";
import type { Lang, T } from "../lib/i18n";
import { hex, keySafety, MODIFIERS, newId, PRESETS, VK, vkName, type Preset } from "../lib/keys";
import KeyGuide from "../components/KeyGuide";
import type { GuideKey } from "../lib/guide";

interface Props {
  t: T;
  lang: Lang;
  config: Config;
  save: (c: Config) => Promise<boolean>;
}

const SETTLE_MS = 350;

export function fromCapture(downs: KeyObserved[]): Preset | null {
  const first = downs[0];
  if (!first) return null;
  const trigger = [...downs].reverse().find((d) => !MODIFIERS.has(d.vk)) ?? first;
  let companions = downs.filter((d) => MODIFIERS.has(d.vk) && d.vk !== trigger.vk).map((d) => d.vk);
  if (trigger.vk === VK.F23 && companions.length === 0) companions = [VK.LWIN, VK.LSHIFT];
  const name = [...companions.map(vkName), vkName(trigger.vk)].join(" + ");
  return { name: trigger.vk === VK.F23 ? "Copilot" : name, vk: trigger.vk, scan: trigger.scan, ext: trigger.ext, companions };
}

export default function Keys({ t, lang, config, save }: Props) {
  const [capturing, setCapturing] = useState(false);
  const [candidate, setCandidate] = useState<Preset | null>(null);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const downs = useRef<KeyObserved[]>([]);
  const settle = useRef<number | undefined>(undefined);

  const finish = () => {
    window.clearTimeout(settle.current);
    setCapturing(false);
    const found = fromCapture(downs.current);
    downs.current = [];
    setCandidate(found);
    setName(found?.name ?? "");
  };

  useSwallowBrowserKeys(capturing);
  useKeyStream((events) => {
    for (const e of events) {
      if (e.injected) continue;
      if (e.down) {
        if (downs.current.length === 0) settle.current = window.setTimeout(finish, SETTLE_MS);
        if (!downs.current.some((d) => d.vk === e.vk)) downs.current.push(e);
      } else if (downs.current.length > 0) {
        finish();
        return;
      }
    }
  }, capturing);

  const exists = (p: Preset) => config.rules.some((r) => r.vk === p.vk && r.ext === p.ext);

  const addRule = async (p: Preset, label: string) => {
    if (exists(p)) {
      setNotice(t("keys.duplicate"));
      return;
    }
    const rule: Rule = { ...p, name: label.trim() || p.name, id: newId(), enabled: true };
    if (await save({ ...config, rules: [...config.rules, rule] })) {
      setCandidate(null);
      setNotice(null);
    }
  };

  const updateRule = (id: string, patch: Partial<Rule>) =>
    save({ ...config, rules: config.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const removeRule = (id: string) => save({ ...config, rules: config.rules.filter((r) => r.id !== id) });

  const pickFromGuide = async (key: GuideKey) => {
    const scan = (await api.scanForVk(key.vk)) || PRESETS.find((p) => p.vk === key.vk)?.scan || 0;
    if (!scan) {
      setNotice(t("manual.noScan"));
      return;
    }
    const copilot = key.vk === VK.F23;
    const name = copilot ? "Copilot" : vkName(key.vk);
    setNotice(null);
    setCandidate({ name, vk: key.vk, scan, ext: key.ext, companions: copilot ? [VK.LWIN, VK.LSHIFT] : [] });
    setName(name);
  };

  const candidateSafety = candidate ? keySafety(candidate.vk, candidate.companions) : null;

  return (
    <>
      <PageHeader title={t("keys.title")} intro={t("keys.intro")} />

      <Card className="mb-5">
        {!candidate ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setCapturing((c) => !c);
              }}
              className={`grid h-24 w-24 cursor-pointer place-items-center rounded-2xl border-2 border-dashed transition ${
                capturing ? "pulse-ring border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:border-primary/60 hover:text-primary"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8" />
              </svg>
            </button>
            <div>
              <p className="font-medium">{capturing ? t("keys.capturing") : t("keys.capture")}</p>
              <p className="mt-1 text-xs text-text-muted">{capturing ? t("keys.captureHint") : ""}</p>
            </div>
            {capturing && (
              <Button variant="ghost" onClick={() => setCapturing(false)}>
                {t("keys.cancel")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <SectionTitle>{t("keys.detected")}</SectionTitle>
            <div className="flex flex-wrap items-center gap-2">
              {candidate.companions.map((c) => (
                <Keycap key={c}>{vkName(c)}</Keycap>
              ))}
              <Keycap tone="primary">{vkName(candidate.vk)}</Keycap>
              <span className="ml-2 font-mono text-xs text-text-muted">
                vk {hex(candidate.vk)} · scan {hex(candidate.scan)}
                {candidate.ext ? " · ext" : ""}
              </span>
            </div>
            {candidate.vk === VK.F23 && <SafetyNote level="info">{t("keys.copilotSuggested")}</SafetyNote>}
            {candidateSafety && <SafetyNote level={candidateSafety.level}>{t(candidateSafety.reason)}</SafetyNote>}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-text-muted">{t("keys.name")}</span>
              <input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className="h-9 rounded-xl border border-border/60 bg-background/60 px-3 text-sm focus:border-primary/70 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => addRule(candidate, name)}>
                {t("keys.add")}
              </Button>
              <Button variant="ghost" onClick={() => setCandidate(null)}>
                {t("keys.cancel")}
              </Button>
            </div>
          </div>
        )}
        {notice && <p className="mt-3 text-center text-sm text-warn">{notice}</p>}

      </Card>

      <KeyGuide
        t={t}
        lang={lang}
        mode="bridge"
        onPick={pickFromGuide}
        pickLabel={t("manual.use")}
        disabled={(key) => config.rules.some((r) => r.vk === key.vk && r.ext === key.ext)}
      />

      <SectionTitle className="mt-5">{t("keys.list")}</SectionTitle>
      {config.rules.length === 0 ? (
        <p className="text-sm text-text-muted">{t("keys.none")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {config.rules.map((rule) => {
            const safety = keySafety(rule.vk, rule.companions);
            return (
              <Card key={rule.id} className="p-4">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${rule.enabled ? "bg-primary" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${rule.enabled ? "translate-x-5" : ""}`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{rule.name || vkName(rule.vk)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {rule.companions.map((c) => (
                        <Keycap key={c}>{vkName(c)}</Keycap>
                      ))}
                      <Keycap tone={rule.enabled ? "primary" : "default"}>{vkName(rule.vk)}</Keycap>
                      <span className="ml-1 font-mono text-[11px] text-text-muted">
                        {hex(rule.vk)} / {hex(rule.scan)}
                      </span>
                    </div>
                  </div>
                  <Button variant="danger" className="h-8 px-3" onClick={() => removeRule(rule.id)}>
                    {t("keys.remove")}
                  </Button>
                </div>
                {safety.level !== "safe" && (
                  <div className="mt-3">
                    <SafetyNote level={safety.level}>{t(safety.reason)}</SafetyNote>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
