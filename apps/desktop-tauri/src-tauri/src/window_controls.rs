//! The window buttons a Windows workspace draws itself.
//!
//! On Windows the workspace window is built without the system title bar (`workspace_builder`),
//! so the page draws close, minimize and maximize beside its bell and calls this. It acts only on
//! the window of the trusted workspace that called it.

use crate::workspace_windows::require_workspace;

/// `close` is a close request, not a destroy: the window's close handlers (save, last-window
/// quit) still run.
#[tauri::command]
pub(crate) fn window_control(caller: tauri::Webview, action: String) -> Result<(), String> {
    require_workspace(&caller)?;
    let window = caller.window();
    match action.as_str() {
        "minimize" => window.minimize(),
        "toggle_maximize" => {
            if window.is_maximized().map_err(|error| error.to_string())? {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        "close" => window.close(),
        other => return Err(format!("unknown window action: {other}")),
    }
    .map_err(|error| error.to_string())
}
