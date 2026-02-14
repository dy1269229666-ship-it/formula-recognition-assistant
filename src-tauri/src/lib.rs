mod commands;

use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Initialize store with defaults
            let store = app.store("config.json")?;
            if store.get("simpletex_token").is_none() {
                store.set("simpletex_token", serde_json::json!(""));
            }
            if store.get("siliconflow_key").is_none() {
                store.set("siliconflow_key", serde_json::json!(""));
            }
            if store.get("voucher_models").is_none() {
                store.set("voucher_models", serde_json::json!([]));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::test_simpletex,
            commands::test_siliconflow,
            commands::get_available_models,
            commands::get_sf_balance,
            commands::recognize,
            commands::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
