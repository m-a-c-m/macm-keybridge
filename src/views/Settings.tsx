import { useEffect, useState, type KeyboardEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Card, PageHeader, SectionTitle, Toggle } from "../components/ui";
import { api, type AutostartMode, type Config } from "../lib/ipc";
import type { T } from "../lib/i18n";

interface Props {
  t: T;
  config: Config;
  save: (c: Config) => Promise<boolean>;
  version: string;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);

function accelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  if (mods.length === 0) return null;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code;
  else if (["Space", "Pause", "ScrollLock", "Insert", "Home", "End", "PageUp", "PageDown"].includes(e.code)) key = e.code;
  return key ? [...mods, key].join("+") : null;
}

function Select<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`h-8 cursor-pointer rounded-lg px-3 text-xs transition ${value === v ? "bg-primary text-on-primary" : "text-text-muted hover:text-text"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Settings({ t, config, save, version }: Props) {
  const [autostart, setAutostart] = useState<AutostartMode | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    api.getAutostart().then(setAutostart);
  }, []);

  const changeAutostart = async (mode: AutostartMode) => {
    setAutoBusy(true);
    setAutoError(null);
    try {
      setAutostart(await api.setAutostart(mode));
    } catch (e) {
      setAutoError(`${t("settings.autoError")}: ${String(e)}`);
      setAutostart(await api.getAutostart());
    } finally {
      setAutoBusy(false);
    }
  };

  const autoOptions: [AutostartMode, string, string][] = [
    ["off", t("settings.autoOff"), t("settings.autoOffHint")],
    ["user", t("settings.autoUser"), t("settings.autoUserHint")],
    ["admin", t("settings.autoAdmin"), t("settings.autoAdminHint")],
  ];

  return (
    <>
      <PageHeader title={t("settings.title")} />

      <Card className="mb-4">
        <SectionTitle>{t("settings.general")}</SectionTitle>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">{t("settings.language")}</span>
          <Select value={config.language} options={[["es", "Español"], ["en", "English"]]} onChange={(language) => save({ ...config, language })} />
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">{t("settings.theme")}</span>
          <Select
            value={config.theme}
            options={[["dark", t("settings.dark")], ["light", t("settings.light")], ["system", t("settings.system")]]}
            onChange={(theme) => save({ ...config, theme })}
          />
        </div>
        <Toggle checked={config.notifications} onChange={(notifications) => save({ ...config, notifications })} label={t("settings.notifications")} />
      </Card>

      <Card className="mb-4">
        <SectionTitle>{t("settings.startup")}</SectionTitle>
        <div role="radiogroup" className="flex flex-col gap-2">
          {autoOptions.map(([mode, label, hint]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={autostart === mode}
              disabled={autoBusy || autostart === null}
              onClick={() => autostart !== mode && changeAutostart(mode)}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-wait ${
                autostart === mode ? "border-primary/60 bg-primary/10" : "border-border/50 hover:border-border"
              }`}
            >
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${autostart === mode ? "border-primary" : "border-border"}`}>
                {autostart === mode && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-sm">{label}</span>
                <span className="block text-xs text-text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {autoError && <p className="mt-2 text-xs text-danger">{autoError}</p>}
        <div className="mt-2">
          <Toggle checked={config.startMinimized} onChange={(startMinimized) => save({ ...config, startMinimized })} label={t("settings.startMinimized")} />
        </div>
      </Card>

      <Card className="mb-4">
        <SectionTitle>{t("settings.protection")}</SectionTitle>
        <Toggle checked={config.radioGuard} onChange={(radioGuard) => save({ ...config, radioGuard })} label={t("settings.radioGuard")} hint={t("settings.radioGuardHint")} />
        <div className="flex items-start justify-between gap-6 py-2">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">{t("settings.hotkey")}</span>
            <span className="text-xs text-text-muted">{t("settings.hotkeyHint")}</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setRecording(true)}
              onBlur={() => setRecording(false)}
              onKeyDown={(e) => {
                if (!recording) return;
                e.preventDefault();
                if (e.key === "Escape") return setRecording(false);
                const acc = accelerator(e);
                if (acc) {
                  setRecording(false);
                  save({ ...config, pauseHotkey: acc });
                }
              }}
              className={`h-9 min-w-40 cursor-pointer rounded-xl border px-3 font-mono text-xs transition ${
                recording ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:border-primary/60"
              }`}
            >
              {recording ? t("settings.hotkeyPress") : (config.pauseHotkey ?? t("settings.hotkeyNone"))}
            </button>
            {config.pauseHotkey && (
              <Button variant="ghost" className="h-9 px-3" onClick={() => save({ ...config, pauseHotkey: null })}>
                {t("settings.hotkeyClear")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t("settings.about")}</SectionTitle>
        <div className="flex items-center gap-4">
          <img src="/logo.svg" alt="" className="h-14 w-14" />
          <div>
            <p className="font-display text-lg font-semibold">
              MACM <span className="gradient-text">KeyBridge</span> <span className="text-sm text-text-muted">v{version}</span>
            </p>
            <p className="text-xs text-text-muted">{t("settings.aboutBody")}</p>
            <p className="mt-1 text-xs text-text-muted">{t("settings.by")}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="h-8 px-3" onClick={() => openUrl("https://miguelacm.es")}>
            miguelacm.es
          </Button>
          <Button className="h-8 px-3" onClick={() => openUrl("https://github.com/m-a-c-m/macm-keybridge")}>
            GitHub
          </Button>
        </div>
      </Card>
    </>
  );
}
