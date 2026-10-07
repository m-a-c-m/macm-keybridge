use crate::bridge::{Bridge, KeyEvent};
use crate::config::Rule;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{GetCurrentThread, GetCurrentThreadId, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, KillTimer, SetTimer, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT,
    LLKHF_EXTENDED, LLKHF_INJECTED, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_TIMER,
};

const TAG: usize = 0x4B42_5247;
const COMBO_WINDOW_MS: u32 = 35;
const REHOOK_MS: u32 = 60_000;

static BRIDGE: Mutex<Bridge> = Mutex::new(Bridge::new());
static RULES: Mutex<Vec<Rule>> = Mutex::new(Vec::new());
static ACTIVE: AtomicBool = AtomicBool::new(false);
static INSPECT: AtomicBool = AtomicBool::new(false);
static BLOCKED: AtomicU64 = AtomicU64::new(0);
static HOOK: AtomicIsize = AtomicIsize::new(0);
static THREAD: AtomicU32 = AtomicU32::new(0);
static COMBO_TIMER: AtomicUsize = AtomicUsize::new(0);
static START: OnceLock<Instant> = OnceLock::new();
static EVENTS: Mutex<VecDeque<Observed>> = Mutex::new(VecDeque::new());
static SEEN: AtomicU64 = AtomicU64::new(0);
static LAST_SEEN_MS: AtomicU64 = AtomicU64::new(0);

const EVENTS_CAP: usize = 2000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Observed {
    pub vk: u16,
    pub scan: u16,
    pub ext: bool,
    pub down: bool,
    pub injected: bool,
    pub blocked: bool,
    pub t: u64,
}

pub fn start() -> Result<(), String> {
    let _ = START.set(Instant::now());
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::Builder::new()
        .name("keybridge-hook".into())
        .spawn(move || unsafe {
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
            if let Err(e) = install() {
                let _ = ready_tx.send(Err(e));
                return;
            }
            THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
            let rehook_timer = SetTimer(None, 0, REHOOK_MS, None);
            let _ = ready_tx.send(Ok(()));
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message != WM_TIMER {
                    continue;
                }
                if msg.wParam.0 == rehook_timer {
                    let _ = install();
                } else if msg.wParam.0 == COMBO_TIMER.load(Ordering::Relaxed) {
                    disarm_combo_timer();
                    let replay = BRIDGE.lock().map(|mut b| b.take_pending()).unwrap_or_default();
                    send(&replay);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    ready_rx.recv().map_err(|e| e.to_string())?
}

// Installing the new hook before removing the old one leaves no window where a held bridge key
// could leak through; Windows silently drops hooks that ever exceed LowLevelHooksTimeout.
unsafe fn install() -> Result<(), String> {
    let module = GetModuleHandleW(None).map_err(|e| e.message())?;
    let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(callback), Some(HINSTANCE(module.0)), 0).map_err(|e| e.message())?;
    let old = HOOK.swap(hook.0 as isize, Ordering::SeqCst);
    if old != 0 {
        let _ = UnhookWindowsHookEx(HHOOK(old as *mut _));
    }
    Ok(())
}

pub fn blocked_count() -> u64 {
    BLOCKED.load(Ordering::Relaxed)
}

pub fn set_inspect(on: bool) {
    if on {
        if let Ok(mut e) = EVENTS.lock() {
            e.clear();
        }
    }
    INSPECT.store(on, Ordering::Relaxed);
}

pub fn take_events() -> Vec<Observed> {
    EVENTS.lock().map(|mut e| e.drain(..).collect()).unwrap_or_default()
}

pub fn seen_count() -> u64 {
    SEEN.load(Ordering::Relaxed)
}

pub fn ms_since_last_event() -> Option<u64> {
    let start = START.get()?;
    match SEEN.load(Ordering::Relaxed) {
        0 => None,
        _ => Some((start.elapsed().as_millis() as u64).saturating_sub(LAST_SEEN_MS.load(Ordering::Relaxed))),
    }
}

pub fn set_rules(rules: &[Rule]) {
    if let Ok(mut stored) = RULES.lock() {
        *stored = rules.to_vec();
    }
    let replay = match BRIDGE.lock() {
        Ok(mut b) => {
            let replay = b.reset();
            b.set_rules(rules);
            replay
        }
        Err(_) => Vec::new(),
    };
    send(&replay);
    if ACTIVE.load(Ordering::Relaxed) {
        release_stuck(rules);
    }
}

pub fn set_active(on: bool) {
    let was = ACTIVE.swap(on, Ordering::SeqCst);
    if on && !was {
        if let Ok(rules) = RULES.lock() {
            release_stuck(&rules);
        }
    }
    if !on && was {
        let replay = BRIDGE.lock().map(|mut b| b.reset()).unwrap_or_default();
        send(&replay);
    }
}

// A bridge key that was already held before blocking started is still "down" for Windows.
fn release_stuck(rules: &[Rule]) {
    let mut ups = Vec::new();
    for rule in rules.iter().filter(|r| r.enabled) {
        for vk in std::iter::once(rule.vk).chain(rule.companions.iter().copied()) {
            let down = unsafe { GetAsyncKeyState(vk as i32) } as u16 & 0x8000 != 0;
            if down {
                let ext = if vk == rule.vk { rule.ext } else { matches!(vk, 0x5B | 0x5C | 0xA3 | 0xA5) };
                ups.push(KeyEvent { vk, scan: if vk == rule.vk { rule.scan } else { 0 }, ext, down: false });
            }
        }
    }
    send(&ups);
}

fn send(events: &[KeyEvent]) {
    if events.is_empty() {
        return;
    }
    let inputs: Vec<INPUT> = events
        .iter()
        .map(|e| {
            let mut flags = KEYBD_EVENT_FLAGS(0);
            if e.ext {
                flags |= KEYEVENTF_EXTENDEDKEY;
            }
            if !e.down {
                flags |= KEYEVENTF_KEYUP;
            }
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT { wVk: VIRTUAL_KEY(e.vk), wScan: e.scan, dwFlags: flags, time: 0, dwExtraInfo: TAG },
                },
            }
        })
        .collect();
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn arm_combo_timer() {
    disarm_combo_timer();
    let id = unsafe { SetTimer(None, 0, COMBO_WINDOW_MS, None) };
    COMBO_TIMER.store(id, Ordering::Relaxed);
}

fn disarm_combo_timer() {
    let id = COMBO_TIMER.swap(0, Ordering::Relaxed);
    if id != 0 {
        unsafe {
            let _ = KillTimer(None, id);
        }
    }
}

unsafe extern "system" fn callback(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }
    let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
    let msg = wparam.0 as u32;
    let down = matches!(msg, WM_KEYDOWN | WM_SYSKEYDOWN);
    if info.dwExtraInfo == TAG || !(down || matches!(msg, WM_KEYUP | WM_SYSKEYUP)) {
        return CallNextHookEx(None, code, wparam, lparam);
    }
    let injected = (info.flags & LLKHF_INJECTED).0 != 0;
    let ev = KeyEvent {
        vk: info.vkCode as u16,
        scan: info.scanCode as u16,
        ext: (info.flags & LLKHF_EXTENDED).0 != 0,
        down,
    };

    let mut swallow = false;
    let mut blocked = false;
    if !injected && ACTIVE.load(Ordering::Relaxed) {
        let outcome = match BRIDGE.lock() {
            Ok(mut b) => b.handle(ev),
            Err(_) => Default::default(),
        };
        swallow = outcome.swallow;
        blocked = outcome.blocked;
        if outcome.arm_timer {
            arm_combo_timer();
        } else {
            disarm_combo_timer();
        }
        send(&outcome.replay);
        if blocked && down {
            BLOCKED.fetch_add(1, Ordering::Relaxed);
        }
    }

    let t = START.get().map(|s| s.elapsed().as_millis() as u64).unwrap_or(0);
    SEEN.fetch_add(1, Ordering::Relaxed);
    LAST_SEEN_MS.store(t, Ordering::Relaxed);
    if INSPECT.load(Ordering::Relaxed) {
        let observed = Observed { vk: ev.vk, scan: ev.scan, ext: ev.ext, down, injected, blocked, t };
        if let Ok(mut events) = EVENTS.lock() {
            if events.len() >= EVENTS_CAP {
                events.pop_front();
            }
            events.push_back(observed);
        }
    }

    if swallow {
        LRESULT(1)
    } else {
        CallNextHookEx(None, code, wparam, lparam)
    }
}
