import type { HookSource } from '@localix-ai/agent-plugins/hooks'
import type { HooksSettings, PluginSession } from '@localix-ai/agent-plugins'
import { agentHookGroups } from '@localix-ai/agent-plugins/agents'
import type { SkillOrigin } from '@localix-ai/agent-plugins/format'

/** A skill's or an agent's frontmatter `hooks`, as the run holds them. */
export interface ScopedHooksBlock {
  readonly raw: unknown
  readonly source: 'skill' | 'agent'
  /** `Stop` becomes `SubagentStop`: the block runs in a subagent. */
  readonly asSubagent?: boolean
  /** The plugin that bundled it: its folder is `${CLAUDE_PLUGIN_ROOT}`. */
  readonly plugin?: { readonly name: string }
  readonly pluginId?: string
  /** Kept for the session's later runs (a skill's); else this run's only. */
  readonly lifetime?: 'session'
  /** Where a skill's block came from (its `SkillOrigin`): what its trust and locks read. */
  readonly origin?: SkillOrigin['kind']
}

/**
 * The trust and lock facts a skill's hooks carry, per origin, as the kit gives the hooks of a skill
 * it expands itself (hooks.md, "Hooks in skills and agents": a project skill's hooks wait for the
 * workspace trust dialog; "Limits on skill hooks": a plugin-only lock keeps a plugin's, a bundled
 * and a managed-directory skill's; `allowManagedHooksOnly` keeps a managed-directory skill's). A
 * skill synced from claude.ai counts as the user's own.
 */
const SKILL_ORIGIN_SOURCE: {
  readonly [K in SkillOrigin['kind']]: Pick<HookSource, 'scope' | 'managed'>
} = {
  plugin: {},
  managed: { managed: true },
  user: { scope: 'user' },
  project: { scope: 'project' },
  synced: { scope: 'user' },
  bundled: {},
}

/**
 * Registers the run's scoped hooks on the session, each block under its own prefix, and drops the
 * blocks of the previous run that this one does not hold (`previous`, what the last call returned).
 * A skill's block keeps one prefix for the session, so invoking it again registers nothing new.
 */
export function registerScopedHooks(
  session: PluginSession,
  blocks: readonly ScopedHooksBlock[],
  previous: readonly string[],
): string[] {
  const held = blocks.map((block, index) => {
    const prefix =
      block.lifetime === 'session'
        ? `skill:${JSON.stringify([block.plugin?.name ?? null, block.raw])}`
        : `run:${index}`
    // A plugin's agent brings no hooks (Claude Code); the kit says so through its source.
    const source = block.plugin && block.source === 'agent' ? 'plugin' : 'user'
    const hooks = agentHookGroups(
      { hooks: block.raw as HooksSettings, source },
      block.asSubagent ? 'subagent' : 'main-session',
    )
    session.addHooks(
      prefix,
      hooks,
      {
        kind: block.source,
        label: block.plugin ? `[${block.plugin.name}]` : `[${block.source}]`,
        ...(block.plugin ? { pluginName: block.plugin.name } : {}),
        ...(block.origin ? SKILL_ORIGIN_SOURCE[block.origin] : {}),
      },
      block.pluginId ? { pluginId: block.pluginId } : {},
    )
    return prefix
  })
  for (const prefix of previous) if (!held.includes(prefix)) session.removeHooks(prefix)
  return held
}
