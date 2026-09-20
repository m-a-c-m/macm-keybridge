import type { Lang } from "./i18n";

export type Fitness = "best" | "good" | "careful" | "avoid";
export type Group = "fnrow" | "nav" | "locks" | "mods";

type Text = { es: string; en: string };

export interface GuideKey {
  vk: number;
  ext: boolean;
  group: Group;
  alone: Text;
  fn?: Text;
  bridge: Fitness;
  swap: Fitness;
  note?: Text;
}

const FN_VARIES: Text = {
  es: "El icono impreso en la tecla manda: en algunos modelos cambia.",
  en: "The icon printed on the key wins: it changes on some models.",
};

export const GUIDE: GuideKey[] = [
  {
    vk: 0x70,
    ext: false,
    group: "fnrow",
    alone: { es: "F1 abre la ayuda del programa que tengas delante.", en: "F1 opens the help of the program in front of you." },
    fn: { es: "Silencia o activa el sonido.", en: "Mutes or unmutes the sound." },
    bridge: "avoid",
    swap: "careful",
    note: { es: "Pisada al encender el portátil puede entrar en la BIOS.", en: "Held at power-on it may enter the BIOS." },
  },
  {
    vk: 0x71,
    ext: false,
    group: "fnrow",
    alone: { es: "F2 renombra el archivo seleccionado en el explorador.", en: "F2 renames the selected file in File Explorer." },
    fn: { es: "Baja el volumen.", en: "Turns the volume down." },
    bridge: "careful",
    swap: "careful",
  },
  {
    vk: 0x72,
    ext: false,
    group: "fnrow",
    alone: { es: "F3 abre la búsqueda en muchos programas.", en: "F3 opens search in many programs." },
    fn: { es: "Sube el volumen.", en: "Turns the volume up." },
    bridge: "good",
    swap: "careful",
  },
  {
    vk: 0x73,
    ext: false,
    group: "fnrow",
    alone: { es: "F4 sola casi no se usa; con Alt cierra la ventana.", en: "F4 alone is barely used; with Alt it closes the window." },
    fn: { es: "Silencia el micrófono.", en: "Mutes the microphone." },
    bridge: "good",
    swap: "good",
  },
  {
    vk: 0x74,
    ext: false,
    group: "fnrow",
    alone: { es: "F5 recarga la página en el navegador.", en: "F5 reloads the page in the browser." },
    fn: { es: "Baja el brillo de la pantalla.", en: "Lowers the screen brightness." },
    bridge: "avoid",
    swap: "careful",
  },
  {
    vk: 0x75,
    ext: false,
    group: "fnrow",
    alone: { es: "F6 mueve el cursor a la barra de direcciones del navegador.", en: "F6 moves the cursor to the browser address bar." },
    fn: { es: "Sube el brillo de la pantalla.", en: "Raises the screen brightness." },
    bridge: "good",
    swap: "good",
  },
  {
    vk: 0x76,
    ext: false,
    group: "fnrow",
    alone: { es: "F7 sola no hace nada en Windows.", en: "F7 alone does nothing in Windows." },
    fn: { es: "Cambia entre pantalla del portátil y monitor externo.", en: "Switches between the laptop screen and an external monitor." },
    bridge: "best",
    swap: "best",
  },
  {
    vk: 0x77,
    ext: false,
    group: "fnrow",
    alone: { es: "F8 sola no hace nada en Windows.", en: "F8 alone does nothing in Windows." },
    fn: { es: "Activa el modo avión y te deja sin Wi-Fi.", en: "Turns on airplane mode and leaves you without Wi-Fi." },
    bridge: "best",
    swap: "best",
    note: {
      es: "Si eliges esta, activa en Ajustes «Anular la tecla de modo avión»: así Fn + F8 deja de cortar el Wi-Fi.",
      en: "If you pick this one, turn on “Block the airplane-mode key” in Settings so Fn + F8 stops cutting the Wi-Fi.",
    },
  },
  {
    vk: 0x78,
    ext: false,
    group: "fnrow",
    alone: { es: "F9 sola no hace nada en Windows.", en: "F9 alone does nothing in Windows." },
    fn: { es: "Suele bloquear el equipo o abrir los ajustes rápidos.", en: "Usually locks the computer or opens quick settings." },
    bridge: "best",
    swap: "best",
  },
  {
    vk: 0x79,
    ext: false,
    group: "fnrow",
    alone: { es: "F10 sola abre el menú de algunos programas.", en: "F10 alone opens the menu in some programs." },
    fn: { es: "Suele apagar o encender el panel táctil.", en: "Usually turns the touchpad off or on." },
    bridge: "careful",
    swap: "good",
    note: { es: "Pisada al encender el portátil puede abrir el menú de arranque.", en: "Held at power-on it may open the boot menu." },
  },
  {
    vk: 0x7a,
    ext: false,
    group: "fnrow",
    alone: { es: "F11 pone el navegador a pantalla completa.", en: "F11 makes the browser full screen." },
    fn: { es: "Suele apagar o encender la cámara.", en: "Usually turns the camera off or on." },
    bridge: "careful",
    swap: "careful",
    note: { es: "Pisada al encender el portátil puede abrir la recuperación de Lenovo.", en: "Held at power-on it may open Lenovo recovery." },
  },
  {
    vk: 0x7b,
    ext: false,
    group: "fnrow",
    alone: { es: "F12 abre las herramientas de desarrollo del navegador.", en: "F12 opens the browser developer tools." },
    fn: { es: "Suele abrir la aplicación de Lenovo (Vantage o LOQ).", en: "Usually opens the Lenovo app (Vantage or LOQ)." },
    bridge: "careful",
    swap: "good",
    note: { es: "Pisada al encender el portátil puede abrir el menú de arranque.", en: "Held at power-on it may open the boot menu." },
  },
  {
    vk: 0x2d,
    ext: true,
    group: "nav",
    alone: { es: "Insert cambia entre escribir insertando o sobreescribiendo. Casi nadie la usa.", en: "Insert switches between inserting and overwriting text. Hardly anyone uses it." },
    bridge: "best",
    swap: "best",
  },
  {
    vk: 0x2e,
    ext: true,
    group: "nav",
    alone: { es: "Supr borra el archivo o el texto seleccionado.", en: "Delete removes the selected file or text." },
    bridge: "avoid",
    swap: "avoid",
  },
  {
    vk: 0x24,
    ext: true,
    group: "nav",
    alone: { es: "Inicio lleva el cursor al principio de la línea.", en: "Home moves the cursor to the start of the line." },
    bridge: "careful",
    swap: "careful",
  },
  {
    vk: 0x23,
    ext: true,
    group: "nav",
    alone: { es: "Fin lleva el cursor al final de la línea.", en: "End moves the cursor to the end of the line." },
    bridge: "careful",
    swap: "careful",
  },
  {
    vk: 0x21,
    ext: true,
    group: "nav",
    alone: { es: "RePág sube una pantalla.", en: "Page Up scrolls one screen up." },
    bridge: "careful",
    swap: "careful",
  },
  {
    vk: 0x22,
    ext: true,
    group: "nav",
    alone: { es: "AvPág baja una pantalla.", en: "Page Down scrolls one screen down." },
    bridge: "careful",
    swap: "careful",
  },
  {
    vk: 0x2c,
    ext: true,
    group: "nav",
    alone: { es: "ImpPt copia la pantalla; con Windows + Shift abre la herramienta de recortes.", en: "Print Screen copies the screen; with Windows + Shift it opens the snipping tool." },
    bridge: "good",
    swap: "good",
  },
  {
    vk: 0x91,
    ext: false,
    group: "locks",
    alone: { es: "Bloq Despl no hace nada salvo en Excel. La mejor candidata.", en: "Scroll Lock does nothing except in Excel. The best candidate." },
    bridge: "best",
    swap: "best",
    note: { es: "En este portátil no tiene tecla propia: se hace con Fn + K.", en: "This laptop has no dedicated key for it: it is Fn + K." },
  },
  {
    vk: 0x13,
    ext: false,
    group: "locks",
    alone: { es: "Pausa no hace nada en Windows moderno.", en: "Pause does nothing in modern Windows." },
    bridge: "best",
    swap: "best",
    note: { es: "En este portátil no tiene tecla propia: se hace con Fn + P.", en: "This laptop has no dedicated key for it: it is Fn + P." },
  },
  {
    vk: 0x90,
    ext: false,
    group: "locks",
    alone: { es: "Bloq Num enciende y apaga el teclado numérico.", en: "Num Lock turns the numeric keypad on and off." },
    bridge: "careful",
    swap: "careful",
    note: { es: "Si la sustituyes, el teclado numérico se queda como esté.", en: "If you replace it, the numeric keypad stays as it is." },
  },
  {
    vk: 0x14,
    ext: false,
    group: "locks",
    alone: { es: "Bloq Mayús escribe todo en mayúsculas.", en: "Caps Lock types everything in capitals." },
    bridge: "avoid",
    swap: "careful",
  },
  {
    vk: 0x86,
    ext: false,
    group: "mods",
    alone: { es: "La tecla Copilot abre el asistente de Microsoft.", en: "The Copilot key opens the Microsoft assistant." },
    bridge: "best",
    swap: "good",
    note: {
      es: "Es la mejor de todas: está al lado del espacio y no sirve para nada más. KeyBridge bloquea también el Win + Shift que emite, sin tocar la tecla Windows real.",
      en: "The best of all: it sits next to the space bar and does nothing else. KeyBridge also blocks the Win + Shift it emits, without touching the real Windows key.",
    },
  },
  {
    vk: 0xa3,
    ext: true,
    group: "mods",
    alone: { es: "El Ctrl de la derecha hace lo mismo que el de la izquierda.", en: "The right Ctrl does the same as the left one." },
    bridge: "good",
    swap: "careful",
    note: { es: "Mientras esté pisada, los atajos con Ctrl siguen funcionando con el Ctrl izquierdo.", en: "While it is held, Ctrl shortcuts still work with the left Ctrl." },
  },
  {
    vk: 0xa5,
    ext: true,
    group: "mods",
    alone: { es: "AltGr escribe @, €, # y similares.", en: "AltGr types @, €, # and similar characters." },
    bridge: "avoid",
    swap: "avoid",
  },
  {
    vk: 0xa1,
    ext: false,
    group: "mods",
    alone: { es: "El Shift de la derecha pone mayúsculas.", en: "The right Shift types capitals." },
    bridge: "careful",
    swap: "careful",
    note: { es: "Como puente funciona, pero pierdes un Shift para escribir.", en: "It works as a bridge, but you lose one Shift for typing." },
  },
  {
    vk: 0x5b,
    ext: true,
    group: "mods",
    alone: { es: "La tecla Windows abre el menú Inicio.", en: "The Windows key opens the Start menu." },
    bridge: "avoid",
    swap: "avoid",
  },
];

const BADGE: Record<Fitness, Text> = {
  best: { es: "Recomendada", en: "Recommended" },
  good: { es: "Buena opción", en: "Good choice" },
  careful: { es: "Con cuidado", en: "With care" },
  avoid: { es: "Mejor no", en: "Better not" },
};

const ORDER: Record<Fitness, number> = { best: 0, good: 1, careful: 2, avoid: 3 };

export function badge(fitness: Fitness, lang: Lang): string {
  return BADGE[fitness][lang];
}

export function text(value: Text | undefined, lang: Lang): string {
  return value ? value[lang] : "";
}

export function fnVaries(lang: Lang): string {
  return FN_VARIES[lang];
}

export function ranked(mode: "bridge" | "swap"): GuideKey[] {
  return [...GUIDE].sort((a, b) => ORDER[a[mode]] - ORDER[b[mode]] || a.vk - b.vk);
}

export function recommended(mode: "bridge" | "swap"): GuideKey[] {
  return GUIDE.filter((k) => k[mode] === "best");
}
