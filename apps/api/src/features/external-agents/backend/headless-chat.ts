/**
 * A coding agent chatted with headless (`adapters/types.ts`, `headless`): each message is one turn
 * of the agent's own CLI, continuing the conversation the chat holds the id of. Like a wrapper
 * around the CLI, it needs no terminal: nothing on a screen can stand between a message and the
 * agent, and the chat works the moment it is opened.
 */
import { randomUUID } from 'node:crypto'
import { InvalidRequestError, NotFoundError } from '../../../lib/domain-errors'
import { linkKeyOf, parseLinkKey } from '../shared/identity'
import type { InstalledExternalAgent } from '../installed'
import { adapterFor } from './adapters/registry'
import { isPendingKey } from './live/store'
import type { HeadlessTurns } from './headless-turns'
import { mcpArgs, type McpServerConfig, type OwnedSessionHost } from './owned-session-routes'

export interface HeadlessChatHost extends Pick<OwnedSessionHost, 'session' | 'remember' | 'cwd'> {
  installed(): Promise<InstalledExternalAgent[]>
  /** Whether the agent has written this conversation yet: the first turn starts it. */
  transcriptExists(key: string): Promise<boolean>
  turns: Pick<HeadlessTurns, 'start' | 'stop' | 'state'>
  mcpServers?(
    userId: string,
    sessionId: string,
    origin: string,
  ): Promise<Record<string, McpServerConfig>>
}

export function createHeadlessChat(host: HeadlessChatHost) {
  const agentOf = async (userId: string, sessionId: string) => {
    const session = await host.session(userId, sessionId)
    const provider = session.externalAgentProvider
    const adapter = provider ? adapterFor(provider) : undefined
    if (!provider || !adapter?.headless) return null
    return { provider, adapter, headless: adapter.headless, key: session.externalAgentSessionKey }
  }

  /** The conversation's native id, chosen and saved on the chat when it has none yet. */
  const identity = async (
    userId: string,
    sessionId: string,
    agent: NonNullable<Awaited<ReturnType<typeof agentOf>>>,
  ) => {
    const linked = agent.key && !isPendingKey(agent.key) ? parseLinkKey(agent.key) : null
    if (linked?.provider === agent.provider) return linked.nativeSessionId
    const chosen = randomUUID()
    await host.remember(
      userId,
      sessionId,
      linkKeyOf({ provider: agent.provider, nativeSessionId: chosen }),
    )
    return chosen
  }

  return {
    async handles(userId: string, sessionId: string): Promise<boolean> {
      return (await agentOf(userId, sessionId)) !== null
    },

    /** Ready the chat for its first message: its conversation id exists before anything is sent. */
    async prepare(userId: string, sessionId: string): Promise<{ providerName: string }> {
      const agent = await agentOf(userId, sessionId)
      if (!agent)
        throw new InvalidRequestError('not_headless', 'This agent is chatted with in its terminal.')
      await identity(userId, sessionId, agent)
      return { providerName: agent.adapter.displayName }
    },

    async send(
      userId: string,
      sessionId: string,
      message: { text: string; origin: string; permissionMode?: string },
    ): Promise<void> {
      const agent = await agentOf(userId, sessionId)
      if (!agent)
        throw new InvalidRequestError('not_headless', 'This agent is chatted with in its terminal.')
      const mode = message.permissionMode
      if (mode && !agent.headless.permissionModes.includes(mode))
        throw new InvalidRequestError('unknown_permission_mode', `Unknown permission mode: ${mode}`)
      const installed = (await host.installed()).find(
        (candidate) => candidate.id === agent.provider,
      )
      if (!installed) throw new NotFoundError('agent_not_installed', 'This agent is not installed.')
      const id = await identity(userId, sessionId, agent)
      const resume = await host.transcriptExists(
        linkKeyOf({ provider: agent.provider, nativeSessionId: id }),
      )
      const servers = (await host.mcpServers?.(userId, sessionId, message.origin)) ?? {}
      const env = Object.fromEntries(
        (agent.adapter.parentSessionEnv ?? []).map((name) => [name, undefined]),
      )
      host.turns.start(sessionId, {
        argv: [installed.command, ...agent.headless.args(id, resume, mode), ...mcpArgs(servers)],
        cwd: await host.cwd(userId, sessionId),
        env,
        prompt: message.text,
      })
    },

    stop: (sessionId: string) => host.turns.stop(sessionId),
    state: (sessionId: string) => host.turns.state(sessionId),
  }
}

export type HeadlessChat = ReturnType<typeof createHeadlessChat>
