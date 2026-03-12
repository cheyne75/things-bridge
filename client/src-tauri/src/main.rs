// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::Url;

fn config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("things-bridge-client");
    fs::create_dir_all(&config_dir).ok();
    config_dir.join("config.json")
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct AppConfig {
    server_url: Option<String>,
}

fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

fn save_config(config: &AppConfig) {
    let path = config_path();
    if let Ok(data) = serde_json::to_string_pretty(config) {
        fs::write(path, data).ok();
    }
}

#[tauri::command]
fn get_server_url() -> Option<String> {
    load_config().server_url
}

#[tauri::command]
fn check_server(url: String) -> bool {
    let health_url = format!("{}/health", url.trim_end_matches('/'));
    reqwest::blocking::get(&health_url)
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

#[tauri::command]
fn connect_to_server(url: String, window: tauri::WebviewWindow) -> Result<(), String> {
    let mut config = load_config();
    config.server_url = Some(url.clone());
    save_config(&config);

    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    window.navigate(parsed).map_err(|e| e.to_string())
}

fn navigate_to_setup(app_handle: &tauri::AppHandle) {
    let mut config = load_config();
    config.server_url = None;
    save_config(&config);

    if let Some(window) = app_handle.get_webview_window("main") {
        let asset_url: Url = "tauri://localhost".parse().unwrap();
        window.navigate(asset_url).ok();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let change_server = MenuItemBuilder::with_id("change_server", "Change Server...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&change_server)
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id().as_ref() == "change_server" {
                    navigate_to_setup(app_handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_url,
            check_server,
            connect_to_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
