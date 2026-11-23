export type AgentRunErrorCode =
  | 'AGENT_UNAVAILABLE'
  | 'NO_PROVIDER_CONNECTION'
  | 'NO_MODEL'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_ACCESS_DENIED'
  | 'PROVIDER_INSUFFICIENT_CREDITS'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'ABORTED'
  | 'HITL_DISMISSED'
  | 'HITL_TIMEOUT'

/**
 * Why a chosen model could not be bound to a working provider — the typed half of
 * `NO_PROVIDER_CONNECTION`.
 *
 * Three different failures used to share one code and one sentence ("No provider connection
 * selected"): a model the catalog no longer lists, a provider with no enabled key, and a
 * connection whose credential could not be loaded. Each has a different fix (pick another model,
 * connect or enable a key, sign in again), so the host names which one it was and the message
 * follows from that, never from matching prose.
 */
export type ModelUnavailableReason =
  | 'model_not_in_catalog'
  | 'no_enabled_key'
  | 'credential_unavailable'
  | 'model_not_downloaded'

/**
 * How a provider whose models run on this computer says one is not on it yet. A provider's
 * stream error reaches the host as text only, so the sentence carries this prefix and the
 * classifier reads the reason from it — then shows the sentence after it, which the provider
 * wrote for a person ("Gemma 4 E2B is still downloading — 40%…").
 */
export const MODEL_NOT_DOWNLOADED = 'Local model not ready:'

export class AgentRunError extends Error {
  readonly code: AgentRunErrorCode
  /** Set with `NO_PROVIDER_CONNECTION` when the host knows which resolution step failed. */
  readonly reason?: ModelUnavailableReason

  constructor(
    code: AgentRunErrorCode,
    message: string,
    options?: { reason?: ModelUnavailableReason },
  ) {
    super(message)
    this.name = 'AgentRunError'
    this.code = code
    if (options?.reason) this.reason = options.reason
  }
}

export function isAgentRunError(err: unknown): err is AgentRunError {
  return err instanceof AgentRunError
}

/** The `name` a refused sign-in renewal carries; matched by name across package boundaries. */
export const SIGN_IN_EXPIRED_ERROR_NAME = 'SignInExpiredError'

/**
 * A provider's sign-in can no longer be renewed: its token endpoint refused the refresh grant
 * (OAuth `invalid_grant`, `invalid_client`, a revoked token) or the stored sign-in lacks what a
 * refresh needs. Every request on the connection fails the same way until the person signs in
 * again, so the classifier reads it as a refused credential with that one fix. `message` keeps the
 * endpoint's own answer for the log and the detail; `provider` is the name a person knows.
 */
export class SignInExpiredError extends Error {
  readonly provider: string

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = SIGN_IN_EXPIRED_ERROR_NAME
    this.provider = provider
  }
}

/** True for a {@link SignInExpiredError}, also one built by another copy of this package. */
export function isSignInExpiredError(error: unknown): error is SignInExpiredError {
  return (
    error instanceof Error &&
    error.name === SIGN_IN_EXPIRED_ERROR_NAME &&
    typeof (error as { provider?: unknown }).provider === 'string'
  )
}

/** The `name` a sign-in server's failure carries; matched by name like `SignInExpiredError`. */
export const SIGN_IN_SERVER_ERROR_NAME = 'SignInServerError'

/**
 * A provider's SIGN-IN server (its token endpoint, not the model API) failed a renewal without
 * refusing the grant itself: it was down or rate-limiting (5xx, 429), or it refused for a reason
 * signing in again does not change (GitHub's 403 for a removed Copilot seat, an OAuth
 * `invalid_request`). Kept apart from a model provider's HTTP error, so a 429 here never cools a
 * model route down. `body` is the server's answer, for its readable words.
 */
export class SignInServerError extends Error {
  readonly provider: string
  readonly status: number
  readonly body: string

  constructor(provider: string, status: number, message: string, body: string) {
    super(message)
    this.name = SIGN_IN_SERVER_ERROR_NAME
    this.provider = provider
    this.status = status
    this.body = body
  }
}

/** True for a {@link SignInServerError}, also one built by another copy of this package. */
export function isSignInServerError(error: unknown): error is SignInServerError {
  const e = error as { provider?: unknown; status?: unknown; body?: unknown }
  return (
    error instanceof Error &&
    error.name === SIGN_IN_SERVER_ERROR_NAME &&
    typeof e.provider === 'string' &&
    typeof e.status === 'number' &&
    typeof e.body === 'string'
  )
}
