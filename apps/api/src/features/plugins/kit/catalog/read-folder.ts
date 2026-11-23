import { basename } from 'node:path'
import { readCatalog } from '@localix-ai/agent-plugins'
import { loadPlugin, type Plugin } from '@localix-ai/agent-plugins/loading'
import type { PluginIssue } from '@localix-ai/agent-plugins/format'
import type { MarketplaceEntry } from '@localix-ai/agent-plugins/marketplace'
import { CC_INERT_HOOK_EVENTS, isInertCcHookEvent } from '../../../cc-hooks/contracts'
import { CLAUDE_CODE_BASE_VERSION } from '../../../cc-settings/claude-code-version'
import type { DiscoveredPlugin } from '../../discovery-types'
import { MINI_APP_FILE } from '../../layout/read'
import { diskFiles } from '../ports/files'
import { mcpBundleReader } from '../ports/mcp-bundle'
import { readCommands } from './components'
import { entrypointsOf } from './entrypoints'
import { issueLine } from './issue-line'
import { localixManifest } from './manifest'

/**
 * One plugin folder read by the kit (`loadPlugin`, then its format readers) into what Localix's
 * catalog, validation and runtime take. Never throws: what kept it from loading is `error`.
 */

const MINI_APP_REFUSAL =
  'This folder is a mini app (.localix-mini-app/mini-app.json), not a plugin: add it from the Store'

/** What else names the plugin: its marketplace entry (as the kit read the catalog), a name. */
export interface FolderSource {
  readonly entry?: MarketplaceEntry
  /** The name of a plugin with neither a manifest nor an entry; the folder's name otherwise. */
  readonly name?: string
  /**
   * Read in place from a folder the person keeps (a plugins folder, an in-place install), as
   * Claude Code reads a `--plugin-dir` or local-path plugin: one outside its `engines` range loads
   * anyway. A marketplace copy outside its range does not load.
   */
  readonly localFolder?: boolean
}

export type CatalogPlugin = Omit<DiscoveredPlugin, 'scope' | 'projectId'>

const isError = (found: PluginIssue) => found.severity === 'error'

function empty(
  dir: string,
  name: string,
  error: string,
  issues: readonly PluginIssue[],
): CatalogPlugin {
  return {
    manifest: { name },
    dir,
    entrypoints: {
      mcpServers: {},
      hookConfigs: [],
      lspServers: {},
      monitors: [],
    },
    provides: { skills: [], mcpServers: [], commands: [] },
    commands: [],
    agents: [],
    error,
    ...(issues.length ? { manifestIssues: [...issues] } : {}),
  }
}

/** A hook on an event Localix accepts but never fires, with the reason its author is shown. */
const inertHookIssues = (plugin: Plugin): PluginIssue[] =>
  Object.keys(plugin.hooks)
    .filter(isInertCcHookEvent)
    .map((event) => ({
      severity: 'warning',
      path: 'hooks',
      message: `Hook event ${event} never fires in Localix: ${CC_INERT_HOOK_EVENTS[event]}`,
    }))

async function catalogOf(
  dir: string,
  plugin: Plugin,
  loadIssues: readonly PluginIssue[],
  fallbackName: string,
): Promise<CatalogPlugin> {
  const mapped = localixManifest(plugin, fallbackName)
  const commands = readCommands(plugin)
  const { agents } = readCatalog(plugin)
  const entrypoints = await entrypointsOf(plugin, dir)
  const agentNames = [...new Set(agents.map((agent) => agent.scopedName))]
  const lspNames = Object.keys(entrypoints.lspServers)
  const manifestIssues = [
    ...loadIssues,
    ...inertHookIssues(plugin),
    // What the format readers found in its skills, commands, agents and output styles.
    ...readCatalog(plugin).issues,
  ]
  return {
    manifest: mapped.manifest,
    kit: plugin,
    dir,
    entrypoints,
    provides: {
      skills: plugin.skills.map((skill) => skill.name),
      mcpServers: Object.keys(entrypoints.mcpServers),
      commands: commands.commands.map((command) => command.name),
      ...(agentNames.length ? { agents: agentNames } : {}),
      ...(lspNames.length ? { lspServers: lspNames } : {}),
    },
    commands: commands.commands,
    agents,
    ...(mapped.error ? { error: mapped.error } : {}),
    ...(manifestIssues.length ? { manifestIssues } : {}),
  }
}

/** Read the plugin in `dir`, merged with its marketplace entry when it has one. */
export async function readPluginFolder(
  dir: string,
  from: FolderSource = {},
): Promise<CatalogPlugin> {
  const disk = diskFiles(dir)
  const fallbackName = from.name ?? basename(dir)
  if (await disk.exists(MINI_APP_FILE)) return empty(dir, fallbackName, MINI_APP_REFUSAL, [])
  const { entry } = from
  // The kit merges the entry with `plugin.json` itself (`mergeEntryWithManifest`).
  const loaded = await loadPlugin({
    files: disk,
    fallbackName,
    // A packaged server (`.mcpb`) is unpacked under the plugin; the kit reads what it declares.
    bundles: mcpBundleReader(dir),
    // `engines["claude-code"]` is checked against the release Localix follows.
    clientVersion: CLAUDE_CODE_BASE_VERSION,
    localFolder: from.localFolder === true,
    ...(entry ? { entry } : {}),
  })
  const issues = loaded.issues
  if (!loaded.plugin) {
    const error = issues.find(isError)
    return empty(dir, entry?.name ?? fallbackName, error ? issueLine(error) : 'Not loaded', issues)
  }
  return catalogOf(dir, loaded.plugin, issues, fallbackName)
}
