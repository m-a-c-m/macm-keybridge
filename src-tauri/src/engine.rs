use crate::config::Rule;
use crate::hook::{self, Observed};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const ENGINE_ARG: &str = "--engine";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const HISTORY_CAP: usize = 600;
const EVENTS_CAP: usize = 2000;

#[derive(Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "camelCase")]
enum Request {
    Rules { rules: Vec<Rule> },
    Active { on: bool },
    Inspect { on: bool },
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Message {
    Ready { error: Option<String> },
    Stats { seen: u64, blocked: u64, since_last: Option<u64> },
    Events { events: Vec<Observed> },
}

// The low-level hook lives in a window-less child process: Windows stops delivering
// WH_KEYBOARD_LL callbacks to a process while one of its own WebView windows is focused.
pub fn run_child() -> i32 {
    let ready = hook::start();
    let mut out = std::io::stdout();
    let send = |out: &mut std::io::Stdout, msg: &Message| {
        if let Ok(line) = serde_json::to_string(msg) {
            let _ = writeln!(out, "{line}");
            let _ = out.flush();
        }
    };
    send(&mut out, &Message::Ready { error: ready.as_ref().err().cloned() });
    if ready.is_err() {
        return 1;
    }

    std::thread::spawn(|| {
        let mut out = std::io::stdout();
        let mut last_stats = Instant::now() - Duration::from_secs(1);
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let events = hook::take_events();
            if !events.is_empty() {
                if let Ok(line) = serde_json::to_string(&Message::Events { events }) {
                    let _ = writeln!(out, "{line}");
                    let _ = out.flush();
                }
            }
            if last_stats.elapsed() >= Duration::from_millis(400) {
                last_stats = Instant::now();
                let stats = Message::Stats {
                    seen: hook::seen_count(),
                    blocked: hook::blocked_count(),
                    since_last: hook::ms_since_last_event(),
                };
                if let Ok(line) = serde_json::to_string(&stats) {
                    if writeln!(out, "{line}").and_then(|_| out.flush()).is_err() {
                        std::process::exit(0);
                    }
                }
            }
        }
    });

    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        match serde_json::from_str::<Request>(&line) {
            Ok(Request::Rules { rules }) => hook::set_rules(&rules),
            Ok(Request::Active { on }) => hook::set_active(on),
            Ok(Request::Inspect { on }) => hook::set_inspect(on),
            Err(_) => {}
        }
    }
    hook::set_active(false);
    0
}

struct Mirror {
    rules: Vec<Rule>,
    active: bool,
    inspect: bool,
    events: VecDeque<Observed>,
    history: VecDeque<Observed>,
    since_last: Option<u64>,
}

static MIRROR: Mutex<Mirror> = Mutex::new(Mirror {
    rules: Vec::new(),
    active: false,
    inspect: false,
    events: VecDeque::new(),
    history: VecDeque::new(),
    since_last: None,
});
static STDIN: Mutex<Option<ChildStdin>> = Mutex::new(None);
static CHILD: Mutex<Option<Child>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);
static STOPPING: AtomicBool = AtomicBool::new(false);
static SEEN_BASE: AtomicU64 = AtomicU64::new(0);
static SEEN: AtomicU64 = AtomicU64::new(0);
static BLOCKED_BASE: AtomicU64 = AtomicU64::new(0);
static BLOCKED: AtomicU64 = AtomicU64::new(0);

fn write_command(cmd: &Request) {
    let Ok(line) = serde_json::to_string(cmd) else { return };
    if let Ok(mut guard) = STDIN.lock() {
        if let Some(stdin) = guard.as_mut() {
            let _ = writeln!(stdin, "{line}").and_then(|_| stdin.flush());
        }
    }
}

fn replay_state() {
    let (rules, active, inspect) = match MIRROR.lock() {
        Ok(m) => (m.rules.clone(), m.active, m.inspect),
        Err(_) => return,
    };
    write_command(&Request::Rules { rules });
    write_command(&Request::Active { on: active });
    write_command(&Request::Inspect { on: inspect });
}

fn spawn() -> Result<mpsc::Receiver<Result<(), String>>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut child = Command::new(exe)
        .arg(ENGINE_ARG)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no engine stdout")?;
    if let Ok(mut guard) = STDIN.lock() {
        *guard = child.stdin.take();
    }
    if let Ok(mut guard) = CHILD.lock() {
        *guard = Some(child);
    }
    SEEN_BASE.fetch_add(SEEN.swap(0, Ordering::Relaxed), Ordering::Relaxed);
    BLOCKED_BASE.fetch_add(BLOCKED.swap(0, Ordering::Relaxed), Ordering::Relaxed);

    let (ready_tx, ready_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut ready_tx = Some(ready_tx);
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            match serde_json::from_str::<Message>(&line) {
                Ok(Message::Ready { error }) => {
                    RUNNING.store(error.is_none(), Ordering::Relaxed);
                    if error.is_none() {
                        replay_state();
                    }
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(error.map_or(Ok(()), Err));
                    }
                }
                Ok(Message::Stats { seen, blocked, since_last }) => {
                    SEEN.store(seen, Ordering::Relaxed);
                    BLOCKED.store(blocked, Ordering::Relaxed);
                    if let Ok(mut m) = MIRROR.lock() {
                        m.since_last = since_last;
                    }
                }
                Ok(Message::Events { events }) => {
                    if let Ok(mut m) = MIRROR.lock() {
                        for e in events {
                            if m.events.len() >= EVENTS_CAP {
                                m.events.pop_front();
                            }
                            if m.history.len() >= HISTORY_CAP {
                                m.history.pop_front();
                            }
                            m.history.push_back(e.clone());
                            m.events.push_back(e);
                        }
                    }
                }
                Err(_) => {}
            }
        }
        RUNNING.store(false, Ordering::Relaxed);
        if let Some(tx) = ready_tx.take() {
            let _ = tx.send(Err("engine exited".into()));
        }
    });
    Ok(ready_rx)
}

pub fn start() -> Result<(), String> {
    let ready = spawn()?.recv_timeout(Duration::from_secs(5)).map_err(|_| "engine did not start".to_string())?;
    std::thread::spawn(|| loop {
        std::thread::sleep(Duration::from_secs(1));
        if STOPPING.load(Ordering::Relaxed) {
            return;
        }
        let exited = CHILD
            .lock()
            .map(|mut c| c.as_mut().map(|child| !matches!(child.try_wait(), Ok(None))).unwrap_or(true))
            .unwrap_or(false);
        if exited {
            RUNNING.store(false, Ordering::Relaxed);
            if let Ok(rx) = spawn() {
                let _ = rx.recv_timeout(Duration::from_secs(5));
            }
        }
    });
    ready
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::Relaxed)
}

pub fn set_rules(rules: &[Rule]) {
    if let Ok(mut m) = MIRROR.lock() {
        m.rules = rules.to_vec();
    }
    write_command(&Request::Rules { rules: rules.to_vec() });
}

pub fn set_active(on: bool) {
    if let Ok(mut m) = MIRROR.lock() {
        m.active = on;
    }
    write_command(&Request::Active { on });
}

pub fn set_inspect(on: bool) {
    if let Ok(mut m) = MIRROR.lock() {
        m.inspect = on;
        if on {
            m.events.clear();
            m.history.clear();
        }
    }
    write_command(&Request::Inspect { on });
}

pub fn take_events() -> Vec<Observed> {
    MIRROR.lock().map(|mut m| m.events.drain(..).collect()).unwrap_or_default()
}

pub fn history() -> Vec<Observed> {
    MIRROR.lock().map(|m| m.history.iter().cloned().collect()).unwrap_or_default()
}

pub fn seen_count() -> u64 {
    SEEN_BASE.load(Ordering::Relaxed) + SEEN.load(Ordering::Relaxed)
}

pub fn blocked_count() -> u64 {
    BLOCKED_BASE.load(Ordering::Relaxed) + BLOCKED.load(Ordering::Relaxed)
}

pub fn ms_since_last_event() -> Option<u64> {
    MIRROR.lock().ok().and_then(|m| m.since_last)
}

pub fn shutdown() {
    STOPPING.store(true, Ordering::Relaxed);
    if let Ok(mut guard) = STDIN.lock() {
        guard.take();
    }
    if let Ok(mut guard) = CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.wait();
        }
    }
}
