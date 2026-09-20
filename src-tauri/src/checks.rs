use crate::radio;
use serde::Serialize;
use windows::core::{w, PCWSTR};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Registry::{
    RegGetValueW, HKEY_LOCAL_MACHINE, REG_ROUTINE_FLAGS, RRF_RT_REG_BINARY, RRF_RT_REG_MULTI_SZ, RRF_RT_REG_SZ,
};
use windows::Win32::UI::Accessibility::{FILTERKEYS, SKF_STICKYKEYSON, STICKYKEYS};
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_GETFILTERKEYS, SPI_GETSTICKYKEYS, SPI_SETFILTERKEYS,
    SPI_SETSTICKYKEYS,
};

const KEYBOARD_CLASS: PCWSTR = w!(r"SYSTEM\CurrentControlSet\Control\Class\{4D36E96B-E325-11CE-BFC1-08002BE10318}");
const KEYBOARD_LAYOUT: PCWSTR = w!(r"SYSTEM\CurrentControlSet\Control\Keyboard Layout");
const BIOS_KEY: PCWSTR = w!(r"HARDWARE\DESCRIPTION\System\BIOS");
const FKF_FILTERKEYSON: u32 = 1;

const KNOWN_REMAPPERS: [&str; 7] = [
    "autohotkey.exe",
    "powertoys.keyboardmanagerengine.exe",
    "sharpkeys.exe",
    "keytweak.exe",
    "keyboard manager.exe",
    "interception.exe",
    "luamacros.exe",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: &'static str,
    pub level: &'static str,
    pub value: String,
    pub fix: Option<&'static str>,
}

fn filter_keys() -> Option<FILTERKEYS> {
    let mut fk = FILTERKEYS { cbSize: std::mem::size_of::<FILTERKEYS>() as u32, ..Default::default() };
    unsafe {
        SystemParametersInfoW(SPI_GETFILTERKEYS, fk.cbSize, Some(&mut fk as *mut _ as *mut _), Default::default()).ok()?;
    }
    Some(fk)
}

fn sticky_keys() -> Option<STICKYKEYS> {
    let mut sk = STICKYKEYS { cbSize: std::mem::size_of::<STICKYKEYS>() as u32, ..Default::default() };
    unsafe {
        SystemParametersInfoW(SPI_GETSTICKYKEYS, sk.cbSize, Some(&mut sk as *mut _ as *mut _), Default::default()).ok()?;
    }
    Some(sk)
}

pub fn set_filter_keys(on: bool) -> Result<(), String> {
    let mut fk = filter_keys().ok_or("cannot read filter keys")?;
    fk.dwFlags = if on { fk.dwFlags | FKF_FILTERKEYSON } else { fk.dwFlags & !FKF_FILTERKEYSON };
    unsafe {
        SystemParametersInfoW(SPI_SETFILTERKEYS, fk.cbSize, Some(&mut fk as *mut _ as *mut _), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
            .map_err(|e| e.message())
    }
}

pub fn set_sticky_keys(on: bool) -> Result<(), String> {
    let mut sk = sticky_keys().ok_or("cannot read sticky keys")?;
    sk.dwFlags = if on { sk.dwFlags | SKF_STICKYKEYSON } else { sk.dwFlags & !SKF_STICKYKEYSON };
    unsafe {
        SystemParametersInfoW(SPI_SETSTICKYKEYS, sk.cbSize, Some(&mut sk as *mut _ as *mut _), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
            .map_err(|e| e.message())
    }
}

fn value_exists(key: PCWSTR, value: PCWSTR, kind: REG_ROUTINE_FLAGS) -> bool {
    let mut size = 0u32;
    unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, key, value, kind, None, None, Some(&mut size)).is_ok() && size > 0 }
}

fn multi_sz(key: PCWSTR, value: PCWSTR) -> Vec<String> {
    let mut buf = [0u16; 512];
    let mut size = (buf.len() * 2) as u32;
    let ok = unsafe {
        RegGetValueW(HKEY_LOCAL_MACHINE, key, value, RRF_RT_REG_MULTI_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut size))
            .is_ok()
    };
    if !ok {
        return Vec::new();
    }
    buf[..(size as usize / 2).min(buf.len())]
        .split(|&c| c == 0)
        .filter(|s| !s.is_empty())
        .map(String::from_utf16_lossy)
        .collect()
}

fn reg_sz(root: windows::Win32::System::Registry::HKEY, key: PCWSTR, value: PCWSTR) -> String {
    let mut buf = [0u16; 256];
    let mut size = (buf.len() * 2) as u32;
    let ok = unsafe {
        RegGetValueW(root, key, value, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut size)).is_ok()
    };
    if !ok {
        return String::new();
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

fn running_remappers() -> Vec<String> {
    let mut found = Vec::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return found;
        };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        while Process32NextW(snapshot, &mut entry).is_ok() {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
            let lower = name.to_lowercase();
            if KNOWN_REMAPPERS.contains(&lower.as_str()) && !found.contains(&name) {
                found.push(name);
            }
        }
    }
    found
}

pub fn run() -> Vec<Check> {
    let mut checks = Vec::new();

    let fk_on = filter_keys().map(|f| f.dwFlags & FKF_FILTERKEYSON != 0).unwrap_or(false);
    checks.push(Check {
        id: "filterKeys",
        level: if fk_on { "warn" } else { "ok" },
        value: String::new(),
        fix: fk_on.then_some("filterKeys"),
    });

    let sk_on = sticky_keys().map(|s| s.dwFlags.0 & SKF_STICKYKEYSON.0 != 0).unwrap_or(false);
    checks.push(Check {
        id: "stickyKeys",
        level: if sk_on { "warn" } else { "ok" },
        value: String::new(),
        fix: sk_on.then_some("stickyKeys"),
    });

    let remap = value_exists(KEYBOARD_LAYOUT, w!("Scancode Map"), RRF_RT_REG_BINARY);
    checks.push(Check { id: "scancodeMap", level: if remap { "warn" } else { "ok" }, value: String::new(), fix: None });

    let filters: Vec<String> =
        multi_sz(KEYBOARD_CLASS, w!("UpperFilters")).into_iter().filter(|f| !f.eq_ignore_ascii_case("kbdclass")).collect();
    checks.push(Check {
        id: "keyboardFilters",
        level: if filters.is_empty() { "ok" } else { "warn" },
        value: filters.join(", "),
        fix: None,
    });

    let apps = running_remappers();
    checks.push(Check {
        id: "otherApps",
        level: if apps.is_empty() { "ok" } else { "warn" },
        value: apps.join(", "),
        fix: None,
    });

    let keyboards = radio::keyboards();
    let disabled: Vec<String> = keyboards.iter().filter(|k| !k.enabled).map(|k| k.name.clone()).collect();
    checks.push(Check {
        id: "keyboards",
        level: if disabled.is_empty() { "ok" } else { "warn" },
        value: if disabled.is_empty() { keyboards.len().to_string() } else { disabled.join(", ") },
        fix: None,
    });

    let bios = format!(
        "{} {} · BIOS {} ({})",
        reg_sz(HKEY_LOCAL_MACHINE, BIOS_KEY, w!("SystemManufacturer")),
        reg_sz(HKEY_LOCAL_MACHINE, BIOS_KEY, w!("SystemProductName")),
        reg_sz(HKEY_LOCAL_MACHINE, BIOS_KEY, w!("BIOSVersion")),
        reg_sz(HKEY_LOCAL_MACHINE, BIOS_KEY, w!("BIOSReleaseDate"))
    );
    checks.push(Check { id: "firmware", level: "info", value: bios, fix: None });

    checks
}
