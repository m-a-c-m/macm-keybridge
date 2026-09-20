import { useState } from "react";
import { Button, Card, Keycap, SectionTitle } from "./ui";
import type { T, Lang } from "../lib/i18n";
import type { Safety } from "../lib/keys";
import { vkName } from "../lib/keys";
import { badge, fnVaries, type Fitness, type GuideKey, type Group, ranked, recommended, text } from "../lib/guide";

interface Props {
  t: T;
  lang: Lang;
  mode: "bridge" | "swap";
  onPick: (key: GuideKey) => void;
  pickLabel: string;
  disabled?: (key: GuideKey) => boolean;
}

const TONE: Record<Fitness, Safety> = { best: "safe", good: "info", careful: "warn", avoid: "danger" };

const CHIP: Record<Safety, string> = {
  safe: "border-success/40 bg-success/10 text-success",
  info: "border-primary/40 bg-primary/10 text-primary",
  warn: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

const GROUPS: Group[] = ["fnrow", "nav", "locks", "mods"];

const label = (vk: number) => (vk === 0x86 ? "Copilot" : vkName(vk));

export default function KeyGuide({ t, lang, mode, onPick, pickLabel, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const keys = ranked(mode);

  return (
    <Card className="mt-5">
      <SectionTitle>{t("manual.title")}</SectionTitle>
      <p className="text-sm leading-relaxed text-text-muted">{t(mode === "bridge" ? "manual.introBridge" : "manual.introSwap")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {recommended(mode).map((key) => (
          <Button key={`${key.vk}-${+key.ext}`} className="h-8 px-3" disabled={disabled?.(key)} onClick={() => onPick(key)}>
            {label(key.vk)}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        <Button variant="ghost" className="px-0" onClick={() => setOpen((o) => !o)}>
          {open ? t("manual.hide") : t("manual.show")}
        </Button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-5 border-t border-border/40 pt-4">
          <p className="text-xs leading-relaxed text-text-muted">{fnVaries(lang)}</p>
          {GROUPS.map((group) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-text-muted uppercase">{t(`manual.group.${group}`)}</h3>
              <div className="flex flex-col gap-2">
                {keys
                  .filter((key) => key.group === group)
                  .map((key) => (
                    <div key={`${key.vk}-${+key.ext}`} className="flex flex-wrap items-start gap-3 rounded-xl border border-border/40 px-3 py-2.5">
                      <Keycap>{label(key.vk)}</Keycap>
                      <span className={`rounded-lg border px-2 py-0.5 text-[11px] ${CHIP[TONE[key[mode]]]}`}>{badge(key[mode], lang)}</span>
                      <div className="min-w-48 flex-1 text-xs leading-relaxed">
                        <p className="text-text">{text(key.alone, lang)}</p>
                        {key.fn && (
                          <p className="mt-1 text-text-muted">
                            <span className="font-mono">Fn +</span> {text(key.fn, lang)}
                          </p>
                        )}
                        {key.note && <p className="mt-1 text-text-muted">{text(key.note, lang)}</p>}
                      </div>
                      {key[mode] !== "avoid" && (
                        <Button variant="ghost" className="h-8 px-2 text-xs" disabled={disabled?.(key)} onClick={() => onPick(key)}>
                          {pickLabel}
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
