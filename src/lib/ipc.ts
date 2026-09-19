import { invoke } from "@tauri-apps/api/core";

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  vk: number;
  scan: number;
  ext: boolean;
  companions: number[];
}

export interface Config {
  active: boolean;
  rules: Rule[];
  pauseHotkey: string | null;
  startMinimized: boolean;
  radioBlock: boolean;
  radioDisabledIds: string[];
  onboarded: boolean;
  notifications: boolean;
  language: "es" | "en";
  theme: "dark" | "light" | "system";
}

export interface Status {
  enabled: boolean;
  paused: boolean;
  pauseRemainingSecs: number | null;
  blocking: boolean;
  blockedCount: number;
  hookOk: boolean;
  eventsSeen: number;
  msSinceLastEvent: number | null;
  elevated: boolean;
  activeRules: number;
  airplane: boolean | null;
  autostartStale: boolean;
}

export interface Device {
  id: string;
  name: string;
  enabled: boolean;
}

export interface RadioStatus {
  devices: Device[];
  blocked: boolean;
  reenabled: boolean;
}

export interface Bootstrap {
  config: Config;
  status: Status;
  version: string;
  firstRun: boolean;
  hotkeyError: string | null;
}

export interface KeyObserved {
  vk: number;
  scan: number;
  ext: boolean;
  down: boolean;
  injected: boolean;
  blocked: boolean;
  t: number;
}

export type AutostartMode = "off" | "user" | "admin";

export const api = {
  bootstrap: () => invoke<Bootstrap>("bootstrap"),
  status: () => invoke<Status>("get_status"),
  saveConfig: (config: Config) => invoke<Config>("save_config", { config }),
  setActive: (on: boolean) => invoke<Status>("set_active", { on }),
  pauseFor: (minutes: number) => invoke<Status>("pause_for", { minutes }),
  resume: () => invoke<Status>("resume_now"),
  setInspect: (on: boolean) => invoke<void>("set_inspect", { on }),
  getAutostart: () => invoke<AutostartMode>("get_autostart"),
  setAutostart: (mode: AutostartMode) => invoke<AutostartMode>("set_autostart", { mode }),
  relaunchAdmin: () => invoke<void>("relaunch_admin"),
  takeEvents: () => invoke<KeyObserved[]>("take_events"),
  radioStatus: () => invoke<RadioStatus>("radio_status"),
  radioSetBlocked: (blocked: boolean) => invoke<RadioStatus>("radio_set_blocked", { blocked }),
  undoAll: () => invoke<void>("undo_all"),
  exportDiagnostics: () => invoke<string>("export_diagnostics"),
};
