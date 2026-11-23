/**
 * A forked skill's frontmatter `hooks`, registered on the child's session by Localix: they carry
 * where the skill came from, as the kit's own skill hooks do (hooks.md, "Hooks in skills and
 * agents": a project skill's hooks "follow the same workspace trust rule as hooks in settings
 * files").
 */
import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { HooksSettings } from '@localix-ai/agent-plugins'
import { tempDirPerTest } from '@localixai/testing'
import { hookTestSession } from '../testing'
import { createKitHooksRuntime } from './runtime'
import { registerScopedHooks, type ScopedHooksBlock } from './scoped'

const dir = tempDirPerTest('kit-scoped-hooks-')

/** A session in a folder whose trust dialog is still open, with one skill's block registered. */
async function ranBefore(trust: 'dialog' | 'trusted', origin: ScopedHooksBlock['origin']) {
  const home = dir()
  const marker = join(home, 'ran')
  const hooks = {
    PreToolUse: [{ hooks: [{ type: 'command', command: `touch "${marker}"` }] }],
  } as HooksSettings
  const session = hookTestSession(home, home, {}, trust)
  registerScopedHooks(session, [{ raw: hooks, source: 'skill', origin }], [])
  await createKitHooksRuntime(session, { cwd: home }).runPreToolUse('Bash', { command: 'ls' })
  return existsSync(marker)
}

test("a project skill's hooks wait for the workspace trust dialog", async () => {
  expect(await ranBefore('dialog', 'project')).toBe(false)
  expect(await ranBefore('trusted', 'project')).toBe(true)
})

test("a personal skill's hooks do not wait for the dialog", async () => {
  expect(await ranBefore('dialog', 'user')).toBe(true)
})
