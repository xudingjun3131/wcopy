// Windows-only helpers: capture foreground window (for paste focus restore),
// resolve the active app process name, and send Ctrl+V via native SendInput.
// This is the speed-critical path — no PowerShell, microseconds-level.
use std::ffi::c_void;
use std::time::Duration;

use windows::Win32::Foundation::*;
use windows::Win32::System::ProcessStatus::*;
use windows::Win32::System::Threading::*;
use windows::Win32::UI::Input::KeyboardAndMouse::*;
use windows::Win32::UI::WindowsAndMessaging::*;

/// Returns the current foreground window handle as `isize` (0 if none).
pub fn get_foreground_window() -> isize {
    unsafe { GetForegroundWindow().0 as isize }
}

/// Returns the process name (e.g. "notepad") of the foreground window.
pub fn get_active_app_name() -> String {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return String::new();
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let handle = match OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            BOOL(0),
            pid,
        ) {
            Ok(h) => h,
            Err(_) => return String::new(),
        };
        if handle.is_invalid() {
            return String::new();
        }
        let mut buf = [0u16; 260];
        let n = GetModuleBaseNameW(handle, None, &mut buf);
        let _ = CloseHandle(handle);
        if n == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..n as usize])
            .trim_end_matches('\0')
            .to_string()
    }
}

fn key_input(vk: VIRTUAL_KEY, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// Restores focus to the original app (the window captured when the popup was opened)
/// and sends Ctrl+V. This is what makes "double-click to paste" land in the right place.
pub fn send_ctrl_v(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    unsafe {
        let target = HWND(hwnd as *mut c_void);
        let fore = GetForegroundWindow();
        let mut ft = 0u32;
        GetWindowThreadProcessId(fore, Some(&mut ft));
        let self_t = GetCurrentThreadId();

        // Attach our thread input to the foreground thread so SetForegroundWindow
        // is allowed to steal focus (Windows "foreground lock" restriction).
        let _ = AttachThreadInput(ft, self_t, BOOL(1));
        let _ = SetForegroundWindow(target);
        let _ = AttachThreadInput(ft, self_t, BOOL(0));

        // Brief settle so the target window is actually foreground before we type.
        std::thread::sleep(Duration::from_millis(40));

        let vk_v: VIRTUAL_KEY = VIRTUAL_KEY(0x56);
        let inputs = [
            key_input(VK_CONTROL, 0),
            key_input(vk_v, 0),
            key_input(vk_v, KEYEVENTF_KEYUP.0),
            key_input(VK_CONTROL, KEYEVENTF_KEYUP.0),
        ];
        let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}
