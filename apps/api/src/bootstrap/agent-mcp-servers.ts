import type { McpServerConfig } from '../features/external-agents/backend/owned-session-routes'

/**
 * The MCP endpoints mini apps serve for one chat, offered to a coding agent Localix starts in it
 * (Claude Code reads them from `--mcp-config`). An endpoint is offered only when it answers an MCP
 * `initialize` for that chat, so an app that is not installed, or not serving, adds nothing.
 */
const ENDPOINTS = [{ name: 'localix-board', path: '/rpc/kanban/mcp' }] as const

const PROBE_TIMEOUT_MS = 3000

export async function agentMcpServers(
  origin: string,
  sessionId: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Record<string, McpServerConfig>> {
  const servers: Record<string, McpServerConfig> = {}
  await Promise.all(
    ENDPOINTS.map(async ({ name, path }) => {
      const url = `${origin}${path}?sessionId=${encodeURIComponent(sessionId)}`
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 0,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'localix-probe', version: '1' },
            },
          }),
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        if (response.ok) servers[name] = { type: 'http', url }
      } catch {
        // Not serving: the agent starts without it.
      }
    }),
  )
  return servers
}
