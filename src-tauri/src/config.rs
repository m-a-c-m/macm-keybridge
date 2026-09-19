use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MAX_RULES: usize = 32;
const MODIFIER_VKS: [u16; 8] = [0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub vk: u16,
    pub scan: u16,
    pub ext: bool,
    #[serde(default)]
    pub companions: Vec<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub active: bool,
    pub rules: Vec<Rule>,
    pub pause_hotkey: Option<String>,
    pub start_minimized: bool,
    pub radio_block: bool,
    pub radio_disabled_ids: Vec<String>,
    pub onboarded: bool,
    pub notifications: bool,
    pub language: String,
    pub theme: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            active: true,
            rules: Vec::new(),
            pause_hotkey: Some("Ctrl+Alt+B".into()),
            start_minimized: false,
            radio_block: false,
            radio_disabled_ids: Vec::new(),
            onboarded: false,
            notifications: true,
            language: "es".into(),
            theme: "dark".into(),
        }
    }
}

impl Config {
    pub fn validate(mut self) -> Result<Self, String> {
        if self.rules.len() > MAX_RULES {
            return Err(format!("too many rules (max {MAX_RULES})"));
        }
        for rule in &mut self.rules {
            if rule.vk == 0 || rule.vk > 0xFE {
                return Err(format!("invalid key code {}", rule.vk));
            }
            if rule.scan > 0x1FF {
                return Err(format!("invalid scan code {}", rule.scan));
            }
            if rule.companions.len() > 4
                || rule.companions.iter().any(|c| !MODIFIER_VKS.contains(c) || *c == rule.vk)
            {
                return Err("combination keys must be modifiers".into());
            }
            rule.companions.dedup();
            rule.id = rule.id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
            rule.name = rule.name.trim().chars().take(60).collect();
            if rule.id.is_empty() {
                return Err("rule id required".into());
            }
        }
        if let Some(hotkey) = &self.pause_hotkey {
            if hotkey.len() > 60 || hotkey.trim().is_empty() {
                self.pause_hotkey = None;
            }
        }
        self.radio_disabled_ids.retain(|id| !id.is_empty() && id.len() < 400);
        self.radio_disabled_ids.truncate(16);
        if !matches!(self.language.as_str(), "es" | "en") {
            self.language = "es".into();
        }
        if !matches!(self.theme.as_str(), "dark" | "light" | "system") {
            self.theme = "dark".into();
        }
        Ok(self)
    }
}

pub struct Store {
    path: PathBuf,
}

impl Store {
    pub fn default_dir() -> Option<PathBuf> {
        std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join(crate::IDENTIFIER))
    }

    pub fn new(dir: &Path) -> Self {
        let _ = std::fs::create_dir_all(dir);
        Self { path: dir.join("config.json") }
    }

    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    pub fn load(&self) -> Config {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str::<Config>(&s).ok())
            .and_then(|c| c.validate().ok())
            .unwrap_or_default()
    }

    pub fn save(&self, config: &Config) -> Result<(), String> {
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())
    }
}
