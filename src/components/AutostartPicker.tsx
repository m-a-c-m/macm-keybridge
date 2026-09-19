import { useEffect, useState } from "react";
import { api, type AutostartMode } from "../lib/ipc";
import type { T } from "../lib/i18n";

export default function AutostartPicker({ t }: { t: T }) {
  const [mode, setMode] = useState<AutostartMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAutostart().then(setMode);
  }, []);

  const change = async (next: AutostartMode) => {
    setBusy(true);
    setError(null);
    try {
      setMode(await api.setAutostart(next));
    } catch (e) {
      setError(`${t("settings.autoError")} (${String(e)})`);
      setMode(await api.getAutostart());
    } finally {
      setBusy(false);
    }
  };

  const options: [AutostartMode, string, string][] = [
    ["admin", t("settings.autoAdmin"), t("settings.autoAdminHint")],
    ["user", t("settings.autoUser"), t("settings.autoUserHint")],
    ["off", t("settings.autoOff"), t("settings.autoOffHint")],
  ];

  return (
    <div>
      <div role="radiogroup" className="flex flex-col gap-2">
        {options.map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={busy || mode === null}
            onClick={() => mode !== value && change(value)}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-wait ${
              mode === value ? "border-primary/60 bg-primary/10" : "border-border/50 hover:border-border"
            }`}
          >
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${mode === value ? "border-primary" : "border-border"}`}>
              {mode === value && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </span>
            <span>
              <span className="block text-sm">{label}</span>
              <span className="block text-xs text-text-muted">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
