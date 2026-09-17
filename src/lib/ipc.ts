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
  radioGuard: boolean;
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
  elevated: boolean;
  activeRules: number;
  airplane: boolean | null;
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
};
