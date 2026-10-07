use crate::config::Rule;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyEvent {
    pub vk: u16,
    pub scan: u16,
    pub ext: bool,
    pub down: bool,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    pub swallow: bool,
    pub blocked: bool,
    pub arm_timer: bool,
    pub replay: Vec<KeyEvent>,
}

impl Outcome {
    fn pass() -> Self {
        Self::default()
    }
    fn blocked() -> Self {
        Self { swallow: true, blocked: true, ..Self::default() }
    }
}

#[derive(Debug, Clone)]
struct Combo {
    companions: Vec<u16>,
    vk: u16,
    ext: bool,
}

// Keyboards that emit a trigger as a modifier sequence (Copilot = LWin, LShift, F23) force us to
// hold back the first modifier until we know whether the rest of the sequence follows.
pub struct Bridge {
    singles: Vec<(u16, bool)>,
    combos: Vec<Combo>,
    pending: Vec<KeyEvent>,
    swallow_up: [bool; 256],
    held: [bool; 256],
}

impl Bridge {
    pub const fn new() -> Self {
        Self {
            singles: Vec::new(),
            combos: Vec::new(),
            pending: Vec::new(),
            swallow_up: [false; 256],
            held: [false; 256],
        }
    }

    pub fn set_rules(&mut self, rules: &[Rule]) {
        self.singles.clear();
        self.combos.clear();
        for rule in rules.iter().filter(|r| r.enabled) {
            self.singles.push((rule.vk, rule.ext));
            if !rule.companions.is_empty() {
                self.combos.push(Combo {
                    companions: rule.companions.clone(),
                    vk: rule.vk,
                    ext: rule.ext,
                });
            }
        }
    }

    pub fn take_pending(&mut self) -> Vec<KeyEvent> {
        std::mem::take(&mut self.pending)
    }

    pub fn reset(&mut self) -> Vec<KeyEvent> {
        self.swallow_up = [false; 256];
        self.take_pending()
    }

    pub fn handle(&mut self, ev: KeyEvent) -> Outcome {
        let idx = (ev.vk & 0xFF) as usize;
        let was_held = self.held[idx];
        self.held[idx] = ev.down;

        if self.pending.is_empty() {
            return self.handle_plain(ev, was_held);
        }

        if ev.down && !was_held {
            let pending_len = self.pending.len();
            let matched = self.combos.iter().any(|c| {
                c.vk == ev.vk && c.ext == ev.ext && c.companions.len() == pending_len && self.pending_matches(c)
            });
            if matched {
                for p in self.pending.drain(..) {
                    self.swallow_up[(p.vk & 0xFF) as usize] = true;
                }
                return Outcome::blocked();
            }
            let continues = self.combos.iter().any(|c| {
                c.companions.len() > pending_len && self.pending_matches(c) && c.companions[pending_len] == ev.vk
            });
            if continues {
                self.pending.push(ev);
                return Outcome { swallow: true, arm_timer: true, ..Outcome::default() };
            }
        }

        let mut replay = self.take_pending();
        let inner = self.handle_plain(ev, was_held);
        if inner.swallow {
            return Outcome { replay, ..inner };
        }
        replay.push(ev);
        Outcome { swallow: true, replay, ..Outcome::default() }
    }

    fn pending_matches(&self, combo: &Combo) -> bool {
        self.pending.iter().zip(&combo.companions).all(|(p, c)| p.vk == *c)
    }

    fn handle_plain(&mut self, ev: KeyEvent, was_held: bool) -> Outcome {
        let idx = (ev.vk & 0xFF) as usize;
        if !ev.down && self.swallow_up[idx] {
            self.swallow_up[idx] = false;
            return Outcome::blocked();
        }
        if self.singles.contains(&(ev.vk, ev.ext)) {
            return Outcome::blocked();
        }
        if ev.down && !was_held && self.combos.iter().any(|c| c.companions[0] == ev.vk) {
            self.pending.push(ev);
            return Outcome { swallow: true, arm_timer: true, ..Outcome::default() };
        }
        Outcome::pass()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LWIN: u16 = 0x5B;
    const LSHIFT: u16 = 0xA0;
    const F23: u16 = 0x86;
    const F8: u16 = 0x77;
    const END: u16 = 0x23;

    fn rule(vk: u16, ext: bool, companions: Vec<u16>) -> Rule {
        Rule { id: format!("r{vk}"), name: String::new(), enabled: true, vk, scan: 0, ext, companions }
    }
    fn dn(vk: u16) -> KeyEvent {
        KeyEvent { vk, scan: 0, ext: vk == LWIN, down: true }
    }
    fn up(vk: u16) -> KeyEvent {
        KeyEvent { vk, scan: 0, ext: vk == LWIN, down: false }
    }
    fn copilot() -> Bridge {
        let mut b = Bridge::new();
        b.set_rules(&[rule(F23, false, vec![LWIN, LSHIFT])]);
        b
    }

    #[test]
    fn single_key_is_swallowed_including_repeats_and_release() {
        let mut b = Bridge::new();
        b.set_rules(&[rule(F8, false, vec![])]);
        for _ in 0..20 {
            assert_eq!(b.handle(dn(F8)), Outcome::blocked());
        }
        assert_eq!(b.handle(up(F8)), Outcome::blocked());
        assert_eq!(b.handle(dn(0x45)), Outcome::pass());
        assert_eq!(b.handle(up(0x45)), Outcome::pass());
    }

    #[test]
    fn disabled_rules_and_extended_mismatch_pass() {
        let mut b = Bridge::new();
        let mut disabled = rule(F8, false, vec![]);
        disabled.enabled = false;
        b.set_rules(&[disabled, rule(END, true, vec![])]);
        assert_eq!(b.handle(dn(F8)), Outcome::pass());
        let numpad_end = KeyEvent { vk: END, scan: 0x4F, ext: false, down: true };
        assert_eq!(b.handle(numpad_end), Outcome::pass());
        let end = KeyEvent { ext: true, ..numpad_end };
        assert!(b.handle(end).blocked);
    }

    #[test]
    fn copilot_sequence_is_fully_swallowed_while_held() {
        let mut b = copilot();
        let first = b.handle(dn(LWIN));
        assert!(first.swallow && first.arm_timer && first.replay.is_empty());
        let second = b.handle(dn(LSHIFT));
        assert!(second.swallow && second.arm_timer && second.replay.is_empty());
        assert_eq!(b.handle(dn(F23)), Outcome::blocked());
        for _ in 0..50 {
            assert_eq!(b.handle(dn(F23)), Outcome::blocked());
        }
        assert_eq!(b.handle(up(F23)), Outcome::blocked());
        assert_eq!(b.handle(up(LSHIFT)), Outcome::blocked());
        assert_eq!(b.handle(up(LWIN)), Outcome::blocked());
        assert_eq!(b.handle(dn(LWIN)).replay, vec![]);
        assert_eq!(b.take_pending(), vec![dn(LWIN)]);
    }

    #[test]
    fn typing_with_bridge_held_is_untouched() {
        let mut b = copilot();
        b.handle(dn(LWIN));
        b.handle(dn(LSHIFT));
        b.handle(dn(F23));
        for vk in [0x33, 0x45, 0x44, 0x43] {
            assert_eq!(b.handle(dn(vk)), Outcome::pass());
            assert_eq!(b.handle(up(vk)), Outcome::pass());
        }
        assert_eq!(b.handle(dn(F23)), Outcome::blocked());
    }

    #[test]
    fn real_windows_shortcut_is_replayed_in_order() {
        let mut b = copilot();
        b.handle(dn(LWIN));
        let out = b.handle(dn(0x45));
        assert!(out.swallow && !out.blocked);
        assert_eq!(out.replay, vec![dn(LWIN), dn(0x45)]);
        assert_eq!(b.handle(up(0x45)), Outcome::pass());
        assert_eq!(b.handle(up(LWIN)), Outcome::pass());
    }

    #[test]
    fn windows_key_tap_is_replayed_on_release() {
        let mut b = copilot();
        b.handle(dn(LWIN));
        let out = b.handle(up(LWIN));
        assert_eq!(out.replay, vec![dn(LWIN), up(LWIN)]);
    }

    #[test]
    fn win_shift_s_is_not_mistaken_for_copilot() {
        let mut b = copilot();
        b.handle(dn(LWIN));
        b.handle(dn(LSHIFT));
        let out = b.handle(dn(0x53));
        assert_eq!(out.replay, vec![dn(LWIN), dn(LSHIFT), dn(0x53)]);
        assert_eq!(b.handle(up(LSHIFT)), Outcome::pass());
    }

    #[test]
    fn shift_alone_is_never_buffered() {
        let mut b = copilot();
        assert_eq!(b.handle(dn(LSHIFT)), Outcome::pass());
        assert_eq!(b.handle(dn(0x41)), Outcome::pass());
    }

    #[test]
    fn held_windows_key_repeats_flush_buffer() {
        let mut b = copilot();
        b.handle(dn(LWIN));
        let out = b.handle(dn(LWIN));
        assert_eq!(out.replay, vec![dn(LWIN), dn(LWIN)]);
        assert_eq!(b.handle(dn(LWIN)), Outcome::pass());
    }

    #[test]
    fn mismatch_on_a_blocked_key_replays_only_the_buffer() {
        let mut b = Bridge::new();
        b.set_rules(&[rule(F23, false, vec![LWIN, LSHIFT]), rule(F8, false, vec![])]);
        b.handle(dn(LWIN));
        let out = b.handle(dn(F8));
        assert!(out.blocked);
        assert_eq!(out.replay, vec![dn(LWIN)]);
    }

    #[test]
    fn reset_clears_state() {
        let mut b = copilot();
        b.handle(dn(LWIN));
        b.handle(dn(LSHIFT));
        b.handle(dn(F23));
        assert_eq!(b.reset(), vec![]);
        b.set_rules(&[]);
        assert_eq!(b.handle(up(LWIN)), Outcome::pass());
    }
}
