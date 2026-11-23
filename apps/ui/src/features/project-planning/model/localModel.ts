/**
 * Whether this person can plan on a model that runs on their own computer, and which. Two kinds
 * sit behind Localix's `local` provider: a model downloaded in Settings → Models, and a chat model
 * an Ollama already running here serves. A model server connected as a provider of its own
 * (LM Studio, llama.cpp) counts too; its models are picked in the model picker.
 */

/** The provider the API registers on-this-computer models under. */
export const LOCAL_PROVIDER_ID = 'local'
/** Providers whose models are served by a program on this computer. */
const LOCAL_SERVER_PROVIDERS = new Set(['ollama', 'lmstudio', 'llama', 'llamacpp', 'llama-cpp'])

export interface LocalModelChoice {
  /** The connection to route through; null when Local is not connected yet (planning adds it). */
  connectionId: string | null
  /** The chat model to route to; null for a server provider, whose models the picker lists. */
  modelId: string | null
}

export function findLocalModel(
  connections: readonly { id: string; providerId: string }[],
  installed: readonly { id: string; kind: string }[],
  external: readonly { id: string }[] = [],
): LocalModelChoice | null {
  const local = connections.find((connection) => connection.providerId === LOCAL_PROVIDER_ID)
  const model = installed.find((candidate) => candidate.kind === 'chat') ?? external[0]
  if (model) return { connectionId: local?.id ?? null, modelId: model.id }
  const server = connections.find((connection) => LOCAL_SERVER_PROVIDERS.has(connection.providerId))
  return server ? { connectionId: server.id, modelId: null } : null
}
