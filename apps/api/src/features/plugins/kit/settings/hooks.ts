import { readCommandLine } from '@localix-ai/agent-plugins/settings'
import type { ClaudeSettings } from './read'

export interface SettingsStatusLine {
  command: string
  padding: number
  refreshInterval?: number
}

/** The `statusLine` the settings run, as the kit lets it run (`readCommandLine`), else undefined. */
export function settingsStatusLine(settings: ClaudeSettings): SettingsStatusLine | undefined {
  const policy = settings.policy()
  const value = readCommandLine(policy.view, 'statusLine', policy.hooks).runs?.value
  if (!value?.command.trim()) return undefined
  const padding =
    typeof value.padding === 'number' && value.padding > 0 ? Math.floor(value.padding) : 0
  const refresh = value.refreshInterval
  return {
    command: value.command,
    padding,
    ...(typeof refresh === 'number' ? { refreshInterval: refresh } : {}),
  }
}
