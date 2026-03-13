// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::time::Duration;

fn http_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new())
}

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
    mac_address: Option<String>,
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
fn save_server_url(url: String) {
    let mut config = load_config();
    config.server_url = Some(url);
    save_config(&config);
}

#[tauri::command]
fn check_server(url: String) -> bool {
    let health_url = format!("{}/health", url.trim_end_matches('/'));
    http_client()
        .get(&health_url)
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn send_wol(mac: &str) -> Result<(), String> {
    let mac_str = mac.replace([':', '-'], "");
    if mac_str.len() != 12 {
        return Err("Invalid MAC address".into());
    }
    let mut mac_bytes = [0u8; 6];
    for i in 0..6 {
        mac_bytes[i] =
            u8::from_str_radix(&mac_str[i * 2..i * 2 + 2], 16).map_err(|e| e.to_string())?;
    }

    let mut packet = [0u8; 102];
    packet[..6].fill(0xFF);
    for i in 0..16 {
        let offset = 6 + i * 6;
        packet[offset..offset + 6].copy_from_slice(&mac_bytes);
    }

    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.set_broadcast(true).map_err(|e| e.to_string())?;
    socket
        .send_to(&packet, "255.255.255.255:9")
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn wake_server(mac_address: String) -> Result<(), String> {
    send_wol(&mac_address)
}

#[tauri::command]
fn fetch_server_mac(url: String) -> Option<String> {
    let mac_url = format!("{}/mac", url.trim_end_matches('/'));
    let resp = http_client().get(&mac_url).send().ok()?;
    let json: serde_json::Value = resp.json().ok()?;
    json["mac"].as_str().map(|s| s.to_string())
}

#[tauri::command]
fn get_mac_address() -> Option<String> {
    load_config().mac_address
}

#[tauri::command]
fn save_mac_address(mac_address: String) {
    let mut config = load_config();
    config.mac_address = if mac_address.is_empty() {
        None
    } else {
        Some(mac_address)
    };
    save_config(&config);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_server_url,
            save_server_url,
            check_server,
            wake_server,
            fetch_server_mac,
            get_mac_address,
            save_mac_address
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
