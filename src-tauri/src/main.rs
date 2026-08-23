#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::Mutex,
};
use tauri::{path::BaseDirectory, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct ApiSidecar(Mutex<Option<CommandChild>>);

fn append_startup_log(path: &Path, message: impl AsRef<str>) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", message.as_ref());
    }
}

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
            let startup_log = data_dir.join("desktop-startup.log");

            append_startup_log(&startup_log, "--- desktop startup ---");
            append_startup_log(
                &startup_log,
                format!("resource server: {}", server_entry.display()),
            );
            append_startup_log(
                &startup_log,
                format!("resource migrations: {}", migrations_dir.display()),
            );

            // The packaged sidecar is installed next to the Tauri executable. Resolve that
            // resource explicitly instead of relying on the plugin's relative sidecar lookup;
            // the latter can resolve against a different working directory in installed builds.
            let sidecar_path = app
                .path()
                .resolve("house-studio-node.exe", BaseDirectory::Resource)?;
            append_startup_log(
                &startup_log,
                format!(
                    "sidecar: {} (exists: {})",
                    sidecar_path.display(),
                    sidecar_path.is_file()
                ),
            );
            if !sidecar_path.is_file() {
                return Err(Box::new(tauri::Error::AssetNotFound(
                    sidecar_path.to_string_lossy().into_owned(),
                )));
            }

            let (mut events, child) = app
                .shell()
                .command(&sidecar_path)
                .arg(server_entry)
                .env("PORT", "4281")
                .env("HOUSE_INFRASTRUCTURE_DESKTOP", "1")
                .env("HOUSE_INFRASTRUCTURE_DB_PATH", database_path)
                .env("HOUSE_INFRASTRUCTURE_MIGRATIONS_DIR", migrations_dir)
                .spawn()
                .map_err(|error| {
                    append_startup_log(&startup_log, format!("sidecar spawn error: {error}"));
                    error
                })?;

            append_startup_log(&startup_log, "sidecar spawn succeeded");

            *app.state::<ApiSidecar>()
                .0
                .lock()
                .expect("sidecar state lock") = Some(child);
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let line =
                                format!("sidecar stdout: {}", String::from_utf8_lossy(&bytes));
                            append_startup_log(&startup_log, &line);
                            println!("[local-api] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Stderr(bytes) => {
                            let line =
                                format!("sidecar stderr: {}", String::from_utf8_lossy(&bytes));
                            append_startup_log(&startup_log, &line);
                            eprintln!("[local-api] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Error(error) => {
                            append_startup_log(&startup_log, format!("sidecar error: {error}"));
                            eprintln!("[local-api] {error}")
                        }
                        CommandEvent::Terminated(payload) => {
                            append_startup_log(
                                &startup_log,
                                format!("sidecar exited: {:?}", payload.code),
                            );
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
