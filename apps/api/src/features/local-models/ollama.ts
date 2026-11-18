/**
 * Chat models an Ollama server already running on this computer serves. They join the `local`
 * provider beside the models Localix downloads itself, so a model someone runs in Ollama is
 * picked like any other local model: no key, no account, nothing leaves the computer. Requests go
 * to Ollama's own OpenAI-compatible endpoint.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'
/** Ollama checks no key; the OpenAI wire still sends one. */
const API_KEY = 'ollama'
/** Asked of a model whose card names no context length. */
const FALLBACK_CONTEXT = 8192
const REQUEST_TIMEOUT_MS = 2500
/**
 * The context Localix's copy of a model is made with. Ollama starts a model at its own default
 * (4096 tokens) and its OpenAI endpoint cannot ask for more, while an agent's system prompt and
 * tools take about 8K and a planning turn passes 16K: below that the run is refused or Ollama cuts
 * the prompt and the tools are lost.
 */
const AGENT_CONTEXT = 32_768
/** Localix's copies carry this suffix; they share the original's weights. */
const COPY_SUFFIX = '-localix32k'
/** Every copy Localix made, whatever context it was made with: never listed as a model. */
const COPY_MARK = '-localix'
const CREATE_TIMEOUT_MS = 120_000

/** Localix's copy of `name`: the same model, made with room for an agent's prompt. */
export function localixCopyOf(name: string): string {
  return `${name.includes(':') ? name : `${name}:latest`}${COPY_SUFFIX}`
}

export interface OllamaChatModel {
  id: string
  name: string
  contextWindow: number
  vision: boolean
  tools: boolean
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

interface Described {
  chat: boolean
  contextWindow: number
  vision: boolean
  tools: boolean
}

function contextOf(info: unknown): number {
  if (!info || typeof info !== 'object') return FALLBACK_CONTEXT
  for (const [key, value] of Object.entries(info))
    if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) return value
  return FALLBACK_CONTEXT
}

export function createOllamaModels(options: { baseUrl?: string; fetch?: Fetch } = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetchImpl: Fetch = options.fetch ?? ((input, init) => fetch(input, init))
  const described = new Map<string, Described>()
  const listeners = new Set<() => void>()
  let models: OllamaChatModel[] = []
  /** Every name the server lists, copies included: which copies already exist. */
  let present = new Set<string>()
  /** Listed id → the model it is a copy of, and the context it is made with. */
  const sources = new Map<string, { from: string; context: number }>()
  let timer: ReturnType<typeof setInterval> | undefined

  const ask = async (path: string, init?: RequestInit) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Ollama answered ${response.status}`)
    return (await response.json()) as Record<string, unknown>
  }

  const describe = async (name: string): Promise<Described> => {
    const known = described.get(name)
    if (known) return known
    const show = await ask('/api/show', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: name }),
    })
    const capabilities = Array.isArray(show.capabilities) ? (show.capabilities as string[]) : []
    const next = {
      chat: capabilities.includes('completion'),
      contextWindow: contextOf(show.model_info),
      vision: capabilities.includes('vision'),
      tools: capabilities.includes('tools'),
    }
    described.set(name, next)
    return next
  }

  const read = async (): Promise<OllamaChatModel[]> => {
    try {
      const tags = await ask('/api/tags')
      const names = (Array.isArray(tags.models) ? tags.models : [])
        .map((entry) => (entry as { name?: unknown }).name)
        .filter((name): name is string => typeof name === 'string')
      present = new Set(names)
      const listed: OllamaChatModel[] = []
      for (const name of names) {
        if (name.includes(COPY_MARK)) continue
        const model = await describe(name).catch(() => null)
        // An agent run calls tools (the task board, files…): a model that cannot is not offered.
        if (model?.chat && model.tools) {
          const id = localixCopyOf(name)
          const context = Math.min(model.contextWindow, AGENT_CONTEXT)
          sources.set(id, { from: name, context })
          listed.push({
            id,
            name: `${name} (Ollama)`,
            contextWindow: context,
            vision: model.vision,
            tools: model.tools,
          })
        }
      }
      return listed
    } catch {
      // Not running: nothing to list.
      return []
    }
  }

  return {
    list: (): readonly OllamaChatModel[] => models,
    has: (id: string) => models.some((model) => model.id === id),
    /** Localix's copy exists in Ollama, so a run can use it now. */
    isReady: (id: string) => present.has(id),
    /** Make Localix's copy of the model in Ollama: the same weights, with the agent's context. */
    async ensure(id: string): Promise<void> {
      if (present.has(id)) return
      const source = sources.get(id)
      if (!source) throw new Error(`Ollama no longer serves the model behind ${id}.`)
      const response = await fetchImpl(`${baseUrl}/api/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: id,
          from: source.from,
          parameters: { num_ctx: source.context },
          stream: false,
        }),
        signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
      })
      if (!response.ok)
        throw new Error(`Ollama could not prepare ${source.from} (HTTP ${response.status}).`)
      present = new Set([...present, id])
    },
    endpoint: () => ({ baseUrl, apiKey: API_KEY }),
    /** Read the server's list again; listeners hear only a list that changed. */
    async refresh(): Promise<void> {
      const next = await read()
      if (JSON.stringify(next) === JSON.stringify(models)) return
      models = next
      for (const listener of listeners) listener()
    },
    onListChanged(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Keep the list current while the app runs: a model pulled or removed shows within a beat. */
    start(intervalMs = 15_000): void {
      if (timer) return
      void this.refresh()
      timer = setInterval(() => void this.refresh(), intervalMs)
      timer.unref?.()
    },
    stop(): void {
      if (timer) clearInterval(timer)
      timer = undefined
    },
  }
}

export type OllamaModels = ReturnType<typeof createOllamaModels>
