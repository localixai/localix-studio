import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import type { HostRouteContext } from '@localixai/mini-app-sdk/backend'
import { createOwnedScreenRoutes, type OwnedScreenHost } from './owned-screen-routes'

const TRUST = [
  '─'.repeat(80),
  ' Accessing workspace:',
  '',
  ' Security guide',
  '',
  ' ❯ No, exit',
  '   Yes, I trust this folder',
  '',
  ' Enter to confirm · Esc to cancel',
].join('\n')

function chat(screen = TRUST, overrides: Partial<OwnedScreenHost> = {}) {
  const writes: string[] = []
  const pauses: number[] = []
  const host: OwnedScreenHost = {
    session: async () => ({ externalAgentProvider: 'claude-code' }),
    terminals: () => [{ id: 'pty', chatSessionId: 'our-chat', command: 'claude' }],
    screen: async () => ({ text: screen, cols: 80 }),
    write: (_userId, _terminalId, data) => {
      writes.push(data)
      return true
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
      createOwnedScreenRoutes(host, {
        pause: async (ms) => {
          pauses.push(ms)
        },
      }),
    )
  const post = (path: string, body: object) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'our-chat', ...body }),
    })
  return { post, writes, pauses }
}

test('a chat shows the question its agent waits on', async () => {
  const { post } = chat()
  const screen = await (await post('/owned-screen', {})).json()
  expect(screen.running).toBe(true)
  expect(screen.prompt.options).toEqual([
    { label: 'No, exit', selected: true },
    { label: 'Yes, I trust this folder', selected: false },
  ])
  expect(screen.tail.at(-1)).toBe(' Enter to confirm · Esc to cancel')
})

test('a chat whose agent has ended says so, and typing to it is refused', async () => {
  const { post, writes } = chat(TRUST, { terminals: () => [] })
  expect(await (await post('/owned-screen', {})).json()).toEqual({
    running: false,
    prompt: null,
    tail: [],
  })
  expect((await post('/owned-input', { text: 'hello' })).status).toBe(409)
  expect(writes).toEqual([])
})

test('a message is typed, then submitted on its own; a slash command waits for its completions', async () => {
  const { post, writes, pauses } = chat('❯ ')
  expect((await post('/owned-input', { text: 'fix the build' })).status).toBe(200)
  expect((await post('/owned-input', { text: '/login' })).status).toBe(200)
  expect(writes).toEqual(['fix the build', '\r', '/login', '\r'])
  expect(pauses[1]).toBeGreaterThan(pauses[0] ?? Infinity)
})

test('choosing an answer moves the highlight to it, then confirms it', async () => {
  const { post, writes } = chat()
  expect((await post('/owned-keys', { choose: 1 })).status).toBe(200)
  expect(writes).toEqual(['\x1b[B\r'])
})

test('arrows follow the cursor mode the agent set', async () => {
  const { post, writes } = chat(TRUST, {
    screen: async () => ({ text: TRUST, cols: 80, applicationCursorKeys: true }),
  })
  await post('/owned-keys', { choose: 1 })
  await post('/owned-keys', { keys: ['up', 'escape'] })
  expect(writes).toEqual(['\x1bOB\r', '\x1bOA\x1b'])
})

test('an answer the question does not offer is refused', async () => {
  const { post, writes } = chat()
  expect((await post('/owned-keys', { choose: 5 })).status).toBe(409)
  expect(writes).toEqual([])
})

describe('a chat whose agent runs headless', () => {
  function headlessChat(state: { busy: boolean; error?: string } = { busy: false }) {
    const sent: string[] = []
    const stopped: string[] = []
    const headless = {
      handles: async () => true,
      send: async (
        _userId: string,
        sessionId: string,
        message: { text: string; origin: string; permissionMode?: string },
      ) => {
        sent.push(`${sessionId}:${message.text}:${message.permissionMode ?? 'default'}`)
      },
      stop: (sessionId: string) => {
        stopped.push(sessionId)
        return true
      },
      state: () => state,
    }
    const writes: string[] = []
    const app = new Hono<HostRouteContext>()
      .use('*', async (c, next) => {
        c.set('userId', 'user')
        await next()
      })
      .route(
        '/',
        createOwnedScreenRoutes(
          {
            session: async () => ({ externalAgentProvider: 'claude-code' }),
            // No agent terminal: none is needed to chat.
            terminals: () => [],
            screen: async () => null,
            write: (_u, _t, data) => {
              writes.push(data)
              return true
            },
          },
          { headless: headless as never },
        ),
      )
    const post = (path: string, body: object) =>
      app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'our-chat', ...body }),
      })
    return { post, sent, stopped, writes }
  }

  test('a message is a turn of the agent, sent with the permission mode picked, no terminal needed', async () => {
    const { post, sent, writes } = headlessChat()
    expect((await post('/owned-input', { text: 'fix it', permissionMode: 'plan' })).status).toBe(
      200,
    )
    expect(sent).toEqual(['our-chat:fix it:plan'])
    expect(writes).toEqual([])
  })

  test('the chat reads the agent as ready, answering, or failed with its reason', async () => {
    expect(await (await headlessChat().post('/owned-screen', {})).json()).toEqual({
      running: true,
      headless: true,
      busy: false,
      prompt: null,
      tail: [],
    })
    const failed = headlessChat({ busy: false, error: 'Not logged in · Please run /login' })
    expect(await (await failed.post('/owned-screen', {})).json()).toMatchObject({
      busy: false,
      error: 'Not logged in · Please run /login',
    })
  })

  test('Stop ends the running turn', async () => {
    const { post, stopped } = headlessChat({ busy: true })
    expect((await post('/owned-stop', {})).status).toBe(200)
    expect(stopped).toEqual(['our-chat'])
  })
})
