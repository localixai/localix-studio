import { useState } from 'react'
import { Select } from '@localixai/kit/select'

/** The choice, remembered in this browser for every coding agent chat. */
const STORAGE_KEY = 'localix.agent-chat.permission-mode'
/** No mode passed: the agent's own settings decide. */
const DEFAULT = 'default'

/**
 * How a headless agent may act. Headless, nothing can answer a permission prompt, so a tool call
 * that would ask is refused; the mode decides what is allowed without asking.
 */
const MODES = [
  { value: DEFAULT, label: 'Default', description: 'Claude Code’s own settings decide.' },
  { value: 'plan', label: 'Plan', description: 'Reads and plans; changes nothing.' },
  { value: 'acceptEdits', label: 'Accept edits', description: 'Edits files without asking.' },
  { value: 'auto', label: 'Auto', description: 'Claude Code judges each action.' },
  {
    value: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Runs everything without asking. Only for folders you trust fully.',
  },
] as const

function stored(): string {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return MODES.some((mode) => mode.value === value) ? (value ?? DEFAULT) : DEFAULT
  } catch {
    return DEFAULT
  }
}

/** The picked mode, `''` for the agent's own settings, and a setter that remembers it. */
export function usePermissionMode(): [string, (value: string) => void] {
  const [value, setValue] = useState(stored)
  const set = (next: string) => {
    setValue(next)
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembered; the choice still holds for this view.
    }
  }
  return [value === DEFAULT ? '' : value, set]
}

export function PermissionModePicker(props: { value: string; onChange: (value: string) => void }) {
  return (
    <Select
      aria-label="Permission mode"
      size="md"
      align="end"
      value={props.value || DEFAULT}
      onValueChange={props.onChange}
      options={MODES}
    />
  )
}
