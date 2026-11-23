import { client, unwrap } from '@/shared/api/internal'
import type {
  AgentKey,
  AgentScreen,
  RosterQuery,
  StatsQuery,
} from '@localixai/api/external-agent-contracts'
import { toUiSession } from '@/shared/api/converters'

export const externalAgentsApi = {
  async linkAgent(sessionId: string, provider: string) {
    return toUiSession(
      await unwrap(
        await client.rpc['external-agents']['link-agent'].$post({ json: { sessionId, provider } }),
      ),
    )
  },
  async attachNative(key: string, projectId?: string) {
    return unwrap(
      await client.rpc['external-agents']['attach-native'].$post({ json: { key, projectId } }),
    )
  },
  /**
   * Ready the chat's agent. A headless agent (Claude Code) starts nothing and answers no terminal
   * unless `terminal` asks for one; an agent chatted with in its terminal starts it.
   */
  async openOwned(sessionId: string, terminal?: boolean) {
    return unwrap(
      await client.rpc['external-agents']['open-owned'].$post({ json: { sessionId, terminal } }),
    )
  },
  /** What the chat's agent shows besides its conversation: a question it waits on, if any. */
  async screen(sessionId: string): Promise<AgentScreen> {
    return unwrap(
      await client.rpc['external-agents']['owned-screen'].$post({ json: { sessionId } }),
    )
  },
  /** Send a message to the chat's agent: a headless turn, or typed into its terminal. */
  async input(sessionId: string, text: string, permissionMode?: string) {
    return unwrap(
      await client.rpc['external-agents']['owned-input'].$post({
        json: { sessionId, text, permissionMode },
      }),
    )
  },
  /** Stop what the chat's agent is doing. */
  async stop(sessionId: string) {
    return unwrap(await client.rpc['external-agents']['owned-stop'].$post({ json: { sessionId } }))
  },
  /** Press keys in the chat's agent, or pick an answer of its open question. */
  async keys(sessionId: string, press: { keys?: AgentKey[]; choose?: number }) {
    return unwrap(
      await client.rpc['external-agents']['owned-keys'].$post({ json: { sessionId, ...press } }),
    )
  },
  async account(sessionId: string) {
    return (
      await unwrap(
        await client.rpc['external-agents']['agent-account'].$post({ json: { sessionId } }),
      )
    ).account
  },
  async login(sessionId: string) {
    return unwrap(await client.rpc['external-agents']['agent-login'].$post({ json: { sessionId } }))
  },
  async logout(sessionId: string) {
    return (
      await unwrap(
        await client.rpc['external-agents']['agent-logout'].$post({ json: { sessionId } }),
      )
    ).account
  },
  async stats(query: StatsQuery) {
    return unwrap(
      await client.rpc['external-agents'].stats.$post({
        json: { ...query, providers: query.providers ? [...query.providers] : undefined },
      }),
    )
  },
  async providers() {
    return (await unwrap(await client.rpc['external-agents'].providers.$get())).providers
  },
  async roster(query: RosterQuery) {
    return unwrap(
      await client.rpc['external-agents'].roster.$post({
        json: {
          query: {
            ...query,
            providers: query.providers ? [...query.providers] : undefined,
            states: query.states ? [...query.states] : undefined,
          },
        },
      }),
    )
  },
  async resume(key: string) {
    return unwrap(await client.rpc['external-agents'].resume.$post({ json: { key } }))
  },
  async items(key: string, maxEvents?: number, tail?: boolean) {
    return unwrap(
      await client.rpc['external-agents'].items.$post({
        json: { key, maxEvents, tail },
      }),
    )
  },
}
