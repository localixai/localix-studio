import { expect, test } from 'bun:test'
import { Hono } from 'hono'
import type { HostRouteContext } from '@localixai/mini-app-sdk/backend'
import { createAgentAccountRoutes, type AgentAccountHost } from './agent-account-routes'

// `claude auth status` as Claude Code 2.1.330 prints it, trimmed.
const SIGNED_IN = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  email: 'me@example.com',
  subscriptionType: 'pro',
})

function chat(provider = 'claude-code', status = { code: 0, stdout: SIGNED_IN }) {
  const runs: string[] = []
  const closed: string[] = []
  const spawns: { command: string; env?: Record<string, string | undefined> }[] = []
  const host: AgentAccountHost = {
    session: async () => ({ externalAgentProvider: provider }),
    terminals: () => [{ id: 'pty', chatSessionId: 'our-chat', command: 'claude' }],
    close: (_userId, terminalId) => {
      closed.push(terminalId)
      return true
    },
    spawn: async (_userId, _sessionId, command, options) => {
      spawns.push({ command, env: options?.env })
      return { id: 'login-pty' }
    },
    run: async (program, args) => {
      runs.push([program, ...args].join(' '))
      return args.includes('logout') ? { code: 0, stdout: 'Successfully logged out' } : status
    },
  }
  const app = new Hono<HostRouteContext>()
    .use('*', async (c, next) => {
      c.set('userId', 'user')
      await next()
    })
    .route(
      '/',
      createAgentAccountRoutes(host, undefined, async () => [
        { id: 'claude-code', name: 'Claude Code', command: 'claude' },
        { id: 'codex', name: 'Codex', command: 'codex' },
      ]),
    )
  const post = (path: string) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'our-chat' }),
    })
  return { post, runs, closed, spawns }
}

test('a Claude Code chat shows who the agent is signed in as', async () => {
  const { post, runs } = chat()
  expect(await (await post('/agent-account')).json()).toEqual({
    account: { loggedIn: true, email: 'me@example.com', plan: 'pro' },
  })
  expect(runs).toEqual(['claude auth status --json'])
})

test('a signed-out agent reads as signed out, whatever its exit code', async () => {
  const { post } = chat('claude-code', { code: 1, stdout: JSON.stringify({ loggedIn: false }) })
  expect(await (await post('/agent-account')).json()).toEqual({ account: { loggedIn: false } })
})

test('an agent whose sign-in Localix cannot read has no account to show', async () => {
  const { post, runs } = chat('codex')
  expect(await (await post('/agent-account')).json()).toEqual({ account: null })
  expect(runs).toEqual([])
})

test('signing out stops the agent first, then reports the account signed out', async () => {
  const { post, runs, closed } = chat('claude-code', {
    code: 1,
    stdout: JSON.stringify({ loggedIn: false }),
  })
  expect(await (await post('/agent-logout')).json()).toEqual({ account: { loggedIn: false } })
  expect(closed).toEqual(['pty'])
  expect(runs).toEqual(['claude auth logout', 'claude auth status --json'])
})

test('signing in runs the agent’s own sign-in in the chat, in place of the agent', async () => {
  const { post, closed, spawns } = chat()
  expect((await post('/agent-login')).status).toBe(200)
  expect(closed).toEqual(['pty'])
  expect(spawns[0]?.command).toBe('claude auth login')
  expect('CLAUDECODE' in (spawns[0]?.env ?? {})).toBe(true)
})
