import { describe, expect, test } from 'bun:test'
import type { AssistantMessage } from '@localixai/agent'
import { hostWithMod } from './testing/testing-host'

/** `turn.step` hooks written as Claude Code documents them: async generators over the stream. */

const answer = (text: string): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
  model: 'model-a',
  stopReason: 'end_turn',
  usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 7 },
  timestamp: 0,
})

describe('turn.step as an async generator', () => {
  test('`yield* next(e)` sends the request and the response goes on unchanged', async () => {
    const logged: string[] = []
    const { scope } = await hostWithMod((on) => {
      on('turn.step', async function* ($, e, next) {
        const result = (yield* next(e) as AsyncGenerator<unknown, unknown>) as {
          usage: { cache_read_input_tokens: number } | null
        }
        if (result.usage) logged.push(`cache read ${result.usage.cache_read_input_tokens}`)
        return result
      })
    })
    let sent = 0
    const message = await scope.modelStep('turn-1')!(
      { index: 0, modelId: 'model-a', messageCount: 2 },
      async () => (++sent, answer('hi')),
    )
    expect(message.content).toEqual([{ type: 'text', text: 'hi' }])
    expect(sent).toBe(1)
    expect(logged).toEqual(['cache read 7'])
  })

  test('a generator that streams and returns its own response sends no request', async () => {
    const { scope } = await hostWithMod((on) => {
      // The kit's rule: a streaming hook that never calls `next` returns its result.
      on('turn.step', async function* () {
        yield { kind: 'text', index: 0, text: 'Offline.' }
        return { answer: 'Offline.' }
      })
    })
    const message = await scope.modelStep('turn-1')!(
      { index: 0, modelId: 'model-a', messageCount: 1 },
      async () => {
        throw new Error('sent')
      },
    )
    expect(message.content).toEqual([{ type: 'text', text: 'Offline.' }])
    expect(message.stopReason).toBe('end_turn')
  })
})

describe("turn.step's usage", () => {
  /** The `usage` a hook reads from `next(e)` for one response with these counts. */
  async function usageSeen(usage: AssistantMessage['usage']) {
    const seen: unknown[] = []
    const { scope } = await hostWithMod((on) => {
      on('turn.step', async function* ($, e, next) {
        const result = (yield* next(e) as AsyncGenerator<unknown, unknown>) as { usage: unknown }
        seen.push(result.usage)
        return result
      })
    })
    await scope.modelStep('turn-1')!(
      { index: 0, modelId: 'model-a', messageCount: 1 },
      async () => ({ ...answer('hi'), ...(usage ? { usage } : {}) }),
    )
    return seen[0]
  }

  test('splits the cache write by the lifetime the provider named', async () => {
    expect(
      await usageSeen({
        inputTokens: 90,
        outputTokens: 2,
        cacheWriteTokens: 50,
        cacheWrite1hTokens: 30,
      }),
    ).toEqual({
      input_tokens: 90,
      output_tokens: 2,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 50,
      ephemeral_5m_input_tokens: 20,
      ephemeral_1h_input_tokens: 30,
      model: 'model-a',
    })
  })

  test('names no lifetime where the provider reported one total, or nothing was written', async () => {
    const total = await usageSeen({ inputTokens: 90, outputTokens: 2, cacheWriteTokens: 50 })
    expect(total).toMatchObject({ cache_creation_input_tokens: 50 })
    expect(total).not.toHaveProperty('ephemeral_5m_input_tokens')
    expect(total).not.toHaveProperty('ephemeral_1h_input_tokens')
    const none = await usageSeen({ inputTokens: 90, outputTokens: 2, cacheWrite1hTokens: 0 })
    expect(none).not.toHaveProperty('ephemeral_5m_input_tokens')
  })
})
