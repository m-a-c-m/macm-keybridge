import { useEffect, useState, type ReactNode } from "react";
import type { View } from "../App";
import Goals, { GOAL_VIEW } from "../components/Goals";
import { Button, Card, Keycap, PageHeader, SectionTitle } from "../components/ui";
import { api, type AutostartMode, type Config, type RadioStatus, type RemapStatus, type Status } from "../lib/ipc";
import type { T } from "../lib/i18n";
import { vkName } from "../lib/keys";
import { isAirplaneKey } from "../lib/guide";

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
  const [radio, setRadio] = useState<RadioStatus | null>(null);
  const [remap, setRemap] = useState<RemapStatus | null>(null);
  const [autostart, setAutostart] = useState<AutostartMode | null>(null);

  useEffect(() => {
    api.radioStatus().then(setRadio).catch(() => {});
    api.remapStatus().then(setRemap).catch(() => {});
    api.getAutostart().then(setAutostart).catch(() => {});
  }, []);

  const state = !status.enabled ? "off" : status.paused ? "paused" : "on";
  const enabledRules = config.rules.filter((r) => r.enabled);
  const airBlocked = !!radio && radio.blocked && !radio.reenabled;
  const airRule = enabledRules.find((r) => isAirplaneKey(r.vk));
  const nothing = enabledRules.length === 0 && config.substitutions.length === 0 && !airBlocked;

  const ring = {
    on: "border-primary bg-primary/10 text-primary pulse-ring",
    paused: "border-warn bg-warn/10 text-warn",
    off: "border-border bg-surface-2 text-text-muted",
  }[state];

  return (
    <>
      <PageHeader title={t("dash.title")} intro={t("dash.intro")} />

      {nothing && (
        <Card className="mb-5">
          <SectionTitle>{t("dash.askTitle")}</SectionTitle>
          <Goals t={t} onPick={(g) => goTo(GOAL_VIEW[g])} />
        </Card>
      )}

      {enabledRules.length > 0 && (
        <Card className="mb-5 flex flex-col items-center gap-6 py-7 sm:flex-row sm:items-center sm:gap-10 sm:px-10">
          <button
            type="button"
            aria-pressed={status.enabled}
            onClick={() => api.setActive(!status.enabled).then(setStatus)}
            className={`grid h-32 w-32 shrink-0 cursor-pointer place-items-center rounded-full border-4 transition ${ring}`}
          >
            <span className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3v8M6.3 6.3a8 8 0 1011.4 0" />
              </svg>
              <span className="text-xs font-semibold tracking-wider uppercase">{status.enabled ? t("dash.toggleOff") : t("dash.toggleOn")}</span>
            </span>
          </button>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-display text-2xl font-semibold">{t(`dash.${state}`)}</h2>
            <p className="mt-1 text-sm text-text-muted">{t(`dash.${state}Hint`)}</p>
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
      )}

      {!nothing && (
        <Card className="mb-5">
          <SectionTitle>{t("act.title")}</SectionTitle>
          <div className="flex flex-col gap-2">
            {enabledRules.map((r) => (
              <Item key={r.id} tone={state === "on" ? "ok" : "warn"} onChange={() => goTo("keys")} t={t}>
                <Keycap tone="primary">{r.name || vkName(r.vk)}</Keycap>
                <span>{state === "on" ? t("act.rule") : t("act.rulePaused")}</span>
              </Item>
            ))}
            {airRule && radio && radio.devices.length > 0 && !airBlocked && (
              <Item tone="warn" onChange={() => goTo("airplane")} t={t}>
                <span>{t("act.airMissing", { key: airRule.name || vkName(airRule.vk) })}</span>
              </Item>
            )}
            {airBlocked && (
              <Item tone="ok" onChange={() => goTo("airplane")} t={t}>
                <span>{t("act.air")}</span>
              </Item>
            )}
            {config.substitutions.map((s) => (
              <Item key={`${s.fromScan}-${+s.fromExt}`} tone={remap?.pendingReboot ? "warn" : "ok"} onChange={() => goTo("substitute")} t={t}>
                <Keycap tone="primary">{s.label}</Keycap>
                <span>{remap?.pendingReboot ? t("act.subPending") : t("act.sub")}</span>
              </Item>
            ))}
            {enabledRules.length > 0 && autostart !== null && (
              <Item tone={autostart === "off" ? "warn" : "ok"} onChange={() => goTo("settings")} t={t}>
                <span>{autostart === "off" ? t("act.noAutostart") : t("act.autostart")}</span>
              </Item>
            )}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-text-muted">{t("act.foot")}</p>
        </Card>
      )}

      {!nothing && (
        <Card className="mb-5">
          <SectionTitle>{t("dash.moreTitle")}</SectionTitle>
          <Goals t={t} onPick={(g) => goTo(GOAL_VIEW[g])} />
        </Card>
      )}

      <details className="glass rounded-2xl p-5 text-sm">
        <summary className="cursor-pointer text-xs font-semibold tracking-wider text-text-muted uppercase select-none hover:text-text">
          {t("dash.tech")}
        </summary>
        <div className="mt-3">
          <Row label={t("dash.engine")} ok={status.hookOk} value={status.hookOk ? t("dash.engineOk") : t("dash.engineFail")} />
          <Row label={t("dash.keysSeen")} ok={status.eventsSeen > 0} value={status.eventsSeen > 0 ? status.eventsSeen.toLocaleString(config.language) : t("dash.keysSeenNone")} />
          <Row label={t("dash.blocked")} ok value={status.blockedCount.toLocaleString(config.language)} />
          <Row label={t("dash.admin")} ok={status.elevated} value={status.elevated ? t("dash.adminOk") : t("dash.adminNo")} />
          {status.airplane !== null && (
            <Row label={t("dash.airplane")} ok={!status.airplane} value={status.airplane ? t("dash.airplaneOn") : t("dash.airplaneOff")} />
          )}
          {!status.elevated && (
            <div className="mt-3 flex items-center justify-between gap-6 border-t border-border/40 pt-3">
              <p className="text-xs leading-relaxed text-text-muted">{t("dash.adminHint")}</p>
              <Button className="shrink-0" onClick={() => api.relaunchAdmin().catch(() => {})}>
                {t("dash.relaunchAdmin")}
              </Button>
            </div>
          )}
        </div>
      </details>
    </>
  );
}

function Item({ tone, children, onChange, t }: { tone: "ok" | "warn"; children: ReactNode; onChange: () => void; t: T }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone === "ok" ? "bg-success" : "bg-warn"}`} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">{children}</div>
      <Button variant="ghost" className="h-8 shrink-0 px-2 text-xs" onClick={onChange}>
        {t("act.change")}
      </Button>
    </div>
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
