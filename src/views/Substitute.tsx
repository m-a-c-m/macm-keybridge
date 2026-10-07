import { useEffect, useRef, useState } from "react";
import { Button, Card, Keycap, PageHeader, SafetyNote, SectionTitle } from "../components/ui";
import { api, type Config, type KeyObserved, type RemapStatus, type Substitution } from "../lib/ipc";
import type { Lang, T } from "../lib/i18n";
import KeyGuide from "../components/KeyGuide";
import type { GuideKey } from "../lib/guide";
import { hex, keySafety, KEYBOARD, vkName } from "../lib/keys";
import { useKeyStream, useSwallowBrowserKeys } from "../lib/useKeyStream";

interface Props {
  t: T;
  lang: Lang;
  config: Config;
  save: (c: Config) => Promise<boolean>;
}

const TARGETS = KEYBOARD.flat().filter((k) => k.vk >= 0x30 && k.vk <= 0x5a);

export default function Substitute({ t, lang, config, save }: Props) {
  const [status, setStatus] = useState<RemapStatus | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [source, setSource] = useState<KeyObserved | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api.remapStatus().then(setStatus);
    return () => window.clearTimeout(timer.current);
  }, []);

  useSwallowBrowserKeys(capturing);
  useKeyStream(
    (events) => {
      const first = events.find((e) => e.down && !e.injected);
      if (!first) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setCapturing(false);
        setSource(first);
      }, 250);
    },
    capturing,
  );

  const apply = async (subs: Substitution[]) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.remapApply(subs));
      await save({ ...config, substitutions: subs });
    } catch (e) {
      setError(String(e));
      setStatus(await api.remapStatus());
    } finally {
      setBusy(false);
    }
  };

  const addTarget = async (vk: number, label: string) => {
    if (!source) return;
    const toScan = await api.scanForVk(vk);
    if (!toScan) {
      setError(t("sub.noScan"));
      return;
    }
    const next: Substitution[] = [
      ...config.substitutions.filter((s) => !(s.fromScan === source.scan && s.fromExt === source.ext)),
      { fromScan: source.scan, fromExt: source.ext, toScan, toExt: false, label: `${vkName(source.vk)} → ${label}` },
    ];
    setSource(null);
    await apply(next);
  };

  const pickSource = async (key: GuideKey) => {
    const scan = await api.scanForVk(key.vk);
    if (!scan) {
      setError(t("manual.noScan"));
      return;
    }
    setError(null);
    setCapturing(false);
    setSource({ vk: key.vk, scan, ext: key.ext, down: true, injected: false, blocked: false, t: 0 });
  };

  const remove = (sub: Substitution) =>
    apply(config.substitutions.filter((s) => !(s.fromScan === sub.fromScan && s.fromExt === sub.fromExt)));

  const sourceSafety = source ? keySafety(source.vk, []) : null;

  return (
    <>
      <PageHeader title={t("sub.title")} intro={t("sub.intro")} />

      <Card className="mb-5">
        <SectionTitle>{t("sub.stateTitle")}</SectionTitle>
        {status?.pendingReboot ? (
          <SafetyNote level="warn">{t("sub.pending")}</SafetyNote>
        ) : status?.applied ? (
          <SafetyNote level="safe">{t("sub.active")}</SafetyNote>
        ) : (
          <p className="text-sm text-text-muted">{t("sub.inactive")}</p>
        )}
        {status?.foreign && (
          <div className="mt-2">
            <SafetyNote level="warn">{t("sub.foreign")}</SafetyNote>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </Card>

      <Card className="mb-5">
        <SectionTitle>{t("sub.addTitle")}</SectionTitle>
        {!source ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm leading-relaxed text-text-muted">{t("sub.step1")}</p>
            <Button
              variant={capturing ? "outline" : "primary"}
              className={capturing ? "pulse-ring border-primary text-primary" : ""}
              onClick={() => setCapturing((c) => !c)}
            >
              {capturing ? t("keys.capturing") : t("sub.capture")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-text-muted">{t("sub.sacrificed")}</span>
              <Keycap tone="primary">{vkName(source.vk)}</Keycap>
              <span className="font-mono text-xs text-text-muted">scan {hex(source.scan)}{source.ext ? " · ext" : ""}</span>
            </div>
            {sourceSafety && sourceSafety.level !== "safe" && <SafetyNote level={sourceSafety.level}>{t(sourceSafety.reason)}</SafetyNote>}
            <p className="text-sm text-text-muted">{t("sub.step2")}</p>
            <div className="flex flex-wrap gap-1.5">
              {TARGETS.map((key) => (
                <Button key={key.vk} className="h-8 w-10 px-0" disabled={busy} onClick={() => addTarget(key.vk, key.label)}>
                  {key.label}
                </Button>
              ))}
            </div>
            <div>
              <Button variant="ghost" onClick={() => setSource(null)}>
                {t("keys.cancel")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <KeyGuide t={t} lang={lang} mode="swap" onPick={pickSource} pickLabel={t("manual.sacrifice")} />

      <SectionTitle className="mt-5">{t("sub.listTitle")}</SectionTitle>
      {config.substitutions.length === 0 ? (
        <p className="text-sm text-text-muted">{t("sub.none")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {config.substitutions.map((sub) => (
            <Card key={`${sub.fromScan}-${+sub.fromExt}`} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm">{sub.label}</span>
              <Button variant="danger" className="h-8 px-3" disabled={busy} onClick={() => remove(sub)}>
                {t("keys.remove")}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-5">
        <SectionTitle>{t("sub.howTitle")}</SectionTitle>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed text-text-muted">
          <li>{t("sub.how1")}</li>
          <li>{t("sub.how2")}</li>
          <li>{t("sub.how3")}</li>
          <li>{t("sub.how4")}</li>
        </ul>
      </Card>
    </>
  );
}
