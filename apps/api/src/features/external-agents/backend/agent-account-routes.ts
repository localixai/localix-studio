import { Hono } from 'hono'
import { z } from 'zod'
import type { HostRouteContext } from '@localixai/mini-app-sdk/backend'
import { zValidator } from '../../../lib/validator'
import { defaultErrorHandler } from '../../../lib/http'
import { ApiError } from '../../../lib/errors'
import { installedExternalAgents } from '../installed'
import type { AgentAccount } from '../shared/agent-prompt'
import { adapterFor } from './adapters/registry'
import { agentTerminalOf, type OwnedSessionHost } from './owned-session-routes'
import type { AgentSessionsService } from './service'

/**
 * A coding agent's sign-in, driven from its chat through the agent's own commands
 * (`claude auth status | login | logout`), so signing in or out never needs a terminal.
 */
export interface AgentAccountHost extends Pick<
  OwnedSessionHost,
  'session' | 'terminals' | 'spawn'
> {
  close(userId: string, terminalId: string): boolean
  /** Run a program to its end, without a terminal. */
  run(
    program: string,
    args: readonly string[],
    env: Record<string, string | undefined>,
  ): Promise<{ code: number; stdout: string }>
}

const sessionBody = z.object({ sessionId: z.string().min(1).max(200) })

export function createAgentAccountRoutes(
  host: AgentAccountHost,
  agents?: AgentSessionsService,
  installed = installedExternalAgents,
) {
  /** The chat's agent, when it is installed and Localix can drive its sign-in. */
  const agentOf = async (userId: string, sessionId: string) => {
    const provider = (await host.session(userId, sessionId)).externalAgentProvider
    const adapter = provider ? adapterFor(provider) : undefined
    const agent = (await installed()).find((candidate) => candidate.id === provider)
    if (!provider || !adapter?.account || !agent) return null
    const env = Object.fromEntries(
      (adapter.parentSessionEnv ?? []).map((name) => [name, undefined]),
    )
    return { provider, program: agent.command, account: adapter.account, env }
  }
  type Agent = NonNullable<Awaited<ReturnType<typeof agentOf>>>
  const required = async (userId: string, sessionId: string) => {
    const agent = await agentOf(userId, sessionId)
    if (!agent)
      throw new ApiError(409, 'account_unavailable', 'This agent’s sign-in is not available here.')
    return agent
  }
  const status = async (agent: Agent): Promise<AgentAccount> => {
    const { stdout } = await host.run(agent.program, agent.account.status, agent.env)
    const account = agent.account.read(stdout)
    if (!account) throw new ApiError(500, 'account_unreadable', 'Could not read the sign-in.')
    return account
  }
  /** Signing in or out changes what the running agent may do: it is stopped, and started again. */
  const stopAgent = async (userId: string, sessionId: string, provider: string) => {
    const terminal = agentTerminalOf(host, agents, userId, sessionId, provider)
    if (terminal) host.close(userId, terminal.id)
  }

  const app = new Hono<HostRouteContext>()
    .post('/agent-account', zValidator('json', sessionBody), async (c) => {
      const agent = await agentOf(c.get('userId'), c.req.valid('json').sessionId)
      return c.json({ account: agent ? await status(agent) : null })
    })
    .post('/agent-login', zValidator('json', sessionBody), async (c) => {
      const userId = c.get('userId')
      const { sessionId } = c.req.valid('json')
      const agent = await required(userId, sessionId)
      await stopAgent(userId, sessionId, agent.provider)
      // In the chat's terminal, so the chat shows its questions (method, link, code) and the
      // person answers them there.
      await host.spawn(userId, sessionId, [agent.program, ...agent.account.login].join(' '), {
        env: agent.env,
      })
      return c.json({ ok: true })
    })
    .post('/agent-logout', zValidator('json', sessionBody), async (c) => {
      const userId = c.get('userId')
      const { sessionId } = c.req.valid('json')
      const agent = await required(userId, sessionId)
      await stopAgent(userId, sessionId, agent.provider)
      await host.run(agent.program, agent.account.logout, agent.env)
      return c.json({ account: await status(agent) })
    })
  app.onError(defaultErrorHandler)
  return app
}
