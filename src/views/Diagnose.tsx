import { useEffect, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button, Card, Keycap, PageHeader, SafetyNote, SectionTitle } from "../components/ui";
import { api, type Check } from "../lib/ipc";
import type { T } from "../lib/i18n";
import { MODIFIERS, vkName } from "../lib/keys";
import { useKeyStream, useSwallowBrowserKeys } from "../lib/useKeyStream";

type Step = "idle" | "alone" | "held" | "done";

export default function Diagnose({ t }: { t: T }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [alone, setAlone] = useState<Set<number>>(new Set());
  const [withHold, setWithHold] = useState<Set<number>>(new Set());
  const [holding, setHolding] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const held = useRef<Set<number>>(new Set());

  useEffect(() => {
    api.systemChecks().then(setChecks);
  }, []);

  const fix = async (id: string) => {
    setBusy(id);
    try {
      setChecks(await api.applyFix(id));
    } finally {
      setBusy(null);
    }
  };

  useSwallowBrowserKeys(step === "alone" || step === "held");
  useKeyStream(
    (events) => {
      for (const e of events) {
        if (e.injected) continue;
        if (e.down) held.current.add(e.vk);
        else held.current.delete(e.vk);
        if (!e.down) continue;
        if (step === "alone" && held.current.size <= 1) {
          setAlone((prev) => new Set(prev).add(e.vk));
        }
        if (step === "held") {
          const others = [...held.current].filter((vk) => vk !== e.vk);
          setHolding(others.length > 0);
          if (others.length > 0) setWithHold((prev) => new Set(prev).add(e.vk));
        }
      }
    },
    step === "alone" || step === "held",
  );

  const rescued = [...withHold].filter((vk) => !alone.has(vk) && !MODIFIERS.has(vk));
  const verdict = step !== "done" ? null : rescued.length > 0 ? "hardware" : alone.size > 0 ? "ok" : "dead";

  const restart = () => {
    setAlone(new Set());
    setWithHold(new Set());
    held.current = new Set();
    setHolding(false);
    setStep("alone");
  };

  return (
    <>
      <PageHeader title={t("diagnose.title")} intro={t("diagnose.intro")} />

      <Card className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>{t("guide.title")}</SectionTitle>
          {step !== "idle" && (
            <Button variant="ghost" className="h-8 px-3" onClick={restart}>
              {t("guide.restart")}
            </Button>
          )}
        </div>

        {step === "idle" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm leading-relaxed text-text-muted">{t("guide.intro")}</p>
            <Button variant="primary" onClick={restart}>
              {t("guide.start")}
            </Button>
          </div>
        )}

        {(step === "alone" || step === "held") && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-medium">{t(step === "alone" ? "guide.step1" : "guide.step2")}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{t(step === "alone" ? "guide.step1Hint" : "guide.step2Hint")}</p>
              {step === "held" && (
                <p className={`mt-2 text-xs ${holding ? "text-success" : "text-warn"}`}>{t(holding ? "guide.holdOk" : "guide.holdMissing")}</p>
              )}
            </div>
            <KeyChips t={t} keys={step === "alone" ? alone : withHold} />
            <div>
              <Button variant="primary" onClick={() => setStep(step === "alone" ? "held" : "done")}>
                {t(step === "alone" ? "guide.next" : "guide.finish")}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && verdict && (
          <div className="flex flex-col gap-4">
            <SafetyNote level={verdict === "hardware" ? "warn" : verdict === "ok" ? "safe" : "danger"}>
              {t(`guide.verdict.${verdict}`)}
            </SafetyNote>
            {verdict === "hardware" && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-text-muted">{t("guide.rescued")}</span>
                  {rescued.map((vk) => (
                    <Keycap key={vk} tone="primary">
                      {vkName(vk)}
                    </Keycap>
                  ))}
                </div>
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-xs leading-relaxed text-text-muted">
                  {["rec1", "rec2", "rec3", "rec4"].map((k) => (
                    <li key={k}>{t(`guide.${k}`)}</li>
                  ))}
                </ol>
              </>
            )}
            {verdict === "dead" && <p className="text-xs leading-relaxed text-text-muted">{t("guide.deadHelp")}</p>}
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>{t("chk.title")}</SectionTitle>
          <Button variant="ghost" className="h-8 px-3" onClick={() => api.systemChecks().then(setChecks)}>
            {t("chk.refresh")}
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-border/30">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${
                  check.level === "ok" ? "bg-success/15 text-success" : check.level === "warn" ? "bg-warn/15 text-warn" : "bg-primary/15 text-primary"
                }`}
              >
                {check.level === "ok" ? "✓" : check.level === "warn" ? "!" : "i"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t(`chk.${check.id}`)}</p>
                <p className="text-xs leading-relaxed text-text-muted">
                  {t(`chk.${check.id}.${check.level === "ok" ? "ok" : "warn"}`)}
                  {check.value && <span className="ml-1 font-mono text-[11px] break-all">{check.value}</span>}
                </p>
              </div>
              {check.fix && (
                <Button className="h-8 shrink-0 px-3" disabled={busy === check.fix} onClick={() => fix(check.fix!)}>
                  {busy === check.fix ? t("air.working") : t("chk.fix")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>{t("diag.title")}</SectionTitle>
        <p className="mb-3 text-xs leading-relaxed text-text-muted">{t("diag.body")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => api.exportDiagnostics().then(setExported)}>{t("diag.export")}</Button>
          {exported && (
            <Button variant="ghost" onClick={() => revealItemInDir(exported)}>
              {t("diag.show")}
            </Button>
          )}
        </div>
        {exported && <p className="mt-2 font-mono text-[11px] break-all text-success select-text">{exported}</p>}
      </Card>
    </>
  );
}

function KeyChips({ t, keys }: { t: T; keys: Set<number> }) {
  const list = [...keys];
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-2">
      {list.length === 0 ? (
        <span className="text-xs text-text-muted">{t("guide.waiting")}</span>
      ) : (
        list.map((vk) => <Keycap key={vk}>{vkName(vk)}</Keycap>)
      )}
    </div>
  );
}
