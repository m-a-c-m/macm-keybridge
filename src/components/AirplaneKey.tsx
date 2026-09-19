import { useEffect, useState } from "react";
import { Button, SafetyNote } from "./ui";
import { api, type RadioStatus } from "../lib/ipc";
import type { T } from "../lib/i18n";

export default function AirplaneKey({ t }: { t: T }) {
  const [radio, setRadio] = useState<RadioStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.radioStatus().then(setRadio);
  }, []);

  const change = async (blocked: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setRadio(await api.radioSetBlocked(blocked));
    } catch (e) {
      setError(`${t("air.error")} (${String(e)})`);
      setRadio(await api.radioStatus());
    } finally {
      setBusy(false);
    }
  };

  if (!radio) return <p className="text-sm text-text-muted">…</p>;

  if (radio.devices.length === 0) {
    return <SafetyNote level="info">{t("air.none")}</SafetyNote>;
  }

  const active = radio.blocked && !radio.reenabled;

  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-2xl border p-4 ${active ? "border-success/40 bg-success/5" : "border-border/50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{active ? t("air.on") : t("air.off")}</p>
            <p className="text-xs text-text-muted">{active ? t("air.onHint") : t("air.offHint")}</p>
          </div>
          {active ? (
            <Button disabled={busy} onClick={() => change(false)}>
              {busy ? t("air.working") : t("air.restore")}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => change(true)}>
              {busy ? t("air.working") : radio.reenabled ? t("air.reapply") : t("air.block")}
            </Button>
          )}
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {radio.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-[11px] text-text-muted">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.enabled ? "bg-warn" : "bg-success"}`} />
              <span className="truncate">{d.name}</span>
              <span className="shrink-0">· {d.enabled ? t("air.devOn") : t("air.devOff")}</span>
            </li>
          ))}
        </ul>
      </div>
      {radio.reenabled && <SafetyNote level="warn">{t("air.reenabled")}</SafetyNote>}
      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer select-none hover:text-text">{t("air.whatTitle")}</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 leading-relaxed">
          <li>{t("air.what1")}</li>
          <li>{t("air.what2")}</li>
          <li>{t("air.what3")}</li>
          <li>{t("air.what4")}</li>
        </ul>
      </details>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
