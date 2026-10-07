import { useEffect, useRef } from "react";
import { api, type KeyObserved } from "./ipc";

const POLL_MS = 30;

export function useKeyStream(onEvents: (events: KeyObserved[]) => void, enabled = true) {
  const handler = useRef(onEvents);
  handler.current = onEvents;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const events = await api.takeEvents();
        if (alive && events.length > 0) handler.current(events);
      } catch {
        /* the next tick retries */
      }
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    };
    api.setInspect(true).then(() => {
      if (alive) timer = window.setTimeout(tick, 0);
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      api.setInspect(false);
    };
  }, [enabled]);
}

// Keeps keys typed while testing from scrolling, tabbing or triggering browser shortcuts.
export function useSwallowBrowserKeys(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const block = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [enabled]);
}
