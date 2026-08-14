#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, sync::Mutex};
use tauri::{path::BaseDirectory, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct ApiSidecar(Mutex<Option<CommandChild>>);

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ApiSidecar(Mutex::new(None)))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let server_entry = app
                .path()
                .resolve("server/desktop.mjs", BaseDirectory::Resource)?;
            let migrations_dir = app.path().resolve("migrations", BaseDirectory::Resource)?;
            let database_path = data_dir.join("house-infrastructure.sqlite");

            let (mut events, child) = app
                .shell()
                .sidecar("house-studio-node")?
                .arg(server_entry)
                .env("PORT", "4281")
                .env("HOUSE_INFRASTRUCTURE_DESKTOP", "1")
                .env("HOUSE_INFRASTRUCTURE_DB_PATH", database_path)
                .env("HOUSE_INFRASTRUCTURE_MIGRATIONS_DIR", migrations_dir)
                .spawn()?;

            *app.state::<ApiSidecar>()
                .0
                .lock()
                .expect("sidecar state lock") = Some(child);
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            println!("[local-api] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Stderr(bytes) => {
                            eprintln!("[local-api] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Error(error) => eprintln!("[local-api] {error}"),
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[local-api] exited: {:?}", payload.code)
                        }
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build House Infrastructure Studio");

    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(child) = handle
                .state::<ApiSidecar>()
                .0
                .lock()
                .expect("sidecar state lock")
                .take()
            {
                let _ = child.kill();
            }
        }
    });
}
