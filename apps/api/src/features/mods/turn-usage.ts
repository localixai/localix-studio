import type { ModelUsage } from './contracts'

/** Localix's counts of one request (`@localixai/agent`'s `Usage`) or of a turn's requests summed. */
export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** The part of `cacheWriteTokens` written for one hour; absent where no lifetime was named. */
  cacheWrite1hTokens?: number
}

/**
 * The usage `turn.step` resolves to and `turn.complete` carries, as Claude Code 2.1.330 gives it
 * (`TurnUsage`): the request's counts, the model that answered, and the cache write by lifetime.
 */
export type TurnUsage = ModelUsage & {
  model: string
  ephemeral_5m_input_tokens?: number
  ephemeral_1h_input_tokens?: number
}

/**
 * Localix's counts in Claude Code's words. The two lifetime parts come together or not at all, and
 * only where the provider named each write's lifetime (Anthropic's `usage.cache_creation`, which
 * `@localixai/engine-models` keeps as `cacheWrite1hTokens`) and something was written: Claude
 * Code's declaration leaves both out "where no write named its lifetime (none was made, or the
 * provider reports none)". A provider's single total is never split by guess; a reader prices an
 * unsplit write as five minutes itself, as Claude Code's `/cost` does.
 */
export function turnUsageOf(counts: TokenCounts, model: string): TurnUsage {
  const written = counts.cacheWriteTokens ?? 0
  const long = counts.cacheWrite1hTokens
  const longPart = long === undefined ? 0 : Math.min(written, long)
  return {
    input_tokens: counts.inputTokens,
    output_tokens: counts.outputTokens,
    cache_read_input_tokens: counts.cacheReadTokens ?? 0,
    cache_creation_input_tokens: written,
    ...(written > 0 && long !== undefined
      ? { ephemeral_5m_input_tokens: written - longPart, ephemeral_1h_input_tokens: longPart }
      : {}),
    model,
  }
}
