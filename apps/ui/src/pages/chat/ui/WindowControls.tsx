import { Minus, Plus, X } from 'lucide-react'
import { IS_WINDOWS, isDesktop } from '@localixai/kit/environment'
import { tauriInvoke, type InvokeFn } from '@/shared/lib/tauri'

const BUTTONS = [
  { command: 'window_close', label: 'Close window', fill: 'bg-status-error', Glyph: X },
  { command: 'window_minimize', label: 'Minimize window', fill: 'bg-status-warning', Glyph: Minus },
  {
    command: 'window_toggle_maximize',
    label: 'Maximize window',
    fill: 'bg-status-success',
    Glyph: Plus,
  },
] as const

/**
 * Close, minimize and maximize as three round lights, drawn beside the bell where the Windows
 * shell has no system title bar. The glyphs show while the pointer is over the group, as on macOS.
 */
export function WindowControls({ invoke }: { invoke: InvokeFn }) {
  return (
    <div
      data-tauri-drag-region="false"
      role="group"
      aria-label="Window"
      className="group/lights ml-1 flex shrink-0 items-center gap-2 px-1"
    >
      {BUTTONS.map(({ command, label, fill, Glyph }) => (
        <button
          key={command}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => void invoke(command).catch(() => {})}
          className={`${fill} flex size-3 items-center justify-center rounded-full outline-none focus-ring`}
        >
          <Glyph
            className="size-2 text-background opacity-0 group-hover/lights:opacity-80 group-focus-within/lights:opacity-80"
            strokeWidth={3}
            aria-hidden
          />
        </button>
      ))}
    </div>
  )
}

/** Close, minimize and maximize on the Windows desktop shell; nothing anywhere else. */
export function DesktopWindowControls() {
  const invoke = isDesktop && IS_WINDOWS ? tauriInvoke() : undefined
  return invoke ? <WindowControls invoke={invoke} /> : null
}
