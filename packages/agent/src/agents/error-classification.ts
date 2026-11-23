import { HumanInLoopDismissedError, HumanInLoopTimeoutError } from './human-in-loop'
import { AgentRunError, MODEL_NOT_DOWNLOADED } from './errors'
import {
  isProviderHttpError,
  providerResponseOf,
  providerRetryDelayMs,
} from '../utils/provider-http-error'
import { agentRunErrorToInfo } from './agent-run-error-info'
import type { AgentErrorInfo } from './error-classification-contracts'
import {
  isContextOverflowMessage,
  isRetryableProviderMessage,
  extractProviderStatus,
  isLimitCappedMessage,
  isRegionBlockedMessage,
  RETRYABLE_PROVIDER_MESSAGE,
  HTTP_STATUS_SENTENCES,
} from './error-classification-signals'
import {
  REGION_BLOCKED_MESSAGE,
  namedEndingInfo,
  networkInfo,
  providerSentence,
  signInInfo,
} from './error-classification-sentences'

export type { AgentErrorInfo } from './error-classification-contracts'
export { extractProviderStatus } from './error-classification-signals'
export { coerceToolResult } from './tool-result-coercion'

// ---- Public error utilities ----------------------------------------------------

/**
 * What an overflow tells the person when no recovery absorbed it. Host-neutral: the SDK does
 * not know which commands its host offers, only what fixes the request.
 */
const CONTEXT_OVERFLOW_MESSAGE =
  'The conversation exceeded the model context window. Clear or shorten the conversation and resend, or switch to a model with a larger context window.'

/**
 * Classify an error thrown by an agent loop or tool execution into a
 * consumer-facing description. Use this to build user-facing error messages
 * without duplicating error-type checks in every consumer.
 */
export function classifyAgentError(error: unknown): AgentErrorInfo {
  const info = classifyErrorKind(error)
  // ONE place decides how long the provider said to wait, for every branch that produced a
  // rate limit or a retryable fault — not just the one branch that happens to see an HTTP
  // response. Runtime adapters may flatten transport classes to a bare Error, so rate-limit
  // timing is read after classification rather than only in the named FetchError branch.
  if (info.retryAfterMs !== undefined || !(info.rateLimited || info.retryable)) return info
  // Prose is mined only for a RATE LIMIT: a usage cap may state its reset only in its message
  // ("Try again in ~N min.") with no header carrying it, and a plain transient message
  // ("Service unavailable, try again in 30 minutes") is not an instruction about an allowance.
  const stated = providerRetryDelayMs(error, Date.now(), { fromMessage: info.rateLimited })
  return stated === undefined ? info : { ...info, retryAfterMs: stated }
}

function carriesProviderStatus(error: unknown): error is Error {
  const status = error instanceof Error ? providerResponseOf(error)?.status : undefined
  return status !== undefined && status >= 100 && status < 600
}

function classifyErrorKind(error: unknown): AgentErrorInfo {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'RetryAbortError')) {
    return { kind: 'abort', userMessage: 'Cancelled', retryable: false }
  }
  if (error instanceof HumanInLoopDismissedError) {
    return { kind: 'dismissed', userMessage: 'Interaction cancelled', retryable: true }
  }
  if (error instanceof HumanInLoopTimeoutError) {
    return {
      kind: 'timeout',
      userMessage: 'The request expired before a response was provided.',
      retryable: true,
    }
  }

  if (error instanceof AgentRunError) {
    return agentRunErrorToInfo(error)
  }

  // A sign-in its provider would not renew, or a sign-in server that failed the renewal.
  const signIn = signInInfo(error)
  if (signIn) return signIn

  // A local model that is not on this computer yet: the provider's own sentence says what to do.
  if (error instanceof Error && error.message.includes(MODEL_NOT_DOWNLOADED)) {
    return {
      kind: 'fatal',
      userMessage: error.message
        .slice(error.message.indexOf(MODEL_NOT_DOWNLOADED) + MODEL_NOT_DOWNLOADED.length)
        .trim(),
      retryable: false,
      modelUnavailable: 'model_not_downloaded',
    }
  }

  // A provider rejection — recognized by NAME, and its status read back out of the
  // "provider 401: …" message shape. Both are owned by `utils/provider-http-error.ts`;
  // this is the branch that makes them load-bearing (retry / failover / compact-and-retry).
  // An error that carries the provider's response (`attachProviderResponse`, an SDK error with
  // its status) is one too, whatever it is named: missing the branch turns a 5xx into a fatal.
  if (isProviderHttpError(error) || carriesProviderStatus(error)) {
    const status = extractProviderStatus(error)
    // A 413 (payload too large) from an LLM endpoint is virtually always an oversized
    // prompt, and a 400 that names the window is the same class. Both recover by sending
    // less history, never by a plain retry, which fails identically; `shouldCompress`
    // tells a host that wires that recovery, and the message is what is left when none does.
    if (
      status === 413 ||
      ((status === 400 || status === 0) && isContextOverflowMessage(error.message))
    ) {
      return {
        kind: 'context_overflow',
        userMessage: CONTEXT_OVERFLOW_MESSAGE,
        retryable: false,
        shouldCompress: true,
      }
    }
    // Retry transient faults: 5xx (server/overload, incl. Anthropic's 529), 429
    // (rate limit) and 408 (request timeout) all clear on a retry. The loop's retry
    // path uses exponential backoff + a small attempt cap, so re-issuing a 429 is
    // gentle, not a hammer — and previously a raw `provider 429:` FetchError killed
    // the whole turn on the first hiccup (only the AgentRunError-wrapped form was
    // retried). A persistent 429/5xx also warrants provider/key fallback.
    // A quota/billing cap is terminal even when it arrives as a 429 (OpenAI's
    // "exceeded your current quota") — retrying can't clear it. Otherwise fall back
    // to the message patterns when no status could be parsed (proxy-mangled errors).
    const limitCapped = isLimitCappedMessage(error.message)
    const transient =
      !limitCapped &&
      (status >= 500 ||
        status === 429 ||
        status === 408 ||
        (status === 0 && RETRYABLE_PROVIDER_MESSAGE.test(error.message)))
    const fixed = HTTP_STATUS_SENTENCES[status]
    const sentence =
      fixed !== undefined
        ? { userMessage: fixed }
        : isRegionBlockedMessage(error.message)
          ? { userMessage: REGION_BLOCKED_MESSAGE }
          : providerSentence(status, error.message, transient)
    return {
      kind: 'fatal',
      ...sentence,
      retryable: transient,
      // The sentence above is this classifier's; the provider's whole answer stays as detail.
      ...(fixed === undefined ? { detail: error.message } : {}),
      // No `retryAfterMs` here: `classifyAgentError` reads the stated delay ONCE, for every
      // branch. Setting it again here recomputed the same parse and left the key present with
      // an undefined value when the response said nothing.
      ...(limitCapped || status === 429 ? { rateLimited: true } : {}),
      ...(status === 401 ? { authFailed: true } : {}),
    }
  }

  // A provider timeout, matched by bare name because runtime adapters own the concrete
  // error class. `AbortSignal.timeout()` also aborts with a WHATWG `DOMException` named
  // `TimeoutError`, so both common sources share this structural boundary.
  // That makes 'TimeoutError' a RESERVED name in this vocabulary: any OTHER minter of it
  // is silently reported to the user as a provider fault and retried as one. `apps/api`'s
  // host-side deadline primitive (`lib/timeout.ts`) once did exactly that, so it is named
  // `DeadlineExceededError` instead. A reserved-name rule in
  // Runtime adapters keep this transport-independent — same
  // bare-string defect class as `AbortError` / `FetchError` / `tool_use`.
  if (error instanceof Error && error.name === 'TimeoutError') {
    return {
      kind: 'fatal',
      userMessage: 'Request timed out. The provider took too long to respond.',
      retryable: true,
    }
  }

  // Provider stream went idle mid-response (model emitted some output then hung).
  // Matched by name to avoid a dependency on the adapter module.
  if (error instanceof Error && error.name === 'StreamIdleTimeoutError') {
    return {
      kind: 'timeout',
      userMessage:
        'The model stalled mid-response and stopped sending data. Try again or pick another model.',
      retryable: true,
    }
  }

  // Host-side deadlines are deterministic local failures, not provider timeouts.
  // Handle them before the message-based transient-provider fallback below.
  if (error instanceof Error && error.name === 'DeadlineExceededError') {
    return { kind: 'fatal', userMessage: `Error: ${error.message}`, retryable: false }
  }

  // A response that ended without finishing, named by the model adapter.
  const ending = namedEndingInfo(error)
  if (ending) return ending

  // A request that never got an answer (no HTTP status to classify above): the address did not
  // resolve, the server refused, the connection dropped, a certificate or a proxy refused.
  const network = networkInfo(error)
  if (network) return network

  const msg = error instanceof Error ? error.message : String(error)
  // Message-only classification for errors that reach here without a usable class
  // name or status (mid-stream SSE `error` payloads, proxy-flattened errors):
  // an overflow asks for a smaller history, a stated transient fault retries — the same
  // recoveries the typed branches above wire, so an unlucky error shape doesn't
  // kill the turn where a well-shaped one would recover.
  if (isContextOverflowMessage(msg)) {
    return {
      kind: 'context_overflow',
      userMessage: CONTEXT_OVERFLOW_MESSAGE,
      retryable: false,
      shouldCompress: true,
    }
  }
  if (isRetryableProviderMessage(msg)) {
    return {
      kind: 'fatal',
      ...providerSentence(0, msg, true),
      retryable: true,
      detail: msg,
    }
  }
  // A quota / usage-limit / plan cap that arrived WITHOUT a parseable status (proxy-
  // flattened, or a mid-stream SSE error payload — how the prolite-plan "usage limit"
  // failures reached us). Terminal, but flagged rate-limited so it isn't an opaque fatal.
  if (isLimitCappedMessage(msg)) {
    return {
      kind: 'fatal',
      userMessage: `Error: ${msg}`,
      retryable: false,
      rateLimited: true,
      verbatim: true,
    }
  }
  return { kind: 'fatal', userMessage: `Error: ${msg}`, retryable: false, verbatim: true }
}
