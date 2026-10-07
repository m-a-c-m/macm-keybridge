import type { T } from "../lib/i18n";

export type Goal = "bridge" | "broken" | "annoying" | "airplane" | "unknown";

const GOALS: { id: Goal; icon: string }[] = [
  { id: "bridge", icon: "M4 14h6v6H4zM14 14h6v6h-6zM7 14v-3a5 5 0 0110 0v3" },
  { id: "broken", icon: "M4 7h9a4 4 0 010 8H8m0 0l3-3m-3 3l3 3M20 7l-3 3m3-3l-3-3" },
  { id: "annoying", icon: "M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8" },
  { id: "airplane", icon: "M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" },
  { id: "unknown", icon: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 3a9 9 0 100 18 9 9 0 000-18z" },
];

export default function Goals({ t, onPick }: { t: T; onPick: (goal: Goal) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {GOALS.map((goal) => (
        <button
          key={goal.id}
          type="button"
          onClick={() => onPick(goal.id)}
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border border-border/50 bg-surface-2/40 p-4 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
            goal.id === "bridge" ? "sm:col-span-2 border-primary/40" : ""
          }`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={goal.icon} />
            </svg>
          </span>
          <span>
            <span className="block text-sm font-medium text-text">{t(`goal.${goal.id}`)}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{t(`goal.${goal.id}Hint`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export const GOAL_VIEW = {
  bridge: "keys",
  broken: "substitute",
  annoying: "keys",
  airplane: "airplane",
  unknown: "diagnose",
} as const;
