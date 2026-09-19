use serde::Serialize;
use windows::core::{w, PCWSTR};
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_DevNode_Status, SetupDiCallClassInstaller, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
    SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW, SetupDiGetDeviceRegistryPropertyW, SetupDiSetClassInstallParamsW,
    CM_DEVNODE_STATUS_FLAGS, CM_PROB, CM_PROB_DISABLED, CR_SUCCESS, DICS_DISABLE, DICS_ENABLE, DICS_FLAG_GLOBAL,
    DIF_PROPERTYCHANGE, DIGCF_ALLCLASSES, DIGCF_PRESENT, HDEVINFO, SETUP_DI_REGISTRY_PROPERTY, SPDRP_CLASS, SPDRP_DEVICEDESC,
    SPDRP_FRIENDLYNAME, SPDRP_HARDWAREID, SP_CLASSINSTALL_HEADER, SP_DEVINFO_DATA, SP_PROPCHANGE_PARAMS,
};

// HID top-level collection "Wireless Radio Controls" (Generic Desktop page 0x01, usage 0x0C):
// the channel laptop keyboards use for the airplane-mode key, separate from normal keys.
const RADIO_HARDWARE_ID: &str = "HID_DEVICE_UP:0001_U:000C";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RadioDevice {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

struct DeviceSet(HDEVINFO);

impl Drop for DeviceSet {
    fn drop(&mut self) {
        unsafe {
            let _ = SetupDiDestroyDeviceInfoList(self.0);
        }
    }
}

fn multi_sz(buf: &[u8]) -> Vec<String> {
    let wide: Vec<u16> = buf.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    wide.split(|&c| c == 0).filter(|s| !s.is_empty()).map(String::from_utf16_lossy).collect()
}

unsafe fn property(set: &DeviceSet, data: &SP_DEVINFO_DATA, prop: SETUP_DI_REGISTRY_PROPERTY) -> Vec<String> {
    let mut size = 0u32;
    let _ = SetupDiGetDeviceRegistryPropertyW(set.0, data, prop, None, None, Some(&mut size));
    if size == 0 {
        return Vec::new();
    }
    let mut buf = vec![0u8; size as usize];
    if SetupDiGetDeviceRegistryPropertyW(set.0, data, prop, None, Some(&mut buf), None).is_err() {
        return Vec::new();
    }
    multi_sz(&buf)
}

unsafe fn instance_id(set: &DeviceSet, data: &SP_DEVINFO_DATA) -> Option<String> {
    let mut buf = [0u16; 512];
    SetupDiGetDeviceInstanceIdW(set.0, data, Some(&mut buf), None).ok()?;
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]))
}

unsafe fn is_enabled(data: &SP_DEVINFO_DATA) -> bool {
    let mut status = CM_DEVNODE_STATUS_FLAGS(0);
    let mut problem = CM_PROB(0);
    if CM_Get_DevNode_Status(&mut status, &mut problem, data.DevInst, 0) != CR_SUCCESS {
        return true;
    }
    problem != CM_PROB_DISABLED
}

fn for_each_device(
    enumerator: PCWSTR,
    matches: impl Fn(&[String], &[String]) -> bool,
    mut f: impl FnMut(&DeviceSet, &SP_DEVINFO_DATA, RadioDevice),
) {
    unsafe {
        let Ok(handle) = SetupDiGetClassDevsW(None, enumerator, None, DIGCF_PRESENT | DIGCF_ALLCLASSES) else {
            return;
        };
        let set = DeviceSet(handle);
        let mut index = 0;
        loop {
            let mut data = SP_DEVINFO_DATA { cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32, ..Default::default() };
            if SetupDiEnumDeviceInfo(set.0, index, &mut data).is_err() {
                break;
            }
            index += 1;
            let ids = property(&set, &data, SPDRP_HARDWAREID);
            let class = property(&set, &data, SPDRP_CLASS);
            if !matches(&ids, &class) {
                continue;
            }
            let Some(id) = instance_id(&set, &data) else { continue };
            let name = property(&set, &data, SPDRP_FRIENDLYNAME)
                .into_iter()
                .next()
                .or_else(|| property(&set, &data, SPDRP_DEVICEDESC).into_iter().next())
                .unwrap_or_else(|| id.clone());
            let device = RadioDevice { id, name, enabled: is_enabled(&data) };
            f(&set, &data, device);
        }
    }
}

fn for_each_radio(f: impl FnMut(&DeviceSet, &SP_DEVINFO_DATA, RadioDevice)) {
    for_each_device(w!("HID"), |ids, _| ids.iter().any(|id| id.eq_ignore_ascii_case(RADIO_HARDWARE_ID)), f);
}

pub fn keyboards() -> Vec<RadioDevice> {
    let mut devices = Vec::new();
    for_each_device(PCWSTR::null(), |_, class| class.iter().any(|c| c.eq_ignore_ascii_case("Keyboard")), |_, _, d| {
        devices.push(d)
    });
    devices
}

pub fn list() -> Vec<RadioDevice> {
    let mut devices = Vec::new();
    for_each_radio(|_, _, d| devices.push(d));
    devices
}

// Requires administrator rights; the change is global and survives reboots until reverted.
pub fn set_enabled(ids: &[String], enable: bool) -> Vec<String> {
    let mut changed = Vec::new();
    for_each_radio(|set, data, device| {
        if !ids.iter().any(|id| id.eq_ignore_ascii_case(&device.id)) || device.enabled == enable {
            return;
        }
        let params = SP_PROPCHANGE_PARAMS {
            ClassInstallHeader: SP_CLASSINSTALL_HEADER {
                cbSize: std::mem::size_of::<SP_CLASSINSTALL_HEADER>() as u32,
                InstallFunction: DIF_PROPERTYCHANGE,
            },
            StateChange: if enable { DICS_ENABLE } else { DICS_DISABLE },
            Scope: DICS_FLAG_GLOBAL,
            HwProfile: 0,
        };
        let ok = unsafe {
            SetupDiSetClassInstallParamsW(
                set.0,
                Some(data),
                Some(&params.ClassInstallHeader),
                std::mem::size_of::<SP_PROPCHANGE_PARAMS>() as u32,
            )
            .is_ok()
                && SetupDiCallClassInstaller(DIF_PROPERTYCHANGE, set.0, Some(data)).is_ok()
        };
        if ok {
            changed.push(device.id);
        }
    });
    changed
}
