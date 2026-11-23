import { describe, expect, test } from 'bun:test'
import type {
  JSONObject,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'

import { createModelSession } from './session'
import { countsOf } from './wire/partial-usage'

/**
 * A response cut short still costs what the provider read and wrote: the counts its own events
 * reported, or an estimate from the characters, marked as estimated so the host never takes them
 * for a measured context size.
 */
function streamingModel(parts: LanguageModelV4StreamPart[], calls: LanguageModelV4CallOptions[]) {
  return {
    specificationVersion: 'v4',
    provider: 'fake',
    modelId: 'fake-1',
    supportedUrls: {},
    doGenerate: () => Promise.reject(new Error('not used')),
    async doStream(options: LanguageModelV4CallOptions) {
      calls.push(options)
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part)
            // Left open: the run is stopped mid-response.
          },
        }),
      }
    },
  } as unknown as LanguageModelV4
}

async function stoppedAfter(parts: LanguageModelV4StreamPart[]) {
  const calls: LanguageModelV4CallOptions[] = []
  const controller = new AbortController()
  const turn = createModelSession(
    {
      ref: { providerId: 'anthropic', modelId: 'fake-1' },
      model: streamingModel(parts, calls),
      profile: { namespace: 'anthropic', cacheBreakpoints: false, temperature: true },
      origin: { api: 'anthropic-messages', provider: 'anthropic', model: 'fake-1' },
      cost: { input: 3, output: 15 },
      subscription: false,
    },
    { sessionId: 's', silence: { firstPartMs: 5_000, betweenPartsMs: 5_000 } },
  ).turn({
    systemPrompt: 'A system prompt of some length for the estimate.',
    messages: [{ role: 'user', content: 'Write a long answer, please.', timestamp: 0 }],
    tools: [],
    signal: controller.signal,
  })
  for await (const delta of turn) if (delta.kind === 'text' && delta.phase === 'delta') break
  controller.abort()
  return { message: await turn.message, calls }
}

const text = (delta: string): LanguageModelV4StreamPart[] => [
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta },
]

describe('the usage of a response cut short', () => {
  test('takes the counts the provider reported on the way, and asks for its events', async () => {
    const { message, calls } = await stoppedAfter([
      {
        type: 'raw',
        rawValue: {
          type: 'message_start',
          message: { usage: { input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 1 } },
        },
      },
      ...text('Hello there'),
    ])
    expect(calls[0]!.includeRawChunks).toBe(true)
    expect(message.stopReason).toBe('aborted')
    expect(message.usage).toMatchObject({
      inputTokens: 1_000,
      cacheReadTokens: 900,
      outputTokens: 3,
      estimated: true,
      costSource: 'estimated',
    })
    expect(message.usage!.totalCost).toBeGreaterThan(0)
  })

  test('estimates from the characters when the provider said nothing yet', async () => {
    const { message } = await stoppedAfter(text('x'.repeat(400)))
    expect(message.usage).toMatchObject({ outputTokens: 100, estimated: true })
    expect(message.usage!.inputTokens).toBeGreaterThan(0)
  })

  test('a response that said nothing costs nothing', async () => {
    const calls: LanguageModelV4CallOptions[] = []
    const controller = new AbortController()
    const turn = createModelSession(
      {
        ref: { providerId: 'anthropic', modelId: 'fake-1' },
        model: streamingModel([{ type: 'stream-start', warnings: [] }], calls),
        profile: { namespace: 'anthropic', cacheBreakpoints: false, temperature: true },
        origin: { api: 'anthropic-messages', provider: 'anthropic', model: 'fake-1' },
        subscription: false,
      },
      { sessionId: 's' },
    ).turn({ systemPrompt: 's', messages: [], tools: [], signal: controller.signal })
    setTimeout(() => controller.abort(), 0)
    expect((await turn.message).usage).toBeUndefined()
  })
})

/** A response that ends with its `finish` part, from a provider with Anthropic's cache rates. */
async function finished(parts: LanguageModelV4StreamPart[]) {
  const model = {
    specificationVersion: 'v4',
    provider: 'fake',
    modelId: 'fake-1',
    supportedUrls: {},
    doGenerate: () => Promise.reject(new Error('not used')),
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of parts) controller.enqueue(part)
          controller.close()
        },
      }),
    }),
  } as unknown as LanguageModelV4
  const turn = createModelSession(
    {
      ref: { providerId: 'anthropic', modelId: 'fake-1' },
      model,
      profile: { namespace: 'anthropic', cacheBreakpoints: true, temperature: true },
      origin: { api: 'anthropic-messages', provider: 'anthropic', model: 'fake-1' },
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      subscription: false,
    },
    { sessionId: 's' },
  ).turn({ systemPrompt: 's', messages: [], tools: [], signal: new AbortController().signal })
  return turn.message
}

const finishWith = (raw?: JSONObject): LanguageModelV4StreamPart => ({
  type: 'finish',
  usage: {
    inputTokens: { total: 1_100, noCache: 100, cacheRead: 0, cacheWrite: 1_000 },
    outputTokens: { total: 5, text: 5, reasoning: undefined },
    ...(raw ? { raw } : {}),
  },
  finishReason: { unified: 'stop', raw: 'end_turn' },
})

describe('the lifetime of what a response wrote to the cache', () => {
  test("takes the one-hour part from Anthropic's own split and prices it at twice the input", async () => {
    const message = await finished([
      ...text('ok'),
      finishWith({
        input_tokens: 100,
        output_tokens: 5,
        cache_creation_input_tokens: 1_000,
        cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 600 },
      }),
    ])
    expect(message.usage).toMatchObject({ cacheWriteTokens: 1_000, cacheWrite1hTokens: 600 })
    // 100 fresh × $3 + 400 five-minute writes × $3.75 + 600 one-hour writes × $6 + 5 out × $15.
    expect(message.usage!.totalCost).toBeCloseTo(
      (100 * 3 + 400 * 3.75 + 600 * 6 + 5 * 15) / 1e6,
      10,
    )
  })

  test('names no lifetime where the provider reports one total', async () => {
    const message = await finished([
      ...text('ok'),
      finishWith({ cache_creation_input_tokens: 1_000 }),
    ])
    expect(message.usage).toMatchObject({ cacheWriteTokens: 1_000 })
    expect(message.usage!.cacheWrite1hTokens).toBeUndefined()
  })

  test('reads the split from the first event of a response cut short', () => {
    expect(
      countsOf({
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 10,
            output_tokens: 1,
            cache_creation_input_tokens: 50,
            cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 30 },
          },
        },
      }),
    ).toEqual({ inputTokens: 60, outputTokens: 1, cacheWriteTokens: 50, cacheWrite1hTokens: 30 })
  })
})

describe('the counts a provider event carries', () => {
  test('in the shape of each supported API', () => {
    expect(countsOf({ type: 'message_delta', usage: { output_tokens: 42 } })).toEqual({
      outputTokens: 42,
    })
    expect(
      countsOf({
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 7,
          thoughtsTokenCount: 3,
          cachedContentTokenCount: 20,
        },
      }),
    ).toEqual({ inputTokens: 50, outputTokens: 10, cacheReadTokens: 20, reasoningTokens: 3 })
    expect(
      countsOf({
        type: 'response.incomplete',
        response: {
          usage: {
            input_tokens: 80,
            output_tokens: 9,
            input_tokens_details: { cached_tokens: 64 },
            output_tokens_details: { reasoning_tokens: 4 },
          },
        },
      }),
    ).toEqual({ inputTokens: 80, outputTokens: 9, cacheReadTokens: 64, reasoningTokens: 4 })
    expect(
      countsOf({
        choices: [],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 10 },
        },
      }),
    ).toEqual({ inputTokens: 30, outputTokens: 5, cacheReadTokens: 10 })
    expect(
      countsOf({
        metadata: { usage: { inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 5 } },
      }),
    ).toEqual({ inputTokens: 15, outputTokens: 2, cacheReadTokens: 5 })
    expect(countsOf({ type: 'response.created', response: { usage: null } })).toBeUndefined()
  })
})
