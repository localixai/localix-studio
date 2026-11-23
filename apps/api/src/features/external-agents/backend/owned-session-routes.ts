import { TOOL } from '../../agent-core/tool-names'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { shellQuote, type HostRouteContext } from '@localixai/mini-app-sdk/backend'
import { zValidator } from '../../../lib/validator'
import { defaultErrorHandler } from '../../../lib/http'
import { ApiError } from '../../../lib/errors'
import { installedExternalAgents } from '../installed'
import { adapterFor } from './adapters/registry'
import { isPendingKey, pendingKeyFor } from './live/store'
import { detectLaunchKind } from './live/launch-kinds'
import { linkKeyOf, parseLinkKey } from '../shared/identity'
import type { AgentSessionsService } from './service'
import type { HeadlessChat } from './headless-chat'

export interface OwnedSessionHost {
  session(
    userId: string,
    sessionId: string,
  ): Promise<{ externalAgentProvider?: string | null; externalAgentSessionKey?: string | null }>
  cwd(userId: string, sessionId: string): Promise<string>
  terminals(userId: string): { id: string; chatSessionId?: string | null; command?: string }[]
  /** `env` layers over the terminal's environment; a name set to `undefined` is removed. */
  spawn(
    userId: string,
    sessionId: string,
    command: string,
    options?: { env?: Record<string, string | undefined> },
  ): Promise<{ id: string; onExit?: (listener: (code: number) => void) => unknown }>
  reportError?: (error: unknown) => void
  remember(userId: string, sessionId: string, key: string): Promise<unknown>
  /**
   * MCP servers this chat offers the agent it starts (its task board, for one), by name. `origin`
   * is the address this API answered the request on, so a URL can point back at it.
   */
  mcpServers?(
    userId: string,
    sessionId: string,
    origin: string,
  ): Promise<Record<string, McpServerConfig>>
}

export interface McpServerConfig {
  type: 'http'
  url: string
}

/** What Claude Code is told about the board it is connected to. */
const BOARD_INSTRUCTION =
  'This Localix chat has a task board, reached through the MCP tools of the localix-board server. Keep it current as you work: put multi-part work on it as epics (milestones) and tasks with checklists, take a card before working it, tick its checklist items as they are done, and complete or block it. List the board before you plan or report progress.'

/** Claude Code's arguments connecting it to the chat's MCP servers, as separate argv words. */
export function mcpArgs(servers: Record<string, McpServerConfig>): string[] {
  if (Object.keys(servers).length === 0) return []
  return [
    '--mcp-config',
    JSON.stringify({ mcpServers: servers }),
    '--append-system-prompt',
    BOARD_INSTRUCTION,
  ]
}

/** Claude Code reads MCP servers from `--mcp-config`; other agents start unchanged. */
function withMcpServers(
  provider: string,
  command: string,
  servers: Record<string, McpServerConfig>,
): string {
  if (provider !== 'claude-code' || Object.keys(servers).length === 0) return command
  const words = command.split(' ')
  // After the `claude` word, not the first one: a resumed session starts `cd -- '<dir>' && claude`.
  const program = words.findIndex((word) => word.slice(word.lastIndexOf('/') + 1) === 'claude')
  if (program < 0) return command
  return [
    ...words.slice(0, program + 1),
    // Flags bare, values quoted: `--mcp-config '{…}'`.
    ...mcpArgs(servers).map((word, at) => (at % 2 ? shellQuote(word) : word)),
    ...words.slice(program + 1),
  ].join(' ')
}

/** The running terminal of this chat's agent, ignoring the other programs the chat runs. */
export function agentTerminalOf(
  host: Pick<OwnedSessionHost, 'terminals'>,
  agents: AgentSessionsService | undefined,
  userId: string,
  sessionId: string,
  provider: string,
) {
  return host
    .terminals(userId)
    .find(
      (terminal) =>
        terminal.chatSessionId === sessionId &&
        (agents?.live.get(terminal.id)?.provider === provider ||
          detectLaunchKind(terminal.command) === provider),
    )
}

/** Only a persisted Localix session can own this action; machine-wide history is never the roster. */
export function createOwnedAgentRoutes(
  host: OwnedSessionHost,
  agents?: AgentSessionsService,
  installed = installedExternalAgents,
  options: { headless?: Pick<HeadlessChat, 'handles' | 'prepare'> } = {},
) {
  const opening = new Map<string, Promise<{ terminalId: string; providerName: string }>>()
  const open = async (userId: string, sessionId: string, origin: string) => {
    const session = await host.session(userId, sessionId)
    const provider = session.externalAgentProvider
    if (!provider)
      throw new ApiError(400, 'not_external_session', 'This session has no external agent.')
    const agent = (await installed()).find((candidate) => candidate.id === provider)
    if (!agent) throw new ApiError(404, 'agent_not_installed', 'This agent is not installed.')
    const existing = agentTerminalOf(host, agents, userId, sessionId, provider)
    if (existing) return { terminalId: existing.id, providerName: agent.name }
    const adapter = adapterFor(provider)
    let key = session.externalAgentSessionKey ?? null
    // A conversation never identified has nothing to resume. An agent that can start under a
    // chosen id starts a new one, rather than leaving the chat unusable.
    if (key && isPendingKey(key) && adapter?.startCommand) key = null
    let command = agent.command
    /** The native session this terminal is known to run from launch, when it is known. */
    let native: string | undefined
    /** A new native id, saved on the chat as soon as its terminal is running. */
    let chosen: string | undefined
    if (key) {
      if (isPendingKey(key))
        throw new ApiError(
          409,
          'native_identity_unavailable',
          'The saved agent session has not been identified yet. Your Localix chat is still available.',
        )
      const identity = parseLinkKey(key)
      const resume =
        identity?.provider === provider
          ? adapter?.resumeCommand?.(identity.nativeSessionId)
          : undefined
      if (!identity || !resume)
        throw new ApiError(
          409,
          'resume_unavailable',
          'This agent cannot resume the saved native session.',
        )
      command = resume
      native = identity.nativeSessionId
      if (agents) {
        const resolved = await agents.resume(key)
        if (resolved?.resume) command = resolved.resume.command
        // Linked at launch, but no message was ever sent: there is no transcript to resume, and
        // the conversation starts under the id the chat already holds.
        else if (adapter?.startCommand) command = adapter.startCommand(identity.nativeSessionId)
        else
          throw new ApiError(
            404,
            'native_session_missing',
            'The saved native session is no longer available.',
          )
      }
    } else if (adapter?.startCommand) {
      chosen = randomUUID()
      native = chosen
      command = adapter.startCommand(chosen)
    }
    const servers = (await host.mcpServers?.(userId, sessionId, origin)) ?? {}
    command = withMcpServers(provider, command, servers)
    const cwd = await host.cwd(userId, sessionId)
    const unset = adapter?.parentSessionEnv ?? []
    const terminal = await host.spawn(
      userId,
      sessionId,
      command,
      unset.length ? { env: Object.fromEntries(unset.map((name) => [name, undefined])) } : {},
    )
    if (chosen)
      await host.remember(userId, sessionId, linkKeyOf({ provider, nativeSessionId: chosen }))
    else if (!key) await host.remember(userId, sessionId, pendingKeyFor(provider, terminal.id))
    if (agents) {
      terminal.onExit?.(() => agents.live.close(terminal.id))
      if (!native) {
        const unsubscribe = agents.live.onChange((entry) => {
          if (entry.terminalId !== terminal.id) return
          if (entry.nativeSessionId) {
            unsubscribe()
            void host
              .remember(
                userId,
                sessionId,
                linkKeyOf({ provider, nativeSessionId: entry.nativeSessionId }),
              )
              .catch((error) => host.reportError?.(error))
          } else if (entry.closed) unsubscribe()
        })
      }
      agents.handleToolCall({
        toolName: TOOL.Bash,
        sessionId,
        input: { action: 'open' },
        result: {
          content: '',
          details: {
            action: 'open',
            terminalId: terminal.id,
            command: `LOCALIX_AGENT=${provider} LOCALIX_AGENT_CWD=${shellQuote(cwd)} ${command}`,
          },
        },
      })
      if (native) agents.live.adopt(terminal.id, native)
    }
    return { terminalId: terminal.id, providerName: agent.name }
  }
  const app = new Hono<HostRouteContext>().post(
    '/open-owned',
    zValidator(
      'json',
      z.object({ sessionId: z.string().min(1).max(200), terminal: z.boolean().optional() }),
    ),
    async (c) => {
      const userId = c.get('userId')
      const { sessionId, terminal } = c.req.valid('json')
      // A headless chat needs no terminal to be chatted with: its terminal opens only when asked.
      const headless = options.headless
      if (!terminal && headless && (await headless.handles(userId, sessionId))) {
        const { providerName } = await headless.prepare(userId, sessionId)
        return c.json({ terminalId: null, providerName })
      }
      const key = JSON.stringify([userId, sessionId])
      let pending = opening.get(key)
      if (!pending) {
        const origin = new URL(c.req.url).origin
        pending = open(userId, sessionId, origin).finally(() => opening.delete(key))
        opening.set(key, pending)
      }
      return c.json(await pending)
    },
  )
  app.onError(defaultErrorHandler)
  return app
}
