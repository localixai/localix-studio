import { classifyAgentError, type AgentErrorInfo } from './error-classification'
import { providerWords } from './provider-words'

/**
 * HOW A FAILED RUN IS SAID TO A PERSON — one presenter for every surface that says it.
 *
 * A failed run used to be worded three times, by three owners: the transcript line appended
 * "Trying again may work." to the classifier's sentence (which itself still said "Retrying…"
 * after the last retry was spent), the Event Center row titled it "Agent run failed" with the
 * same sentence as its body, and the provider's condition row said it a third time. Where the
 * classifier had no sentence of its own, all three showed the provider's raw body —
 * `403: {"message":"Key limit exceeded…"}` — as if it were an explanation.
 *
 * So the classification (`error-classification.ts`, which decides what the HOST does: retry,
 * compress, cool a route down) is followed by ONE presentation (what the PERSON reads and can
 * do), and every surface renders from its parts:
 *
 *   headline  "Could not …" — the journal row's title; names the conversation when given one
 *   reason    one human sentence ending in a full stop — the transcript notice and the row body
 *   actions   what can be done, from the open recovery set below; first is primary
 *   detail    the error's own text, when it had any, for a tooltip or a log — never the reason
 *             (the reason may quote its readable words: `provider-words.ts`)
 *   severity  `error` when trying again cannot help, `warning` when it may
 *
 * Recovery is an OPEN set of typed verbs rather than prose ("sign in from Settings"), because a
 * control beside the sentence is what makes it actionable, and because a Retry offered for a
 * spent quota is a promise it cannot keep:
 *
 *   retry | open-settings:<tab>[/<anchor>] | open-store:<kind>[/<id>] | sign-in:<connectionId> | restart:<subject>
 *
 * The host resolves each verb to a destination (`apps/api` `notifications/recovery.ts`).
 */

export type Recovery =
  | 'retry'
  | `open-settings:${string}`
  | `open-store:${string}`
  | `sign-in:${string}`
  | `restart:${string}`

export interface PresentedError {
  headline: string
  reason: string
  actions: Recovery[]
  detail?: string
  /**
   * `reason` without the error's own words, for a surface outside the app (a system notification
   * banner, which can show on a locked screen). Absent when `reason` quotes nothing.
   */
  plainReason?: string
  severity: 'warning' | 'error'
}

export interface PresentContext {
  /** The conversation's title, named in the headline. */
  conversation?: string
  /** The provider connection the run went out on; a refused key offers to sign in to it. */
  connectionId?: string | null
}

const DETAIL_MAX = 300

const sentence = (text: string): string => {
  const trimmed = text.trim()
  return /[.!?…]$/u.test(trimmed) ? trimmed : `${trimmed}.`
}

/** The error's own text for a tooltip or a log: its `detail`, or a verbatim message. */
function detailOf(info: AgentErrorInfo): string | undefined {
  const raw = info.detail ?? (info.verbatim ? info.userMessage : undefined)
  const text = raw?.replace(/^Error:\s*/u, '').trim()
  if (!text) return undefined
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX - 1)}…` : text
}

/** A generic lead, followed by the error's own words when it has any. */
function withWords(lead: string, raw: string): Pick<PresentedError, 'reason' | 'plainReason'> {
  const words = providerWords(raw)
  return words
    ? { reason: sentence(`${lead}: ${words}`), plainReason: `${lead}.` }
    : { reason: `${lead}.` }
}

/** Reason and recovery for an already-classified failure — the run finalizer's entry. */
export function presentErrorInfo(
  info: AgentErrorInfo,
  context: PresentContext = {},
): PresentedError {
  const headline = context.conversation?.trim()
    ? `Could not finish the reply in “${context.conversation.trim()}”`
    : 'Could not finish the reply'
  const providers: Recovery = 'open-settings:providers'
  const detail = detailOf(info)
  const shape = ((): Pick<PresentedError, 'reason' | 'actions' | 'plainReason'> => {
    if (info.authFailed) {
      return {
        // A sign-in that could not be renewed says so in the classifier's words ("Your sign-in to
        // OpenAI has expired…"); a refused key or token keeps the one sentence for both.
        reason: info.signInExpired
          ? sentence(info.userMessage)
          : 'The provider refused the API key or sign-in.',
        actions: [context.connectionId ? `sign-in:${context.connectionId}` : providers],
      }
    }
    if (info.rateLimited) {
      return info.retryable
        ? {
            reason: 'The provider is rate-limiting requests. Wait a moment, then try again.',
            actions: ['retry'],
          }
        : { reason: 'This connection has reached its usage limit.', actions: [providers] }
    }
    if (info.recovery) return { reason: sentence(info.userMessage), actions: [...info.recovery] }
    // Not on this computer yet: its download (in the model picker) is the way, not a provider.
    if (info.modelUnavailable === 'model_not_downloaded') {
      return { reason: sentence(info.userMessage), actions: [] }
    }
    if (info.modelUnavailable) return { reason: sentence(info.userMessage), actions: [providers] }
    // A retry sends the same history and fails the same way; the reason says what does help.
    if (info.kind === 'context_overflow') return { reason: sentence(info.userMessage), actions: [] }
    // Text no sentence was written for: its own words after a generic lead, never its raw body,
    // and the generic sentence alone only when it has no words at all.
    if (info.verbatim) {
      return info.retryable
        ? {
            ...withWords('The provider had a temporary error', info.userMessage),
            actions: ['retry'],
          }
        : { ...withWords('The run stopped on an unexpected error', info.userMessage), actions: [] }
    }
    return {
      reason: sentence(info.userMessage),
      ...(info.plain ? { plainReason: info.plain } : {}),
      actions: info.retryable ? ['retry'] : [],
    }
  })()
  return {
    headline,
    ...shape,
    ...(detail ? { detail } : {}),
    severity: info.retryable ? 'warning' : 'error',
  }
}

/** Classify and present in one step, for a caller holding the raw error. */
export function presentError(error: unknown, context: PresentContext = {}): PresentedError {
  return presentErrorInfo(classifyAgentError(error), context)
}
