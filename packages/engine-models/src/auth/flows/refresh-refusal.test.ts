import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import { classifyAgentError, presentError } from '@localixai/agent/agents'
import type { RuntimeOAuthCredential } from '@localixai/agent/runtime'

import type { CatalogEntry } from '../../catalog/catalog'
import { accessFor } from '../auth'
import { gitHubCopilotFlow } from './github-copilot'
import { openAIChatGPTFlow } from './openai-chatgpt'

/**
 * A sign-in whose renewal the provider refuses is what a person meets as a failed run. It used
 * to read "The run stopped on an unexpected error." with no action, while the fix was one click:
 * sign in again. These pin what the run's failure says for each flow that refreshes.
 */

const stale = (extra: Record<string, unknown> = {}): RuntimeOAuthCredential => ({
  type: 'oauth',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresAt: 0,
  extra,
})

/** Every request answers with `status` and `body`, as the provider's token endpoint would. */
function tokenEndpoint(status: number, body: string) {
  return spyOn(globalThis, 'fetch').mockImplementation(
    (async () => new Response(body, { status })) as unknown as typeof fetch,
  )
}

afterEach(() => {
  ;(globalThis.fetch as unknown as { mockRestore?: () => void }).mockRestore?.()
})

const failureOf = async (refresh: Promise<unknown>) =>
  presentError(await refresh.then(() => undefined).catch((error: unknown) => error), {
    connectionId: 'conn-1',
  })

describe('a refused refresh asks the person to sign in again', () => {
  test('Sign in with ChatGPT: invalid_grant and invalid_client', async () => {
    for (const [status, body] of [
      [400, '{ "error": "invalid_grant" }'],
      [401, '{ "error": "invalid_client" }'],
    ] as const) {
      tokenEndpoint(status, body)
      const presented = await failureOf(
        openAIChatGPTFlow.refresh(stale({ clientId: 'app_x' }), AbortSignal.timeout(5_000)),
      )
      expect(presented.reason).toBe(
        'Your sign-in to OpenAI has expired or was revoked. Sign in again.',
      )
      expect(presented.actions).toEqual(['sign-in:conn-1'])
      expect(presented.detail).toContain(
        body.includes('grant') ? 'invalid_grant' : 'invalid_client',
      )
      ;(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore()
    }
  })

  test('a ChatGPT sign-in stored without its client id', async () => {
    const presented = await failureOf(
      openAIChatGPTFlow.refresh(stale(), AbortSignal.timeout(5_000)),
    )
    expect(presented.reason).toBe(
      'Your sign-in to OpenAI has expired or was revoked. Sign in again.',
    )
    expect(presented.actions).toEqual(['sign-in:conn-1'])
  })

  test('GitHub Copilot: a GitHub token that was revoked', async () => {
    tokenEndpoint(401, '{"message":"Bad credentials"}')
    const presented = await failureOf(
      gitHubCopilotFlow.refresh(stale(), AbortSignal.timeout(5_000)),
    )
    expect(presented.reason).toBe(
      'Your sign-in to GitHub has expired or was revoked. Sign in again.',
    )
    expect(presented.actions).toEqual(['sign-in:conn-1'])
  })
})

describe('a token endpoint that is down is not a sign-in to redo', () => {
  const renewChatGPT = (signal: AbortSignal = AbortSignal.timeout(5_000)) =>
    openAIChatGPTFlow.refresh(stale({ clientId: 'app_x' }), signal)

  test('a 5xx or a 429 is the sign-in server’s, temporary, and holds no model route', async () => {
    tokenEndpoint(503, 'Service Unavailable')
    let failure = await renewChatGPT().catch((error: unknown) => error)
    expect(presentError(failure)).toMatchObject({
      reason: 'The sign-in server of OpenAI had a temporary error (503). Try again in a moment.',
      actions: ['retry'],
    })
    ;(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore()
    tokenEndpoint(429, 'Too Many Requests')
    failure = await renewChatGPT().catch((error: unknown) => error)
    // A rate limit of the sign-in server is not the model's: no cooldown on the model route.
    expect(classifyAgentError(failure)).toMatchObject({ retryable: true })
    expect(classifyAgentError(failure).rateLimited).toBeUndefined()
  })

  test('an OAuth refusal that is not of the grant itself keeps its own words', async () => {
    tokenEndpoint(400, '{"error":"invalid_request","error_description":"Missing resource"}')
    const presented = presentError(await renewChatGPT().catch((error: unknown) => error))
    expect(presented.reason).toBe(
      'The sign-in server of OpenAI refused to renew the sign-in (400): Missing resource.',
    )
    expect(presented.actions).toEqual([])
  })

  test('GitHub refusing the Copilot token with 403 is not an expired sign-in', async () => {
    // A seat removed, an organization policy or SAML: signing in again does not change it.
    tokenEndpoint(403, '{"message":"Resource not accessible by integration"}')
    const failure = await gitHubCopilotFlow
      .refresh(stale(), AbortSignal.timeout(5_000))
      .catch((error: unknown) => error)
    expect(presentError(failure).reason).toBe(
      'The sign-in server of GitHub refused to renew the sign-in (403): Resource not accessible by integration.',
    )
    expect(classifyAgentError(failure).signInExpired).toBeUndefined()
  })

  test('a renewal that runs out of time is a timeout, not a cancelled login', async () => {
    spyOn(globalThis, 'fetch').mockImplementation((async (_input: unknown, init?: RequestInit) => {
      throw init?.signal?.reason
    }) as unknown as typeof fetch)
    const timedOut = AbortSignal.abort(new DOMException('The operation timed out.', 'TimeoutError'))
    const failure = await renewChatGPT(timedOut).catch((error: unknown) => error)
    expect((failure as Error).name).toBe('TimeoutError')
    expect(presentError(failure).reason).not.toContain('Login cancelled')
  })
})

describe('a connection signed in to a provider Localix no longer signs in to', () => {
  test('says to connect it with an API key, and opens the providers', async () => {
    const entry = { provider: { id: 'anthropic', name: 'Anthropic' } } as unknown as CatalogEntry
    const failure = await accessFor(entry, stale(), { signal: AbortSignal.timeout(5_000) }).catch(
      (error: unknown) => error,
    )
    expect(presentError(failure)).toMatchObject({
      reason:
        'Localix no longer signs in to Anthropic with an account. Connect it again with an API key.',
      actions: ['open-settings:providers'],
    })
  })
})
