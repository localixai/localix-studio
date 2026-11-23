import { describe, expect, test } from 'bun:test'

import { attachProviderResponse } from '../utils/provider-http-error'
import { classifyAgentError } from './error-classification'
import { presentError } from './error-presentation'
import { SignInExpiredError } from './errors'

/** A provider's HTTP refusal as the model adapter hands it over (`describeFailure`). */
const refusal = (status: number, body: string) =>
  attachProviderResponse(
    Object.assign(new Error(`openai ${status}: ${body}`), { name: 'FetchError' }),
    { status, headers: {} },
  )

/** A fetch failure as Bun raises it: a TypeError with a code. */
const fetchFailure = (code: string, message: string) =>
  Object.assign(new TypeError(message), { code })

describe('a sign-in the provider no longer renews', () => {
  test('says the sign-in expired and offers to sign in to that connection', () => {
    const error = new SignInExpiredError(
      'OpenAI',
      'OpenAI token refresh failed (400): { "error": "invalid_grant" }',
    )
    const presented = presentError(error, { connectionId: 'conn-1' })
    expect(presented.reason).toBe(
      'Your sign-in to OpenAI has expired or was revoked. Sign in again.',
    )
    expect(presented.actions).toEqual(['sign-in:conn-1'])
    expect(presented.severity).toBe('error')
    expect(presented.detail).toContain('invalid_grant')
    // The connection is what is broken: every run on it fails until the person signs in again.
    expect(classifyAgentError(error)).toMatchObject({
      authFailed: true,
      signInExpired: true,
      retryable: false,
    })
  })
})

describe('a provider that could not be reached', () => {
  test('an address that does not resolve names the host and the internet connection', () => {
    const presented = presentError(
      fetchFailure('ENOTFOUND', 'getaddrinfo ENOTFOUND api.openai.com'),
    )
    expect(presented.reason).toBe(
      'Could not reach api.openai.com: its address could not be found. Check the internet connection.',
    )
    expect(presented.actions).toEqual(['retry'])
    expect(presented.severity).toBe('warning')
  })

  test('a refused connection names the server the SDK was calling', () => {
    const presented = presentError(
      Object.assign(new Error('Cannot connect to API: ECONNREFUSED: Unable to connect.'), {
        name: 'AI_APICallError',
        url: 'http://127.0.0.1:1234/v1/chat/completions',
        cause: fetchFailure('ECONNREFUSED', 'ECONNREFUSED: Unable to connect.'),
      }),
    )
    expect(presented.reason).toBe(
      'Could not reach 127.0.0.1:1234: the connection was refused. Check that the server is running.',
    )
    expect(presented.actions).toEqual(['retry'])
  })

  test('a connection that timed out is retried', () => {
    const presented = presentError(fetchFailure('ETIMEDOUT', 'connect ETIMEDOUT'))
    expect(presented.reason).toBe('Could not reach the provider: the connection timed out.')
    expect(presented.actions).toEqual(['retry'])
  })

  test('a certificate that is not trusted is not retried, and says what usually causes it', () => {
    const presented = presentError(fetchFailure('CERT_HAS_EXPIRED', 'certificate has expired'))
    expect(presented.reason).toBe(
      'Could not reach the provider securely: certificate has expired. A proxy or security software that inspects HTTPS can cause this.',
    )
    expect(presented.actions).toEqual([])
    expect(presented.severity).toBe('error')
  })

  test('a proxy that refuses the tunnel points at the proxy settings', () => {
    const presented = presentError(
      Object.assign(
        new Error('Proxy refused to open a tunnel: 407 Proxy Authentication Required'),
        {
          code: 'ERR_PROXY_TUNNEL',
        },
      ),
    )
    expect(presented.reason).toBe(
      'Could not reach the provider through the proxy: Proxy refused to open a tunnel: 407 Proxy Authentication Required. Check the proxy settings.',
    )
    expect(presented.actions).toEqual([])
  })
})

describe('a provider status with no sentence of its own', () => {
  test('a region the provider does not serve says so', () => {
    const presented = presentError(
      refusal(
        400,
        'Country, region, or territory not supported: {"error":{"code":"unsupported_country_region_territory","message":"Country, region, or territory not supported"}}',
      ),
    )
    expect(presented.reason).toBe('The provider does not serve your country or region.')
    expect(presented.actions).toEqual([])
  })

  test('any other refusal says the status and the provider’s own words, not its raw body', () => {
    const presented = presentError(
      refusal(422, '{"error":{"message":"Invalid schema for function \'read\'","type":"invalid"}}'),
    )
    expect(presented.reason).toBe(
      "The provider refused the request (422): Invalid schema for function 'read'.",
    )
    expect(presented.detail).toContain('"type":"invalid"')
    expect(presented.actions).toEqual([])
    for (const status of [400, 405, 409]) {
      expect(presentError(refusal(status, 'Method not allowed')).reason).toBe(
        `The provider refused the request (${status}): Method not allowed.`,
      )
    }
  })

  test('a gateway timeout and an overload are temporary and offer Retry', () => {
    expect(presentError(refusal(504, 'upstream request timeout'))).toMatchObject({
      reason: 'Provider timed out (504). Try again in a moment.',
      actions: ['retry'],
    })
    expect(presentError(refusal(529, '{"type":"overloaded_error"}'))).toMatchObject({
      reason: 'Provider overloaded (529). Try again in a moment.',
      actions: ['retry'],
    })
    expect(presentError(refusal(520, 'Web server returned an unknown error'))).toMatchObject({
      reason: 'The provider had a temporary error (520): Web server returned an unknown error.',
      actions: ['retry'],
    })
  })
})

describe('a response that ended without finishing', () => {
  test('each ending says what happened in its own words', () => {
    const ending = (name: string, message: string) =>
      presentError(Object.assign(new Error(message), { name }))
    expect(
      ending(
        'ProviderPrematureCloseError',
        'The provider ended the response without finishing it.',
      ),
    ).toMatchObject({
      reason: 'The provider ended the response without finishing it.',
      actions: ['retry'],
    })
    expect(
      ending('ContentFilterError', 'The provider filtered the response under its content policy.'),
    ).toMatchObject({
      reason: 'The provider filtered the response under its content policy.',
      actions: [],
    })
    expect(
      ending('ProviderFinishError', 'The provider ended the response with an error (error).'),
    ).toMatchObject({
      reason: 'The provider ended the response with an error (error).',
      actions: ['retry'],
    })
    expect(
      ending(
        'ProviderMalformedResponseError',
        'The provider sent a response that could not be read.',
      ),
    ).toMatchObject({
      reason: 'The provider sent a response that could not be read.',
      actions: ['retry'],
    })
  })
})

describe('an error nothing above recognises', () => {
  test('says its own words; the generic sentence is only for an error with none', () => {
    expect(presentError(new Error('Cannot read properties of undefined')).reason).toBe(
      'The run stopped on an unexpected error: Cannot read properties of undefined.',
    )
    expect(presentError(new Error('')).reason).toBe('The run stopped on an unexpected error.')
  })
})

describe('what of a provider’s answer may be quoted', () => {
  test('an HTML error page is never quoted', () => {
    const page =
      '<!DOCTYPE html><html><head><title>api.example.com | 520: Web server is returning an unknown error</title></head><body>…</body></html>'
    expect(presentError(refusal(520, page)).reason).toBe(
      'The provider had a temporary error (520).',
    )
    expect(presentError(new Error(page)).reason).toBe('The run stopped on an unexpected error.')
  })

  test('JSON that does not parse is never quoted, only the words before it', () => {
    // Cut by the adapter's body limit, or followed by text of its own.
    const cut = 'Bad Request: {"error":{"message":"Invalid value for messages[3].content: \'my pri'
    expect(presentError(refusal(400, cut)).reason).toBe(
      'The provider refused the request (400): Bad Request.',
    )
    const trailed = '{"error":{"message":"Invalid tool name"}} request-id: abc'
    expect(presentError(refusal(400, trailed)).reason).toBe(
      'The provider refused the request (400).',
    )
  })

  test('the reason shown outside the app carries none of the provider’s words', () => {
    const presented = presentError(
      refusal(422, '{"error":{"message":"Invalid value: the text you sent"}}'),
    )
    expect(presented.reason).toBe(
      'The provider refused the request (422): Invalid value: the text you sent.',
    )
    expect(presented.plainReason).toBe('The provider refused the request (422).')
    expect(presentError(new Error('boom')).plainReason).toBe(
      'The run stopped on an unexpected error.',
    )
  })
})

describe('a local server that refused the connection', () => {
  test('is named from the path Bun records, and the detail is the cause that was matched', () => {
    const refused = Object.assign(
      new TypeError('ECONNREFUSED: Unable to connect. Is the computer able to access the url?'),
      { code: 'ECONNREFUSED', path: 'http://127.0.0.1:11434/api/chat' },
    )
    const presented = presentError(new TypeError('fetch failed', { cause: refused }))
    expect(presented.reason).toBe(
      'Could not reach 127.0.0.1:11434: the connection was refused. Check that the server is running.',
    )
    expect(presented.detail).toBe(
      'ECONNREFUSED: ECONNREFUSED: Unable to connect. Is the computer able to access the url?',
    )
  })
})
