use crate::config::Substitution;
use serde::Serialize;
use windows::core::{w, PCWSTR};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_LOCAL_MACHINE, REG_BINARY, RRF_RT_REG_BINARY,
};
use windows::Win32::System::SystemInformation::GetTickCount64;
use windows::Win32::UI::Input::KeyboardAndMouse::{MapVirtualKeyW, MAPVK_VK_TO_VSC};

const KEYBOARD_LAYOUT: PCWSTR = w!(r"SYSTEM\CurrentControlSet\Control\Keyboard Layout");
const SCANCODE_MAP: PCWSTR = w!("Scancode Map");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemapStatus {
    pub applied: bool,
    pub pending_reboot: bool,
    pub foreign: bool,
}

fn code(scan: u16, ext: bool) -> u16 {
    if ext {
        0xE000 | (scan & 0xFF)
    } else {
        scan
    }
}

// Windows' Scancode Map: 8 zero bytes, entry count (mappings + 1), then one DWORD per mapping
// with the new scancode in the high word, and a zero DWORD terminator.
pub fn build(subs: &[Substitution]) -> Vec<u8> {
    let mut bytes = vec![0u8; 8];
    bytes.extend(((subs.len() + 1) as u32).to_le_bytes());
    for sub in subs {
        bytes.extend(code(sub.from_scan, sub.from_ext).to_le_bytes());
        bytes.extend(code(sub.to_scan, sub.to_ext).to_le_bytes());
    }
    bytes.extend(0u32.to_le_bytes());
    bytes
}

pub fn current() -> Option<Vec<u8>> {
    let mut size = 0u32;
    unsafe {
        RegGetValueW(HKEY_LOCAL_MACHINE, KEYBOARD_LAYOUT, SCANCODE_MAP, RRF_RT_REG_BINARY, None, None, Some(&mut size)).ok().ok()?;
    }
    if size == 0 {
        return None;
    }
    let mut buf = vec![0u8; size as usize];
    unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            KEYBOARD_LAYOUT,
            SCANCODE_MAP,
            RRF_RT_REG_BINARY,
            None,
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut size),
        )
        .ok()
        .ok()?;
    }
    buf.truncate(size as usize);
    Some(buf)
}

// Entries in the mapping DWORDs are (new << 16) | old, so a mapping is stored as two u16.
pub fn write(subs: &[Substitution]) -> Result<(), String> {
    if subs.is_empty() {
        unsafe {
            let _ = RegDeleteKeyValueW(HKEY_LOCAL_MACHINE, KEYBOARD_LAYOUT, SCANCODE_MAP);
        }
        return Ok(());
    }
    let bytes = build(subs);
    unsafe {
        RegSetKeyValueW(
            HKEY_LOCAL_MACHINE,
            KEYBOARD_LAYOUT,
            SCANCODE_MAP,
            REG_BINARY.0,
            Some(bytes.as_ptr() as *const _),
            bytes.len() as u32,
        )
        .ok()
        .map_err(|e| e.message())
    }
}

fn boot_unix_secs() -> u64 {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let uptime = unsafe { GetTickCount64() } / 1000;
    now.saturating_sub(uptime)
}

pub fn status(subs: &[Substitution], written_at: u64) -> RemapStatus {
    let map = current();
    let matches_ours = match (&map, subs.is_empty()) {
        (None, true) => true,
        (Some(bytes), false) => *bytes == build(subs),
        _ => false,
    };
    RemapStatus {
        applied: matches_ours && !subs.is_empty() && written_at > 0 && written_at < boot_unix_secs(),
        pending_reboot: matches_ours && !subs.is_empty() && (written_at == 0 || written_at >= boot_unix_secs()),
        foreign: map.is_some() && !matches_ours,
    }
}

pub fn scan_for_vk(vk: u16) -> u16 {
    unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC) as u16 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(from: u16, from_ext: bool, to: u16) -> Substitution {
        Substitution { from_scan: from, from_ext, to_scan: to, to_ext: false, label: String::new() }
    }

    #[test]
    fn builds_the_documented_layout() {
        let bytes = build(&[sub(0x45, false, 0x12)]);
        assert_eq!(bytes.len(), 8 + 4 + 4 + 4);
        assert_eq!(&bytes[..8], &[0u8; 8]);
        assert_eq!(&bytes[8..12], &2u32.to_le_bytes());
        assert_eq!(&bytes[12..16], &[0x45, 0x00, 0x12, 0x00]);
        assert_eq!(&bytes[16..], &0u32.to_le_bytes());
    }

    #[test]
    fn extended_keys_get_the_e0_prefix() {
        let bytes = build(&[sub(0x52, true, 0x20)]);
        assert_eq!(&bytes[12..16], &[0x52, 0xE0, 0x20, 0x00]);
    }

    #[test]
    fn empty_list_still_builds_a_valid_terminator() {
        let bytes = build(&[]);
        assert_eq!(bytes.len(), 16);
        assert_eq!(&bytes[8..12], &1u32.to_le_bytes());
    }
}
