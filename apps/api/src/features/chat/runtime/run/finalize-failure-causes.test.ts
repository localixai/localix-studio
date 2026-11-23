import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import { SignInExpiredError } from '@localixai/agent/agents'

import { RequiredMcpServersError } from '../../../mcp/client-manager-types'
import type { SessionRecord } from '../../repository'
import { createRouteCooldowns } from '../route-cooldowns'
import type { RunEnv } from './types'
import { finalizeFailedRun } from './finalize-failure'

const SESSION_ID = 's1'
const ASSISTANT_ID = 'assistant-1'
const SECRET = 'sk-vault-value-123'

/** A finalizer over an in-memory transcript and a structured log that records its lines. */
function setup(opts: { hasAssistantRow?: boolean; readFails?: boolean } = {}) {
  const inserted: Array<{ id: string; payload: Record<string, unknown> }> = []
  const logged: Array<{ level: string; record: Record<string, unknown> }> = []
  const env = {
    state: { stoppedRuntimeSessionIds: new Set<string>(), routeCooldowns: createRouteCooldowns() },
    deps: {
      streamRegistry: { publish: () => {} },
      sanitizeText: (_userId: string, text: string) => text.replaceAll(SECRET, '[redacted]'),
      logger: {
        warn: (message: string) => logged.push({ level: 'warn', record: { msg: message } }),
        info: (record: Record<string, unknown>) => logged.push({ level: 'info', record }),
        error: (record: Record<string, unknown>) => logged.push({ level: 'error', record }),
      },
    },
    repo: {
      getMessage: async (_userId: string, _sessionId: string, id: string) => {
        if (opts.readFails) throw new Error('database is locked')
        return (
          inserted.find((row) => row.id === id) ??
          (id === ASSISTANT_ID && opts.hasAssistantRow !== false
            ? { payload: { role: 'assistant', content: '' }, createdAt: '2026-01-01T00:00:00.000Z' }
            : null)
        )
      },
      insertMessage: async (message: { id: string; payload: Record<string, unknown> }) => {
        inserted.push(message)
      },
    },
    persistAndPublish: async () => {},
  } as unknown as RunEnv
  return {
    logged,
    notice: () =>
      inserted.map((row) => row.payload.systemNotice).find(Boolean) as {
        text: string
        recovery?: string[]
      },
    run: (error: unknown) =>
      finalizeFailedRun({
        env,
        userId: 'u1',
        session: { id: SESSION_ID, sessionKind: 'chat' } as unknown as SessionRecord,
        route: { providerConnectionId: 'conn-a', modelId: 'openai/gpt-5' },
        assistantMessageId: ASSISTANT_ID,
        error,
        publishRuntimeSession: async () => {},
      }),
  }
}

const consoleCalls = () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  return () => error.mock.calls.length + warn.mock.calls.length
}

afterEach(() => {
  ;(console.error as unknown as { mockRestore?: () => void }).mockRestore?.()
  ;(console.warn as unknown as { mockRestore?: () => void }).mockRestore?.()
})

describe('a run whose sign-in could not be renewed', () => {
  test('says the sign-in expired and offers to sign in to the connection it ran on', async () => {
    const h = setup()
    await h.run(
      new SignInExpiredError(
        'OpenAI',
        'OpenAI token refresh failed (400): {"error":"invalid_grant"}',
      ),
    )
    expect(h.notice()).toMatchObject({
      text: 'Your sign-in to OpenAI has expired or was revoked. Sign in again.',
      recovery: ['sign-in:conn-a'],
    })
  })
})

describe('a run that needed an MCP server that did not start', () => {
  test('names the server and opens its Store page, where it is fixed', async () => {
    const h = setup()
    await h.run(
      new RequiredMcpServersError([
        { server: 'github', error: 'spawn npx ENOENT', storeId: 'project:github' },
      ]),
    )
    expect(h.notice()).toMatchObject({
      text: 'The MCP server “github” this agent requires did not start: spawn npx ENOENT.',
      recovery: ['open-store:mcp-server/project:github'],
    })
  })

  test('a server with no Store page of its own (a file’s or a plugin’s) opens the MCP shelf', async () => {
    const h = setup()
    await h.run(new RequiredMcpServersError([{ server: 'docs', error: 'timed out' }]))
    expect(h.notice().recovery).toEqual(['open-store:mcp-server'])
  })
})

describe('every failed run is one structured line in the API log', () => {
  test('with its session, run, kind, redacted message and stack; nothing on the console', async () => {
    const h = setup()
    const printed = consoleCalls()
    await h.run(
      new SignInExpiredError('OpenAI', `OpenAI token refresh failed (400): bad ${SECRET}`),
    )
    expect(h.logged).toHaveLength(1)
    const [line] = h.logged
    expect(line!.level).toBe('error')
    expect(line!.record).toMatchObject({
      event: 'run.failed',
      sessionId: SESSION_ID,
      runId: ASSISTANT_ID,
      kind: 'fatal',
      authFailed: true,
      error: { name: 'SignInExpiredError' },
    })
    const error = line!.record.error as { message: string; stack: string }
    expect(error.message).toBe('OpenAI token refresh failed (400): bad [redacted]')
    // Frames only: the first line of a stack repeats the message, recorded once above.
    expect(error.stack).toMatch(/^\s+at /)
    expect(JSON.stringify(line!.record)).not.toContain(SECRET)
    // Printing the Error object made Bun dump the minified source line around the throw.
    expect(printed()).toBe(0)
  })

  test('a run that failed before writing anything says so in the same line', async () => {
    const h = setup({ hasAssistantRow: false })
    const printed = consoleCalls()
    await h.run(
      Object.assign(new TypeError('getaddrinfo ENOTFOUND api.openai.com'), { code: 'ENOTFOUND' }),
    )
    expect(h.logged.map((line) => line.record)).toMatchObject([
      { event: 'run.failed', output: false, error: { code: 'ENOTFOUND' } },
    ])
    expect(printed()).toBe(0)
  })

  test('never holds a chunk of the reply, and keeps every message bounded', async () => {
    // A reader's error quotes the chunk it could not read: the model's own text, a tool's arguments.
    const chunk = 'PRIVATE-MODEL-TEXT '.repeat(40)
    const unreadable = Object.assign(new Error(`JSON parsing failed: Text: ${chunk}`), {
      name: 'AI_JSONParseError',
      text: chunk,
    })
    const ending = Object.assign(
      new Error('The provider sent a response that could not be read.', { cause: unreadable }),
      { name: 'ProviderMalformedResponseError' },
    )
    const h = setup()
    await h.run(ending)
    const record = JSON.stringify(h.logged[0]!.record)
    expect(record).not.toContain('PRIVATE-MODEL-TEXT')
    expect(h.logged[0]!.record).toMatchObject({
      error: { causes: [{ name: 'AI_JSONParseError', length: chunk.length }] },
    })

    const long = setup()
    await long.run(
      Object.assign(new Error(`upstream said ${'x'.repeat(5_000)}`), {
        cause: new Error('y'.repeat(5_000)),
      }),
    )
    const logged = long.logged[0]!.record.error as {
      message: string
      causes: { message: string }[]
    }
    expect(logged.message.length).toBeLessThanOrEqual(500)
    expect(logged.causes[0]!.message.length).toBeLessThanOrEqual(200)
  })

  test('is written even when reading the transcript fails', async () => {
    const h = setup({ readFails: true })
    await expect(h.run(new Error('boom'))).rejects.toThrow('database is locked')
    expect(h.logged.map((line) => line.record.event)).toEqual(['run.failed'])
    expect(h.logged[0]!.record.output).toBeUndefined()
  })

  test('says a sign-in expired, and a cancel the person made is information, not an error', async () => {
    const expired = setup()
    await expired.run(new SignInExpiredError('OpenAI', 'refused'))
    expect(expired.logged[0]!.record).toMatchObject({ signInExpired: true })

    const cancelled = setup()
    await cancelled.run(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    expect(cancelled.logged.map((line) => [line.level, line.record.event])).toEqual([
      ['info', 'run.stopped'],
    ])
  })
})
