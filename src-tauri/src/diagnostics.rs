use crate::config::Config;
use crate::hook::Observed;
use crate::radio::{self, RadioDevice};
use std::fmt::Write;
use std::path::Path;

pub struct Report {
    pub version: String,
    pub elevated: bool,
    pub hook_ok: bool,
    pub blocking: bool,
    pub config: Config,
    pub radios: Vec<RadioDevice>,
    pub autostart: &'static str,
    pub events: Vec<Observed>,
}

fn device_line(out: &mut String, d: &RadioDevice) {
    let _ = writeln!(out, "  - {} [{}] {}", d.name, if d.enabled { "enabled" } else { "DISABLED" }, d.id);
}

fn render(r: &Report) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "MACM KeyBridge diagnostic report");
    let _ = writeln!(out, "================================");
    let _ = writeln!(out, "App version:      {}", r.version);
    let _ = writeln!(out, "Windows:          {}", crate::system::os_description());
    let _ = writeln!(out, "Administrator:    {}", r.elevated);
    let _ = writeln!(out, "Keyboard hook:    {}", if r.hook_ok { "running" } else { "FAILED" });
    let _ = writeln!(out, "Blocking now:     {}", r.blocking);
    let _ = writeln!(out, "Autostart:        {}", r.autostart);
    let _ = writeln!(out, "Airplane mode:    {:?}", crate::system::airplane_mode());
    let _ = writeln!(out, "Airplane key off: {} (managed ids: {:?})", r.config.radio_block, r.config.radio_disabled_ids);
    let _ = writeln!(out, "\nBridge keys:");
    if r.config.rules.is_empty() {
        let _ = writeln!(out, "  (none)");
    }
    for rule in &r.config.rules {
        let _ = writeln!(
            out,
            "  - {} vk=0x{:02X} scan=0x{:02X} ext={} companions={:02X?} enabled={}",
            rule.name, rule.vk, rule.scan, rule.ext, rule.companions, rule.enabled
        );
    }
    let _ = writeln!(out, "\nKeyboards:");
    for d in radio::keyboards() {
        device_line(&mut out, &d);
    }
    let _ = writeln!(out, "\nAirplane-mode (radio) controls:");
    if r.radios.is_empty() {
        let _ = writeln!(out, "  (none found)");
    }
    for d in &r.radios {
        device_line(&mut out, d);
    }
    let _ = writeln!(out, "\nKey events from the last keyboard test ({}):", r.events.len());
    let _ = writeln!(out, "  time_ms  dir   vk    scan  ext inj blocked");
    let mut last: Option<&Observed> = None;
    let mut repeats = 0;
    for e in &r.events {
        if let Some(prev) = last {
            if prev.vk == e.vk && prev.down && e.down && prev.blocked == e.blocked {
                repeats += 1;
                continue;
            }
        }
        if repeats > 0 {
            let _ = writeln!(out, "           (+{repeats} repeats)");
            repeats = 0;
        }
        let _ = writeln!(
            out,
            "  {:>7}  {:<4}  0x{:02X}  0x{:02X}  {}   {}   {}",
            e.t,
            if e.down { "DOWN" } else { "UP" },
            e.vk,
            e.scan,
            e.ext as u8,
            e.injected as u8,
            e.blocked as u8
        );
        last = Some(e);
    }
    if repeats > 0 {
        let _ = writeln!(out, "           (+{repeats} repeats)");
    }
    out
}

pub fn write(report: &Report, dir: &Path) -> Result<String, String> {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let path = dir.join(format!("KeyBridge-diagnostico-{secs}.txt"));
    std::fs::write(&path, render(report).replace('\n', "\r\n")).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
