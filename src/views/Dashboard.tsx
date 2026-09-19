import type { View } from "../App";
import { Button, Card, Keycap, PageHeader, SectionTitle } from "../components/ui";
import { api, type Config, type Status } from "../lib/ipc";
import type { T } from "../lib/i18n";
import { vkName } from "../lib/keys";

interface Props {
  t: T;
  config: Config;
  status: Status;
  setStatus: (s: Status) => void;
  goTo: (v: View) => void;
}

function formatRemaining(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Dashboard({ t, config, status, setStatus, goTo }: Props) {
  const state = !status.enabled ? "off" : status.paused ? "paused" : "on";
  const enabledRules = config.rules.filter((r) => r.enabled);

  const ring = {
    on: "border-primary bg-primary/10 text-primary pulse-ring",
    paused: "border-warn bg-warn/10 text-warn",
    off: "border-border bg-surface-2 text-text-muted",
  }[state];

  return (
    <>
      <PageHeader title={t("dash.title")} />

      {config.rules.length === 0 && (
        <Card className="mb-5 flex items-center justify-between gap-6 border-primary/40">
          <div>
            <h2 className="font-display text-lg font-semibold">{t("dash.emptyTitle")}</h2>
            <p className="text-sm text-text-muted">{t("dash.emptyBody")}</p>
          </div>
          <Button variant="primary" onClick={() => goTo("keys")}>
            {t("dash.emptyCta")}
          </Button>
        </Card>
      )}

      <Card className="mb-5 flex flex-col items-center gap-6 py-8 sm:flex-row sm:items-center sm:gap-10 sm:px-10">
        <button
          type="button"
          aria-pressed={status.enabled}
          onClick={() => api.setActive(!status.enabled).then(setStatus)}
          className={`grid h-36 w-36 shrink-0 cursor-pointer place-items-center rounded-full border-4 transition ${ring}`}
        >
          <span className="flex flex-col items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v8M6.3 6.3a8 8 0 1011.4 0" />
            </svg>
            <span className="text-xs font-semibold tracking-wider uppercase">{status.enabled ? t("dash.toggleOff") : t("dash.toggleOn")}</span>
          </span>
        </button>
        <div className="flex-1 text-center sm:text-left">
          <h2 className="font-display text-2xl font-semibold">{t(`dash.${state}`)}</h2>
          <p className="mt-1 text-sm text-text-muted">{t(`dash.${state}Hint`)}</p>
          {enabledRules.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {enabledRules.map((r) => (
                <Keycap key={r.id} tone={state === "on" ? "primary" : "default"}>
                  {r.name || vkName(r.vk)}
                </Keycap>
              ))}
            </div>
          )}
          {status.enabled && (
            <div className="mt-5">
              {status.paused ? (
                <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <Button variant="primary" onClick={() => api.resume().then(setStatus)}>
                    {t("dash.resume")}
                  </Button>
                  {status.pauseRemainingSecs !== null && (
                    <span className="text-sm text-warn tabular-nums">{t("dash.resumesIn", { t: formatRemaining(status.pauseRemainingSecs) })}</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="mr-1 text-xs text-text-muted">{t("dash.pauseFor")}</span>
                  {[1, 5, 15, 60].map((m) => (
                    <Button key={m} className="h-8 px-3" onClick={() => api.pauseFor(m).then(setStatus)}>
                      {m} min
                    </Button>
                  ))}
                  <Button className="h-8 px-3" onClick={() => api.pauseFor(0).then(setStatus)}>
                    {t("dash.untilResume")}
                  </Button>
                </div>
              )}
              {config.pauseHotkey && (
                <p className="mt-3 text-xs text-text-muted">
                  {t("dash.hotkey")}: <span className="font-mono text-text">{config.pauseHotkey}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <SectionTitle>{t("dash.blocked")}</SectionTitle>
          <p className="font-display text-3xl font-semibold tabular-nums gradient-text">{status.blockedCount.toLocaleString(config.language)}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t("dash.rules")}: {status.activeRules}
          </p>
        </Card>
        <Card>
          <SectionTitle>{t("dash.engine")}</SectionTitle>
          <Row label={t("dash.engine")} ok={status.hookOk} value={status.hookOk ? t("dash.engineOk") : t("dash.engineFail")} />
          <Row label={t("dash.keysSeen")} ok={status.eventsSeen > 0} value={status.eventsSeen > 0 ? status.eventsSeen.toLocaleString(config.language) : t("dash.keysSeenNone")} />
          <Row label={t("dash.admin")} ok={status.elevated} value={status.elevated ? t("dash.adminOk") : t("dash.adminNo")} />
          {status.airplane !== null && (
            <Row label={t("dash.airplane")} ok={!status.airplane} value={status.airplane ? t("dash.airplaneOn") : t("dash.airplaneOff")} />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle>{t("dash.howTitle")}</SectionTitle>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed text-text-muted">
          <li>{t("dash.how1")}</li>
          <li>{t("dash.how2")}</li>
          <li>{t("dash.how3")}</li>
          <li>{t("dash.how4")}</li>
        </ul>
      </Card>

      {!status.elevated && (
        <Card className="mt-4 flex items-center justify-between gap-6">
          <p className="text-xs leading-relaxed text-text-muted">{t("dash.adminHint")}</p>
          <Button className="shrink-0" onClick={() => api.relaunchAdmin().catch(() => {})}>
            {t("dash.relaunchAdmin")}
          </Button>
        </Card>
      )}
    </>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`flex items-center gap-2 ${ok ? "text-success" : "text-warn"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-warn"}`} />
        {value}
      </span>
    </div>
  );
}
