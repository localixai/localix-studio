import { expect, test } from 'bun:test'
import { createHeadlessChat, type HeadlessChatHost } from './headless-chat'
import type { TurnRequest } from './headless-turns'

const ID = /^[0-9a-f-]{36}$/

function chat(overrides: Partial<HeadlessChatHost> = {}) {
  const turns: TurnRequest[] = []
  const remembered: string[] = []
  let key: string | null = null
  const host: HeadlessChatHost = {
    session: async () => ({ externalAgentProvider: 'claude-code', externalAgentSessionKey: key }),
    remember: async (_userId, _sessionId, next) => {
      key = next
      remembered.push(next)
    },
    cwd: async () => '/work/shop',
    installed: async () => [{ id: 'claude-code', name: 'Claude Code', command: 'claude' }],
    transcriptExists: async () => false,
    turns: {
      start: (_sessionId, request) => {
        turns.push(request)
      },
      stop: () => true,
      state: () => ({ busy: false }),
    },
    ...overrides,
  }
  return { service: createHeadlessChat(host), turns, remembered, setKey: (k: string) => (key = k) }
}

test('the first message starts the conversation under an id the chat holds from then on', async () => {
  const { service, turns, remembered } = chat()
  await service.send('user', 'our-chat', { text: 'add a login page', origin: 'http://x' })
  const id = remembered[0]?.split(':')[1] ?? ''
  expect(id).toMatch(ID)
  expect(turns[0]).toMatchObject({ cwd: '/work/shop', prompt: 'add a login page' })
  expect(turns[0]?.argv.slice(0, 2)).toEqual(['claude', '-p'])
  expect(turns[0]?.argv).toContain('--session-id')
  expect(turns[0]?.argv).toContain(id)
})

test('a later message continues the same conversation', async () => {
  const { service, turns, setKey } = chat({ transcriptExists: async () => true })
  setKey('claude-code:11111111-2222-4333-8444-555555555555')
  await service.send('user', 'our-chat', { text: 'and a logout', origin: 'http://x' })
  const argv = turns[0]?.argv ?? []
  expect(argv[argv.indexOf('--resume') + 1]).toBe('11111111-2222-4333-8444-555555555555')
  expect(argv).not.toContain('--session-id')
})

test('a permission mode the person picked is passed; one the agent does not have is refused', async () => {
  const { service, turns } = chat()
  await service.send('user', 'our-chat', { text: 'go', origin: 'http://x', permissionMode: 'plan' })
  const argv = turns[0]?.argv ?? []
  expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('plan')
  await expect(
    service.send('user', 'our-chat', { text: 'go', origin: 'http://x', permissionMode: 'yolo' }),
  ).rejects.toThrow()
})

test('the chat’s MCP servers go with every turn as arguments, needing no shell quoting', async () => {
  const { service, turns } = chat({
    mcpServers: async () => ({ board: { type: 'http', url: "http://x/mcp?it's" } }),
  })
  await service.send('user', 'our-chat', { text: 'go', origin: 'http://x' })
  const argv = turns[0]?.argv ?? []
  expect(JSON.parse(argv[argv.indexOf('--mcp-config') + 1] ?? '{}')).toEqual({
    mcpServers: { board: { type: 'http', url: "http://x/mcp?it's" } },
  })
})

test('a turn runs without the markers a parent Claude Code session leaves', async () => {
  const { service, turns } = chat()
  await service.send('user', 'our-chat', { text: 'go', origin: 'http://x' })
  const env = turns[0]?.env ?? {}
  expect('CLAUDE_CODE_CHILD_SESSION' in env).toBe(true)
  expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined()
})

test('an agent that is not run headless is not this service’s', async () => {
  const { service } = chat({ session: async () => ({ externalAgentProvider: 'codex' }) })
  expect(await service.handles('user', 'our-chat')).toBe(false)
})
