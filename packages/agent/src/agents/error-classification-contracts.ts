import type { ModelUnavailableReason } from './errors'
import type { Recovery } from './error-presentation'

export interface AgentErrorInfo {
  kind: 'abort' | 'dismissed' | 'timeout' | 'fatal' | 'context_overflow'
  userMessage: string
  retryable: boolean
  /**
   * The request exceeded the model's context window. The recovery is to send less history
   * and retry — not a plain retry (which would fail identically). A host that can shrink its
   * view acts on this; a plain retry loop must NOT treat it as retryable.
   */
  shouldCompress?: boolean
  /**
   * Provider-stated `Retry-After` (ms) parsed from a 429/5xx response header, when
   * present. The retry backoff honors it as a floor (clamped) so we don't re-fire
   * before the server's stated window and re-trigger the rate limit.
   */
  retryAfterMs?: number
  /**
   * The failure is a RATE LIMIT or a quota/billing/plan cap — the request was refused
   * because the account has spent its allowance, not because of a bug. Additive to
   * `kind` (which stays 'fatal') so no `kind` consumer changes; consumers that care
   * (failure telemetry, a loop that should stop firing into an exhausted quota) key on
   * this instead. A transient 429 also carries `retryable`/`retryAfterMs`; a terminal
   * quota cap does not.
   */
  rateLimited?: boolean
  /**
   * The provider refused the CREDENTIAL (a 401, or the runtime's `PROVIDER_AUTH_FAILED`): every
   * request on this connection fails the same way until the key or sign-in is fixed. Additive like
   * `rateLimited`, so it is what a consumer keys a standing "this connection cannot sign in"
   * condition on — never the wording of `userMessage`.
   */
  authFailed?: boolean
  /**
   * The refused credential is a SIGN-IN that could not be renewed (the token endpoint refused the
   * refresh grant): the fix is to sign in again, not to check a key. Set with `authFailed`.
   */
  signInExpired?: true
  /**
   * The chosen model could not be bound to a provider, and why (`NO_PROVIDER_CONNECTION` with a
   * host-supplied reason). Additive like `authFailed`: a consumer keys on this, not on the text.
   */
  modelUnavailable?: ModelUnavailableReason
  /**
   * `userMessage` is the error's OWN text — a provider's response body, a proxy's page, an
   * unrecognised exception — not a sentence this classifier wrote. Such text rendered in the
   * transcript as `403: {"message":"Key limit exceeded…"}`; a presenter (`presentError`) keeps
   * the raw text out of the headline, says only its readable words after a lead of its own, and
   * offers the whole text as detail.
   */
  verbatim?: true
  /**
   * The error's own text, kept beside a `userMessage` this classifier wrote: a provider's whole
   * answer, the code-bearing message of a network failure. For a tooltip and the log, never the
   * reason; it may hold anything the provider echoed, so a host redacts it like `userMessage`.
   */
  detail?: string
  /**
   * `userMessage` without the provider's words it quotes ("The provider refused the request
   * (422)."), for a surface outside the app, such as a system notification, where a provider's
   * echo of the request must not appear. Absent when `userMessage` quotes nothing.
   */
  plain?: string
  /**
   * The recovery a HOST names for a failure it classified itself (a required MCP server that did
   * not start opens that server's page). This classifier never sets it: it knows no host's pages.
   * A presenter offers it in place of the actions it would derive.
   */
  recovery?: readonly Recovery[]
}
