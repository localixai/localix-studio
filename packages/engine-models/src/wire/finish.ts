/**
 * HOW A RESPONSE ENDED, in Localix terms: the provider SDK's finish reason as the loop's stop
 * reason, and its usage as the counts a cost ledger prices.
 */
import type { LanguageModelV4FinishReason, LanguageModelV4Usage } from '@ai-sdk/provider'
import type { StopReason } from '@localixai/agent'

export function stopReasonOf(
  reason: LanguageModelV4FinishReason,
  hasToolCalls: boolean,
): StopReason {
  switch (reason.unified) {
    case 'stop':
      return hasToolCalls ? 'tool_use' : 'end_turn'
    case 'tool-calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'content-filter':
    case 'error':
      return 'error'
    // A provider-specific reason the SDK could not map: judged by what the response holds.
    case 'other':
      return hasToolCalls ? 'tool_use' : 'end_turn'
  }
}

export interface AssembledUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /**
   * The part of `cacheWriteTokens` written for one hour, where the provider names each write's
   * lifetime (the rest is five minutes); absent where it reports one total.
   */
  cacheWrite1hTokens?: number
  reasoningTokens?: number
}

/**
 * The one-hour part of a cache write in Anthropic's own usage (direct and Vertex alike):
 * `cache_creation` splits `cache_creation_input_tokens` by the lifetime each write asked for.
 * Undefined for a usage without that split, which every other API is.
 */
export function oneHourWritesOf(raw: unknown): number | undefined {
  const split =
    raw && typeof raw === 'object'
      ? (raw as { cache_creation?: unknown }).cache_creation
      : undefined
  if (!split || typeof split !== 'object') return undefined
  const long = (split as { ephemeral_1h_input_tokens?: unknown }).ephemeral_1h_input_tokens
  return typeof long === 'number' && Number.isFinite(long) && long >= 0 ? long : undefined
}

export function usageOf(usage: LanguageModelV4Usage): AssembledUsage {
  const input =
    usage.inputTokens.total ??
    (usage.inputTokens.noCache ?? 0) +
      (usage.inputTokens.cacheRead ?? 0) +
      (usage.inputTokens.cacheWrite ?? 0)
  const long = usage.inputTokens.cacheWrite !== undefined ? oneHourWritesOf(usage.raw) : undefined
  return {
    inputTokens: input,
    outputTokens: usage.outputTokens.total ?? 0,
    ...(usage.inputTokens.cacheRead !== undefined
      ? { cacheReadTokens: usage.inputTokens.cacheRead }
      : {}),
    ...(usage.inputTokens.cacheWrite !== undefined
      ? { cacheWriteTokens: usage.inputTokens.cacheWrite }
      : {}),
    ...(long !== undefined ? { cacheWrite1hTokens: long } : {}),
    ...(usage.outputTokens.reasoning !== undefined
      ? { reasoningTokens: usage.outputTokens.reasoning }
      : {}),
  }
}
