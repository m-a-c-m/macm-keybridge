import AirplaneKey from "../components/AirplaneKey";
import { Card, Keycap, PageHeader, SectionTitle } from "../components/ui";
import type { T } from "../lib/i18n";

export default function Airplane({ t }: { t: T }) {
  return (
    <>
      <PageHeader title={t("airv.title")} intro={t("airv.intro")} />

      <Card className="mb-5">
        <AirplaneKey t={t} />
      </Card>

      <Card>
        <SectionTitle>{t("airv.whyTitle")}</SectionTitle>
        <p className="mb-4 text-sm leading-relaxed text-text-muted">{t("airv.whyBody")}</p>
        <div className="flex flex-col gap-2">
          <Path keys={["F8"]} arrow={t("airv.pathKey")} result={t("airv.pathKeyResult")} />
          <Path keys={["Fn", "F8"]} arrow={t("airv.pathRadio")} result={t("airv.pathRadioResult")} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-text-muted">{t("airv.whyEnd")}</p>
      </Card>
    </>
  );
}

function Path({ keys, arrow, result }: { keys: string[]; arrow: string; result: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 px-3 py-2.5 text-xs">
      <span className="flex w-24 items-center gap-1">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted">+</span>}
            <Keycap>{k}</Keycap>
          </span>
        ))}
      </span>
      <span className="text-text-muted">→ {arrow} →</span>
      <span className="text-text">{result}</span>
    </div>
  );
}
