import type { Rule } from "./ipc";

export const VK = {
  LWIN: 0x5b,
  RWIN: 0x5c,
  LSHIFT: 0xa0,
  F23: 0x86,
} as const;

const NAMES: Record<number, string> = {
  0x08: "Backspace",
  0x09: "Tab",
  0x0d: "Enter",
  0x10: "Shift",
  0x11: "Ctrl",
  0x12: "Alt",
  0x13: "Pause",
  0x14: "CapsLock",
  0x1b: "Esc",
  0x20: "Space",
  0x21: "PgUp",
  0x22: "PgDn",
  0x23: "End",
  0x24: "Home",
  0x25: "Left",
  0x26: "Up",
  0x27: "Right",
  0x28: "Down",
  0x2c: "PrtSc",
  0x2d: "Insert",
  0x2e: "Delete",
  0x5b: "LWin",
  0x5c: "RWin",
  0x5d: "Menu",
  0x86: "F23 (Copilot)",
  0x90: "NumLock",
  0x91: "ScrollLock",
  0xa0: "LShift",
  0xa1: "RShift",
  0xa2: "LCtrl",
  0xa3: "RCtrl",
  0xa4: "LAlt",
  0xa5: "RAlt",
  0xad: "Mute",
  0xae: "Vol-",
  0xaf: "Vol+",
  0xb0: "Next",
  0xb1: "Prev",
  0xb3: "Play",
  0xba: "OEM_1",
  0xbb: "OEM_PLUS",
  0xbc: "OEM_COMMA",
  0xbd: "OEM_MINUS",
  0xbe: "OEM_PERIOD",
  0xbf: "OEM_2",
  0xc0: "OEM_3",
  0xdb: "OEM_4",
  0xdc: "OEM_5",
  0xdd: "OEM_6",
  0xde: "OEM_7",
  0xe2: "OEM_102",
  0xff: "OEM/Fn",
};

export function vkName(vk: number): string {
  if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk);
  if (vk >= 0x41 && vk <= 0x5a) return String.fromCharCode(vk);
  if (vk >= 0x60 && vk <= 0x69) return `Num${vk - 0x60}`;
  if (vk !== 0x86 && vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  return NAMES[vk] ?? `VK 0x${vk.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function hex(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
}

export const MODIFIERS = new Set([0x10, 0x11, 0x12, 0x5b, 0x5c, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]);

export type Safety = "safe" | "info" | "warn" | "danger";

const BOOT_KEYS = new Set([0x1b, 0x0d, 0x2e, 0x70, 0x71, 0x79, 0x7a, 0x7b]);

export function keySafety(vk: number, companions: number[]): { level: Safety; reason: string } {
  if (vk === VK.F23 && companions.length > 0) return { level: "info", reason: "safety.copilot" };
  if (BOOT_KEYS.has(vk)) return { level: "danger", reason: "safety.boot" };
  if (vk === VK.LWIN || vk === VK.RWIN) return { level: "danger", reason: "safety.win" };
  const common =
    MODIFIERS.has(vk) ||
    (vk >= 0x30 && vk <= 0x39) ||
    (vk >= 0x41 && vk <= 0x5a) ||
    [0x08, 0x09, 0x20, 0x25, 0x26, 0x27, 0x28, 0x14].includes(vk) ||
    (vk >= 0xba && vk <= 0xe2);
  if (common) return { level: "warn", reason: "safety.common" };
  if (vk >= 0x72 && vk <= 0x78) return { level: "info", reason: "safety.fnrow" };
  return { level: "safe", reason: "safety.safe" };
}

export type Preset = Omit<Rule, "id" | "enabled">;

export const PRESETS: Preset[] = [
  { name: "F8", vk: 0x77, scan: 0x42, ext: false, companions: [] },
  { name: "Copilot", vk: VK.F23, scan: 0x6e, ext: false, companions: [VK.LWIN, VK.LSHIFT] },
  { name: "End", vk: 0x23, scan: 0x4f, ext: true, companions: [] },
  { name: "Insert", vk: 0x2d, scan: 0x52, ext: true, companions: [] },
  { name: "Menu", vk: 0x5d, scan: 0x5d, ext: true, companions: [] },
  { name: "RCtrl", vk: 0xa3, scan: 0x1d, ext: true, companions: [] },
  { name: "ScrollLock", vk: 0x91, scan: 0x46, ext: false, companions: [] },
  { name: "Pause", vk: 0x13, scan: 0x45, ext: false, companions: [] },
];

export function newId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface MapKey {
  vk: number;
  label: string;
  w?: number;
}

const letters = (s: string): MapKey[] => [...s].map((c) => ({ vk: c.charCodeAt(0), label: c }));

export const KEYBOARD: MapKey[][] = [
  [
    { vk: 0x1b, label: "Esc" },
    ...Array.from({ length: 12 }, (_, i) => ({ vk: 0x70 + i, label: `F${i + 1}` })),
    { vk: 0x2d, label: "Ins" },
    { vk: 0x2e, label: "Supr" },
    { vk: 0x24, label: "Inicio" },
    { vk: 0x23, label: "Fin" },
  ],
  [
    { vk: 0xdc, label: "º" },
    ...letters("1234567890"),
    { vk: 0xdb, label: "'" },
    { vk: 0xdd, label: "¡" },
    { vk: 0x08, label: "⌫", w: 2 },
    { vk: 0x21, label: "RePág" },
  ],
  [
    { vk: 0x09, label: "Tab", w: 1.5 },
    ...letters("QWERTYUIOP"),
    { vk: 0xba, label: "`" },
    { vk: 0xbb, label: "+" },
    { vk: 0x0d, label: "Enter", w: 1.5 },
    { vk: 0x22, label: "AvPág" },
  ],
  [
    { vk: 0x14, label: "Mayús", w: 1.75 },
    ...letters("ASDFGHJKL"),
    { vk: 0xc0, label: "Ñ" },
    { vk: 0xde, label: "´" },
    { vk: 0xbf, label: "Ç" },
    { vk: 0, label: "", w: 1.25 },
    { vk: 0x2c, label: "ImpPt" },
  ],
  [
    { vk: 0xa0, label: "Shift", w: 1.25 },
    { vk: 0xe2, label: "<" },
    ...letters("ZXCVBNM"),
    { vk: 0xbc, label: "," },
    { vk: 0xbe, label: "." },
    { vk: 0xbd, label: "-" },
    { vk: 0xa1, label: "Shift", w: 2.25 },
    { vk: 0x26, label: "↑" },
  ],
  [
    { vk: 0xa2, label: "Ctrl", w: 1.5 },
    { vk: 0xff, label: "Fn" },
    { vk: 0x5b, label: "Win" },
    { vk: 0xa4, label: "Alt" },
    { vk: 0x20, label: "", w: 5.5 },
    { vk: 0xa5, label: "AltGr" },
    { vk: 0x86, label: "Copilot" },
    { vk: 0xa3, label: "Ctrl", w: 1.25 },
    { vk: 0x25, label: "←" },
    { vk: 0x28, label: "↓" },
    { vk: 0x27, label: "→" },
  ],
];
