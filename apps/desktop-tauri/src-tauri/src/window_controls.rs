//! The window buttons a Windows workspace draws itself.
//!
//! On Windows the workspace window is built without the system title bar (`workspace_builder`),
//! so the page draws close, minimize and maximize beside its bell and calls these. Each acts only
//! on the window of the trusted workspace that called it.

use crate::workspace_windows::require_workspace;

#[tauri::command]
pub(crate) fn window_minimize(caller: tauri::Webview) -> Result<(), String> {
    require_workspace(&caller)?;
    caller
        .window()
        .minimize()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn window_toggle_maximize(caller: tauri::Webview) -> Result<(), String> {
    require_workspace(&caller)?;
    let window = caller.window();
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    if maximized {
        window.unmaximize()
    } else {
        window.maximize()
    }
    .map_err(|error| error.to_string())
}

/// A close request, not a destroy: the window's close handlers (save, last-window quit) still run.
#[tauri::command]
pub(crate) fn window_close(caller: tauri::Webview) -> Result<(), String> {
    require_workspace(&caller)?;
    caller.window().close().map_err(|error| error.to_string())
}
