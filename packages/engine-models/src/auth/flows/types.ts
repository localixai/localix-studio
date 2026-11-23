import { SignInExpiredError, SignInServerError } from '@localixai/agent/agents'
import type { RuntimeAuthInteraction, RuntimeOAuthCredential } from '@localixai/agent/runtime'

import type { ProviderAccess } from '../../providers/connect'

interface FlowContext {
  interaction: RuntimeAuthInteraction
  /** Signal of the whole sign-in; never undefined inside a flow. */
  signal: AbortSignal
  /** How this application names itself to the provider (`Localix`). */
  agentName: string
  /** A stable UUID for this installation, where a provider asks for one. */
  getDeviceId?: () => string | undefined
}

/** One provider's sign-in: get a credential, keep it fresh, and turn it into request access. */
export interface OAuthFlow {
  login(context: FlowContext): Promise<RuntimeOAuthCredential>
  /** A fresh credential from a stale one. Keeps every provider field the next refresh needs. */
  refresh(credential: RuntimeOAuthCredential, signal: AbortSignal): Promise<RuntimeOAuthCredential>
  /** How a request reaches the provider with this credential. */
  access(credential: RuntimeOAuthCredential, request: { sessionId?: string }): ProviderAccess
}

/** Whether a token endpoint's refusal is of the grant itself, so only signing in again helps. */
export type GrantRefused = (status: number, oauthError: string | undefined) => boolean

/** The OAuth errors (RFC 6749 §5.2) that refuse the grant or the client, not the request. */
const REFUSED_GRANT_CODES = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client'])

/**
 * An OAuth server refuses the grant with 400 (401 for client authentication) and one of the codes
 * above. Any other 400 (`invalid_request`, `invalid_scope`) is a request it would not serve, which
 * a new sign-in does not change.
 */
export const oauthGrantRefused: GrantRefused = (status, code) =>
  (status === 400 || status === 401) && code !== undefined && REFUSED_GRANT_CODES.has(code)

/** The OAuth `error` code of a token endpoint's body, flat or nested. */
function oauthErrorOf(body: string): string | undefined {
  try {
    const error = (JSON.parse(body) as { error?: unknown }).error
    if (typeof error === 'string') return error
    const code = (error as { code?: unknown } | undefined)?.code
    return typeof code === 'string' ? code : undefined
  } catch {
    return undefined
  }
}

/**
 * A token endpoint's failed answer as an error. A renewal whose grant was refused is a
 * `SignInExpiredError`, which a run's failure turns into "sign in again". Anything else is a
 * `SignInServerError`: the sign-in server's fault or its own refusal, said as such, and never a
 * model provider's status (a 429 here must not cool a model route down).
 */
export async function tokenEndpointError(
  response: Response,
  provider: string,
  operation: 'refresh' | 'exchange',
  refused: GrantRefused = oauthGrantRefused,
): Promise<Error> {
  const body = await response.text().catch(() => '')
  const said = body || response.statusText
  const message = `${provider} token ${operation} failed (${response.status}): ${said}`
  if (operation === 'refresh' && refused(response.status, oauthErrorOf(body)))
    return new SignInExpiredError(provider, message)
  return new SignInServerError(provider, response.status, message, said)
}

/** A token endpoint's JSON, or its error as a sentence that names the provider. */
export async function tokenJson(
  response: Response,
  provider: string,
  operation: 'refresh' | 'exchange',
): Promise<Record<string, unknown>> {
  if (!response.ok) throw await tokenEndpointError(response, provider, operation)
  const json: unknown = await response.json()
  if (!json || typeof json !== 'object' || Array.isArray(json))
    throw new Error(`${provider} token ${operation} returned no object`)
  return json as Record<string, unknown>
}

/**
 * Turn a person's cancel during sign-in into the sentence they expect. A deadline is not a cancel:
 * a renewal runs on its own timeout (`oauth-access.ts`), and its expiry stays the `TimeoutError` it
 * is, so a slow sign-in server is not reported as a login someone cancelled.
 */
export async function signInFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (!init.signal?.aborted) throw error
    const reason: unknown = init.signal.reason
    if ((reason as { name?: unknown } | undefined)?.name === 'TimeoutError') throw reason
    throw new Error('Login cancelled')
  }
}
