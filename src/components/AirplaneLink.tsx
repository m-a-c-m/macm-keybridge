import AirplaneKey from "./AirplaneKey";
import { Card, SectionTitle } from "./ui";
import type { T } from "../lib/i18n";

export default function AirplaneLink({ t, keyName }: { t: T; keyName: string }) {
  return (
    <Card className="mb-5 border-warn/40">
      <SectionTitle>{t("link.title", { key: keyName })}</SectionTitle>
      <p className="mb-4 text-sm leading-relaxed text-text-muted">{t("link.body", { key: keyName })}</p>
      <AirplaneKey t={t} />
    </Card>
  );
}
