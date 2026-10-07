import { hex, KEYBOARD, vkName } from "../lib/keys";

const SIDE_ALIASES: Record<number, number> = { 0x10: 0xa0, 0x11: 0xa2, 0x12: 0xa4 };

interface Props {
  pressed: Set<number>;
  seen: Set<number>;
  blocked: Set<number>;
  compact?: boolean;
}

export default function KeyboardMap({ pressed, seen, blocked, compact = false }: Props) {
  const has = (set: Set<number>, vk: number) => set.has(vk) || Object.entries(SIDE_ALIASES).some(([a, b]) => b === vk && set.has(Number(a)));

  return (
    <div className="flex w-full flex-col gap-1">
      {KEYBOARD.map((row, i) => (
        <div key={i} className="flex w-full gap-1">
          {row.map((key, j) => {
            const grow = key.w ?? 1;
            if (key.vk === 0) return <div key={j} style={{ flex: `${grow} 1 0` }} />;
            const isDown = has(pressed, key.vk);
            const isBlocked = has(blocked, key.vk);
            const tone = isDown
              ? isBlocked
                ? "border-danger bg-danger/25 text-danger"
                : "border-primary bg-primary/30 text-primary glow"
              : isBlocked
                ? "border-danger/50 bg-danger/10 text-danger"
                : has(seen, key.vk)
                  ? "border-primary/40 bg-primary/10 text-text"
                  : "border-border/50 bg-surface-2/60 text-text-muted/60";
            return (
              <div
                key={j}
                title={`${vkName(key.vk)} ${hex(key.vk)}`}
                style={{ flex: `${grow} 1 0` }}
                className={`grid min-w-0 place-items-center overflow-hidden rounded-md border-b-2 font-medium whitespace-nowrap transition-colors duration-75 ${
                  compact ? "h-7 text-[9px]" : "h-10 text-[10px]"
                } ${tone}`}
              >
                {key.label}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
