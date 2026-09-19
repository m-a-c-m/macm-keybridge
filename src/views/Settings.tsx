import { useState, type KeyboardEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Card, PageHeader, SectionTitle, Toggle } from "../components/ui";
import AirplaneKey from "../components/AirplaneKey";
import AutostartPicker from "../components/AutostartPicker";
import { api, type Config, type Status } from "../lib/ipc";
import type { T } from "../lib/i18n";

interface Props {
  t: T;
  config: Config;
  status: Status;
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

export default function Settings({ t, config, status, save, version }: Props) {
  const [recording, setRecording] = useState(false);
  const [undoState, setUndoState] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");
  const [undoError, setUndoError] = useState<string | null>(null);

  const undo = async () => {
    setUndoState("busy");
    try {
      await api.undoAll();
      setUndoState("done");
    } catch (e) {
      setUndoError(String(e));
      setUndoState("error");
    }
  };

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
        <div className="flex items-center justify-between gap-6 py-2">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm">{t("settings.wizard")}</span>
            <span className="text-xs text-text-muted">{t("settings.wizardHint")}</span>
          </span>
          <Button className="h-8 shrink-0 px-3" onClick={() => save({ ...config, onboarded: false })}>
            {t("settings.wizardOpen")}
          </Button>
        </div>
      </Card>

      <Card className="mb-4">
        <SectionTitle>{t("settings.startup")}</SectionTitle>
        {status.autostartStale && <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{t("settings.autoStale")}</p>}
        <AutostartPicker t={t} />
        <div className="mt-2">
          <Toggle checked={config.startMinimized} onChange={(startMinimized) => save({ ...config, startMinimized })} label={t("settings.startMinimized")} />
        </div>
      </Card>

      <Card className="mb-4">
        <SectionTitle>{t("air.title")}</SectionTitle>
        <p className="mb-3 text-xs leading-relaxed text-text-muted">{t("wiz.airBody")}</p>
        <AirplaneKey t={t} />
      </Card>

      <Card className="mb-4">
        <SectionTitle>{t("settings.hotkey")}</SectionTitle>
        <div className="flex items-start justify-between gap-6 py-1">
          <span className="text-xs leading-relaxed text-text-muted">{t("settings.hotkeyHint")}</span>
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

      <Card className="mb-4">
        <SectionTitle>{t("undo.title")}</SectionTitle>
        <p className="mb-3 text-xs leading-relaxed text-text-muted">{t("undo.body")}</p>
        {undoState === "confirm" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{t("undo.confirm")}</span>
            <Button variant="danger" onClick={undo}>
              {t("undo.yes")}
            </Button>
            <Button variant="ghost" onClick={() => setUndoState("idle")}>
              {t("keys.cancel")}
            </Button>
          </div>
        ) : (
          <Button variant="danger" disabled={undoState === "busy"} onClick={() => setUndoState("confirm")}>
            {undoState === "busy" ? t("air.working") : t("undo.button")}
          </Button>
        )}
        {undoState === "done" && <p className="mt-2 text-xs text-success">{t("undo.done")}</p>}
        {undoState === "error" && <p className="mt-2 text-xs text-danger">{undoError}</p>}
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
