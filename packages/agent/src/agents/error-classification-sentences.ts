/**
 * HOW A FAILURE THE CLASSIFIER RECOGNISES IS WORDED: a provider's status with its own words, a
 * sign-in that could not be renewed, a response that ended without finishing, a request that never
 * reached its server. `error-classification.ts` decides the ORDER these are tried in; this module
 * says each one in a sentence for a person, and keeps the error's own text as `detail`.
 */
import type { AgentErrorInfo } from './error-classification-contracts'
import { isSignInExpiredError, isSignInServerError } from './errors'
import { networkFailureOf } from './network-failure'
import { providerWords } from './provider-words'

export const REGION_BLOCKED_MESSAGE = 'The provider does not serve your country or region.'

/**
 * How a response that ended without finishing is named by the model adapter
 * (`engine-models/wire/endings.ts`), and whether sending it again may help. Each message is
 * already a sentence for a person; matched by name, like `TimeoutError`, so no adapter class
 * crosses into the core.
 */
const NAMED_ENDINGS: Readonly<Record<string, boolean>> = {
  ProviderPrematureCloseError: true,
  ProviderFinishError: true,
  ProviderMalformedResponseError: true,
  ProviderUnexpectedShapeError: false,
  ContentFilterError: false,
}

const endSentence = (text: string): string => (/[.!?…]$/u.test(text) ? text : `${text}.`)

/**
 * A provider failure this classifier has no fixed sentence for, said with the status and the
 * provider's own words (`providerWords`), never its raw body and never "an unexpected error".
 * `plain` is the same sentence without those words, for a surface outside the app.
 */
export function providerSentence(
  status: number,
  raw: string,
  transient: boolean,
): Pick<AgentErrorInfo, 'userMessage' | 'plain'> {
  const code = status ? ` (${status})` : ''
  const lead = transient
    ? `The provider had a temporary error${code}`
    : status
      ? `The provider refused the request${code}`
      : 'The provider reported an error'
  const words = providerWords(raw)
  return words
    ? { userMessage: endSentence(`${lead}: ${words}`), plain: `${lead}.` }
    : { userMessage: `${lead}.` }
}

/**
 * A sign-in its provider refused to renew (only signing in again helps; its answer, such as
 * `invalid_grant`, is kept as detail), or a sign-in SERVER that failed the renewal: temporary for
 * a 5xx, 429 or 408 (with no rate limit flag, so no model route cools down), otherwise its own
 * words after the status.
 */
export function signInInfo(error: unknown): AgentErrorInfo | undefined {
  if (isSignInExpiredError(error)) {
    return {
      kind: 'fatal',
      userMessage: `Your sign-in to ${error.provider} has expired or was revoked. Sign in again.`,
      retryable: false,
      authFailed: true,
      signInExpired: true,
      detail: error.message,
    }
  }
  if (!isSignInServerError(error)) return undefined
  const { provider, status } = error
  const transient = status >= 500 || status === 429 || status === 408
  const words = providerWords(error.body)
  const refused = `The sign-in server of ${provider} refused to renew the sign-in (${status})`
  const userMessage = transient
    ? `The sign-in server of ${provider} had a temporary error (${status}). Try again in a moment.`
    : words
      ? endSentence(`${refused}: ${words}`)
      : `${refused}.`
  return { kind: 'fatal', userMessage, retryable: transient, detail: error.message }
}

/**
 * A named ending. The detail names the reader's error and no more: its message carries the chunk
 * it could not read, which is the model's own text or a tool call's arguments.
 */
export function namedEndingInfo(error: unknown): AgentErrorInfo | undefined {
  if (!(error instanceof Error) || !(error.name in NAMED_ENDINGS)) return undefined
  const cause = error.cause instanceof Error ? error.cause.name : undefined
  return {
    kind: 'fatal',
    userMessage: error.message,
    retryable: NAMED_ENDINGS[error.name]!,
    ...(cause ? { detail: cause } : {}),
  }
}

/** A request that never reached its server, by cause (`network-failure.ts`). */
export function networkInfo(error: unknown): AgentErrorInfo | undefined {
  const network = networkFailureOf(error)
  if (!network) return undefined
  return {
    kind: 'fatal',
    userMessage: network.userMessage,
    retryable: network.retryable,
    ...(network.detail ? { detail: network.detail } : {}),
  }
}
