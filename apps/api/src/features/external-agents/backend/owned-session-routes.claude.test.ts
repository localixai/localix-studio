import { expect, spyOn, test } from 'bun:test'
import { Hono } from 'hono'
import type { HostRouteContext } from '@localixai/mini-app-sdk/backend'
import { AgentSessionsService } from './service'
import { createOwnedAgentRoutes, type OwnedSessionHost } from './owned-session-routes'

type Spawn = { command: string; env?: Record<string, string | undefined> }

function claudeChat(overrides: Partial<OwnedSessionHost> = {}, agents?: AgentSessionsService) {
  const spawns: Spawn[] = []
  const remembered: string[] = []
  const host: OwnedSessionHost = {
    session: async () => ({ externalAgentProvider: 'claude-code' }),
    cwd: async () => '/work',
    terminals: () => [],
    spawn: async (_userId, _sessionId, command, options) => {
      spawns.push({ command, env: options?.env })
      return { id: 'pty' }
    },
    remember: async (_userId, _sessionId, key) => {
      remembered.push(key)
    },
    ...overrides,
  }
  const app = new Hono<HostRouteContext>()
    .use('*', async (c, next) => {
      c.set('userId', 'user')
      await next()
    })
    .route(
      '/',
      createOwnedAgentRoutes(host, agents, async () => [
        { id: 'claude-code', name: 'Claude Code', command: 'claude' },
      ]),
    )
  const open = () =>
    app.request('/open-owned', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'our-chat' }),
    })
  return { open, spawns, remembered }
}

const UUID = /--session-id '([0-9a-f-]{36})'/

test('a new Claude Code chat starts under a session id Localix chose, linked before any message', async () => {
  // Claude Code writes no transcript until the first message, which can come minutes later: the
  // chat must not depend on finding that file to know which conversation is its own.
  const { open, spawns, remembered } = claudeChat()
  expect((await open()).status).toBe(200)
  const chosen = UUID.exec(spawns[0]?.command ?? '')?.[1]
  expect(chosen).toBeDefined()
  expect(remembered).toEqual([`claude-code:${chosen}`])
})

test('a linked Claude Code chat whose transcript was never written starts again under the same id', async () => {
  const agents = new AgentSessionsService('/tmp/owned-claude-state', () => {}, {
    env: {},
    homeDir: '/tmp/owned-claude-home',
  })
  const resume = spyOn(agents, 'resume').mockResolvedValue(null)
  try {
    const { open, spawns, remembered } = claudeChat(
      {
        session: async () => ({
          externalAgentProvider: 'claude-code',
          externalAgentSessionKey: 'claude-code:11111111-2222-4333-8444-555555555555',
        }),
      },
      agents,
    )
    expect((await open()).status).toBe(200)
    expect(spawns[0]?.command).toContain("--session-id '11111111-2222-4333-8444-555555555555'")
    expect(remembered).toEqual([])
    expect(agents.live.get('pty')?.nativeSessionId).toBe('11111111-2222-4333-8444-555555555555')
  } finally {
    resume.mockRestore()
    await agents.shutdown()
  }
})

test('a Claude Code chat whose conversation was never identified starts a new one instead of refusing', async () => {
  const { open, spawns, remembered } = claudeChat({
    session: async () => ({
      externalAgentProvider: 'claude-code',
      externalAgentSessionKey: 'claude-code:pending-terminal-old',
    }),
  })
  expect((await open()).status).toBe(200)
  const chosen = UUID.exec(spawns[0]?.command ?? '')?.[1]
  expect(remembered).toEqual([`claude-code:${chosen}`])
})

test('Claude Code started from inside another Claude Code session still saves its transcript', async () => {
  // Inherited, these markers make the new agent a child session: "Transcript saving is off", and
  // the chat, which reads that transcript, never shows a reply.
  const { open, spawns } = claudeChat()
  await open()
  const env = spawns[0]?.env ?? {}
  for (const marker of ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID']) {
    expect(marker in env).toBe(true)
    expect(env[marker]).toBeUndefined()
  }
})

test('a resumed Claude Code chat gets its MCP servers on the claude command, not on its cd', async () => {
  const agents = new AgentSessionsService('/tmp/owned-claude-mcp-state', () => {}, {
    env: {},
    homeDir: '/tmp/owned-claude-mcp-home',
  })
  const resume = spyOn(agents, 'resume').mockResolvedValue({
    resume: {
      providerName: 'Claude Code',
      command: "cd -- '/work/native' && claude --resume 'id'",
    },
  })
  try {
    const { open, spawns } = claudeChat(
      {
        session: async () => ({
          externalAgentProvider: 'claude-code',
          externalAgentSessionKey: 'claude-code:id',
        }),
        mcpServers: async () => ({ board: { type: 'http', url: 'http://x/mcp' } }),
      },
      agents,
    )
    expect((await open()).status).toBe(200)
    const command = spawns[0]?.command ?? ''
    expect(command.startsWith("cd -- '/work/native' && claude --mcp-config ")).toBe(true)
    expect(command.endsWith("--resume 'id'")).toBe(true)
  } finally {
    resume.mockRestore()
    await agents.shutdown()
  }
})

test('opening a headless Claude Code chat starts no terminal; asking for its terminal does', async () => {
  const prepared: string[] = []
  const spawns: string[] = []
  const app = new Hono<HostRouteContext>()
    .use('*', async (c, next) => {
      c.set('userId', 'user')
      await next()
    })
    .route(
      '/',
      createOwnedAgentRoutes(
        {
          session: async () => ({ externalAgentProvider: 'claude-code' }),
          cwd: async () => '/work',
          terminals: () => [],
          spawn: async (_u, _s, command) => {
            spawns.push(command)
            return { id: 'pty' }
          },
          remember: async () => {},
        },
        undefined,
        async () => [{ id: 'claude-code', name: 'Claude Code', command: 'claude' }],
        {
          headless: {
            handles: async () => true,
            prepare: async (_userId, sessionId) => {
              prepared.push(sessionId)
              return { providerName: 'Claude Code' }
            },
          },
        },
      ),
    )
  const open = (body: object) =>
    app.request('/open-owned', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'our-chat', ...body }),
    })
  expect(await (await open({})).json()).toEqual({ terminalId: null, providerName: 'Claude Code' })
  expect(prepared).toEqual(['our-chat'])
  expect(spawns).toEqual([])
  expect((await (await open({ terminal: true })).json()).terminalId).toBe('pty')
  expect(spawns).toHaveLength(1)
})
