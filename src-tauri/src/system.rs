use std::os::windows::process::CommandExt;
use std::process::Command;
use windows::core::{w, HSTRING, PCWSTR};
use windows::Devices::Radios::{Radio, RadioState};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, REG_SZ, RRF_RT_REG_DWORD,
    RRF_RT_REG_SZ,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetExitCodeProcess, OpenProcess, OpenProcessToken, WaitForSingleObject, PROCESS_SYNCHRONIZE,
};
use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
use windows::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNORMAL};

pub const MINIMIZED_ARG: &str = "--minimized";
const WAIT_PID_ARG: &str = "--wait-pid=";
const TASK_NAME: &str = "MACM KeyBridge";
const RUN_KEY: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
const RUN_VALUE: PCWSTR = w!("MACM KeyBridge");
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn is_elevated() -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

pub fn wait_for_previous_instance() {
    let Some(pid) = std::env::args().find_map(|a| a.strip_prefix(WAIT_PID_ARG).and_then(|p| p.parse::<u32>().ok())) else {
        return;
    };
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            WaitForSingleObject(handle, 10_000);
            let _ = CloseHandle(handle);
        }
    }
}

fn exe_path() -> Result<String, String> {
    std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).map_err(|e| e.to_string())
}

fn shell_execute(verb: PCWSTR, file: &str, params: &str, show: i32, wait: bool) -> Result<u32, String> {
    let file = HSTRING::from(file);
    let params = HSTRING::from(params);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        lpVerb: verb,
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(params.as_ptr()),
        nShow: show,
        ..Default::default()
    };
    unsafe {
        ShellExecuteExW(&mut info).map_err(|e| e.message())?;
        let mut code = 0u32;
        if !info.hProcess.is_invalid() {
            if wait {
                WaitForSingleObject(info.hProcess, 30_000);
                let _ = GetExitCodeProcess(info.hProcess, &mut code);
            }
            let _ = CloseHandle(info.hProcess);
        }
        Ok(code)
    }
}

pub fn relaunch_as_admin() -> Result<(), String> {
    let params = format!("{WAIT_PID_ARG}{}", std::process::id());
    shell_execute(w!("runas"), &exe_path()?, &params, SW_SHOWNORMAL.0, false).map(|_| ())
}

fn run_entry_exists() -> bool {
    let mut size = 0u32;
    unsafe { RegGetValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE, RRF_RT_REG_SZ, None, None, Some(&mut size)).is_ok() }
}

fn set_run_entry(on: bool) -> Result<(), String> {
    unsafe {
        if on {
            let value: Vec<u16> = format!("\"{}\" {MINIMIZED_ARG}", exe_path()?).encode_utf16().chain(Some(0)).collect();
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                RUN_KEY,
                RUN_VALUE,
                REG_SZ.0,
                Some(value.as_ptr() as *const _),
                (value.len() * 2) as u32,
            )
            .ok()
            .map_err(|e| e.message())
        } else {
            let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE);
            Ok(())
        }
    }
}

fn task_exists() -> bool {
    Command::new("schtasks")
        .args(["/Query", "/TN", TASK_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn create_task() -> Result<(), String> {
    let user = format!(
        "{}\\{}",
        std::env::var("USERDOMAIN").unwrap_or_default(),
        std::env::var("USERNAME").map_err(|e| e.to_string())?
    );
    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Author>MACM KeyBridge</Author><Description>Starts MACM KeyBridge at logon</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>{exe}</Command><Arguments>{MINIMIZED_ARG}</Arguments></Exec></Actions>
</Task>"#,
        user = xml_escape(&user),
        exe = xml_escape(&exe_path()?),
    );
    let path = std::env::temp_dir().join(format!("macm-keybridge-task-{}.xml", std::process::id()));
    let mut bytes = vec![0xFF, 0xFE];
    bytes.extend(xml.encode_utf16().flat_map(|u| u.to_le_bytes()));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let params = format!("/Create /F /TN \"{TASK_NAME}\" /XML \"{}\"", path.display());
    let result = shell_execute(w!("runas"), "schtasks.exe", &params, SW_HIDE.0, true);
    let _ = std::fs::remove_file(&path);
    match result? {
        0 => Ok(()),
        code => Err(format!("schtasks exit code {code}")),
    }
}

fn delete_task() -> Result<(), String> {
    let params = format!("/Delete /F /TN \"{TASK_NAME}\"");
    match shell_execute(w!("runas"), "schtasks.exe", &params, SW_HIDE.0, true)? {
        0 => Ok(()),
        code => Err(format!("schtasks exit code {code}")),
    }
}

pub fn autostart_mode() -> &'static str {
    if task_exists() {
        "admin"
    } else if run_entry_exists() {
        "user"
    } else {
        "off"
    }
}

pub fn set_autostart(mode: &str) -> Result<&'static str, String> {
    let current = autostart_mode();
    match mode {
        "off" => {
            set_run_entry(false)?;
            if current == "admin" {
                delete_task()?;
            }
        }
        "user" => {
            if current == "admin" {
                delete_task()?;
            }
            set_run_entry(true)?;
        }
        "admin" => {
            create_task()?;
            set_run_entry(false)?;
        }
        _ => return Err("invalid mode".into()),
    }
    Ok(autostart_mode())
}

pub fn airplane_mode() -> Option<bool> {
    let mut value = 0u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!("SYSTEM\\CurrentControlSet\\Control\\RadioManagement\\SystemRadioState"),
            PCWSTR::null(),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut _),
            Some(&mut size),
        )
        .ok()
        .ok()?;
    }
    Some(value == 1)
}

pub struct RadioSnapshot(Vec<(String, bool)>);

pub fn radio_snapshot() -> Option<RadioSnapshot> {
    let radios = Radio::GetRadiosAsync().ok()?.get().ok()?;
    let mut list = Vec::new();
    for i in 0..radios.Size().ok()? {
        let radio = radios.GetAt(i).ok()?;
        let name = radio.Name().map(|n| n.to_string()).unwrap_or_default();
        list.push((name, radio.State().ok()? == RadioState::On));
    }
    Some(RadioSnapshot(list))
}

pub fn restore_radios(previous: &RadioSnapshot) -> usize {
    let _ = Radio::RequestAccessAsync().and_then(|op| op.get());
    let Some(radios) = Radio::GetRadiosAsync().ok().and_then(|op| op.get().ok()) else {
        return 0;
    };
    let mut restored = 0;
    for i in 0..radios.Size().unwrap_or(0) {
        let Ok(radio) = radios.GetAt(i) else { continue };
        let name = radio.Name().map(|n| n.to_string()).unwrap_or_default();
        let was_on = previous.0.iter().any(|(n, on)| *on && *n == name);
        if was_on && radio.State().ok() != Some(RadioState::On) {
            let ok = radio.SetStateAsync(RadioState::On).and_then(|op| op.get()).is_ok();
            if ok && radio.State().ok() == Some(RadioState::On) {
                restored += 1;
            }
        }
    }
    restored
}
