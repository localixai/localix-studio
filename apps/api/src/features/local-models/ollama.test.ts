import { describe, expect, test } from 'bun:test'

import { createOllamaModels } from './ollama'

/** An Ollama server as its HTTP API answers: `/api/tags` lists, `/api/show` describes. */
function ollama(models: Record<string, { capabilities: string[]; context?: number }>) {
  const calls: string[] = []
  const created: unknown[] = []
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const url = input
    calls.push(url)
    if (url.endsWith('/api/create')) {
      const body = JSON.parse(init?.body as string) as { model: string; from: string }
      created.push(body)
      models[body.model] = models[body.from]!
      return Response.json({ status: 'success' })
    }
    if (url.endsWith('/api/tags'))
      return Response.json({ models: Object.keys(models).map((name) => ({ name, model: name })) })
    if (url.endsWith('/api/show')) {
      const name = JSON.parse(init?.body as string).model as string
      const model = models[name]!
      return Response.json({
        capabilities: model.capabilities,
        model_info: model.context ? { 'gemma3.context_length': model.context } : {},
      })
    }
    return new Response('not found', { status: 404 })
  }
  return { fetchImpl, calls, created }
}

describe('Ollama models on this computer', () => {
  test('lists the chat models with tool calling a running Ollama serves, not embedding or speech', async () => {
    const server = ollama({
      'gemma4:e4b-it-qat': { capabilities: ['completion', 'vision', 'tools'], context: 131072 },
      'embeddinggemma:latest': { capabilities: ['embedding'] },
      'legraphista/orpheus:3b-ft-q4_k_m': { capabilities: [] },
      'qwen2.5vl:3b': { capabilities: ['completion', 'vision'] },
    })
    const models = createOllamaModels({ fetch: server.fetchImpl })
    await models.refresh()
    expect(models.list()).toEqual([
      {
        id: 'gemma4:e4b-it-qat-localix32k',
        name: 'gemma4:e4b-it-qat (Ollama, 32K copy)',
        contextWindow: 32768,
        vision: true,
        tools: true,
      },
    ])
    expect(models.has('gemma4:e4b-it-qat-localix32k')).toBe(true)
    expect(models.has('embeddinggemma:latest')).toBe(false)
    expect(models.endpoint()).toEqual({ baseUrl: 'http://127.0.0.1:11434', apiKey: 'ollama' })
  })

  test('says when the list changed, and only then', async () => {
    const server = ollama({ 'qwen2.5:3b-instruct': { capabilities: ['completion', 'tools'] } })
    const models = createOllamaModels({ fetch: server.fetchImpl })
    let changes = 0
    models.onListChanged(() => changes++)
    await models.refresh()
    await models.refresh()
    expect(changes).toBe(1)
    // A model already described is not asked about again.
    expect(server.calls.filter((url) => url.endsWith('/api/show'))).toHaveLength(1)
  })

  test('no Ollama running reads as no models, and its models go away when it stops', async () => {
    const server = ollama({ 'qwen2.5:3b-instruct': { capabilities: ['completion', 'tools'] } })
    let up = true
    const models = createOllamaModels({
      fetch: async (input, init) => {
        if (!up) throw new Error('ECONNREFUSED')
        return server.fetchImpl(input, init)
      },
    })
    await models.refresh()
    expect(models.list()).toHaveLength(1)
    up = false
    await models.refresh()
    expect(models.list()).toEqual([])
  })
})

test('the first use makes Localix’s copy of the model with room for the agent’s prompt', async () => {
  const server = ollama({
    'gemma4:e4b-it-qat': { capabilities: ['completion', 'tools'], context: 131072 },
    small: { capabilities: ['completion', 'tools'], context: 2048 },
  })
  const models = createOllamaModels({ fetch: server.fetchImpl })
  await models.refresh()
  expect(models.isReady('gemma4:e4b-it-qat-localix32k')).toBe(false)
  await models.ensure('gemma4:e4b-it-qat-localix32k')
  expect(server.created).toEqual([
    {
      model: 'gemma4:e4b-it-qat-localix32k',
      from: 'gemma4:e4b-it-qat',
      parameters: { num_ctx: 32768 },
      stream: false,
    },
  ])
  expect(models.isReady('gemma4:e4b-it-qat-localix32k')).toBe(true)
  // The copy is not listed as a model of its own, and an untagged name gets a valid tag.
  expect(models.list().map((model) => model.id)).toEqual([
    'gemma4:e4b-it-qat-localix32k',
    'small:latest-localix32k',
  ])
  // A model whose own context is smaller keeps it.
  expect(models.list().find((model) => model.id === 'small:latest-localix32k')?.contextWindow).toBe(
    2048,
  )
})

test('a run cancelled while its copy is being made stops the making', async () => {
  const server = ollama({ 'gemma4:e4b-it-qat': { capabilities: ['completion', 'tools'] } })
  let seen: AbortSignal | undefined
  const models = createOllamaModels({
    fetch: async (input, init) => {
      if (input.endsWith('/api/create')) {
        seen = init?.signal ?? undefined
        throw new DOMException('aborted', 'AbortError')
      }
      return server.fetchImpl(input, init)
    },
  })
  await models.refresh()
  const run = new AbortController()
  run.abort()
  await expect(models.ensure('gemma4:e4b-it-qat-localix32k', run.signal)).rejects.toThrow()
  expect(seen?.aborted).toBe(true)
})

describe('how often Ollama is asked', () => {
  /** Timers handed to the poller, run by hand: no test waits on a clock. */
  function timers() {
    const delays: number[] = []
    let next: (() => void) | undefined
    const schedule = (run: () => void, ms: number) => {
      delays.push(ms)
      next = run
      return () => {}
    }
    const tick = async () => {
      const run = next
      next = undefined
      run?.()
      for (let i = 0; i < 20; i++) await Promise.resolve()
    }
    return { delays, schedule, tick }
  }

  test('a computer without Ollama installed is never asked', async () => {
    const asked: string[] = []
    const clock = timers()
    const models = createOllamaModels({
      fetch: async (input) => {
        asked.push(input)
        return Response.json({ models: [] })
      },
    })
    models.start({ installed: () => false, schedule: clock.schedule })
    await clock.tick()
    expect(asked).toEqual([])
    expect(clock.delays).toEqual([])
  })

  test('an Ollama that is not running is asked less and less often, and at the beat once it runs', async () => {
    let running = false
    const clock = timers()
    const models = createOllamaModels({
      fetch: async () => {
        if (!running) throw new Error('connection refused')
        return Response.json({ models: [] })
      },
    })
    models.start({ intervalMs: 1000, maxIntervalMs: 5000, schedule: clock.schedule })
    for (let i = 0; i < 4; i++) await clock.tick()
    expect(clock.delays).toEqual([2000, 4000, 5000, 5000])
    running = true
    await clock.tick()
    expect(clock.delays.at(-1)).toBe(1000)
    models.stop()
  })
})
