/**
 * A REQUEST THAT NEVER GOT AN ANSWER, said by its cause.
 *
 * Fetch failures carry no HTTP status, only a code somewhere along their `cause` chain (Bun's
 * `TypeError` with `ENOTFOUND`, the AI SDK's `Cannot connect to API` wrapping the original, undici's
 * `UND_ERR_*`). They used to share one sentence, "Network connection to the provider dropped.",
 * whether the address did not resolve (offline), a local server was not running, or a proxy refused
 * the tunnel, and a certificate failure fell through to "an unexpected error". Each cause has a
 * different fix, so each gets its own sentence, naming the host when the error carries it.
 *
 * Retryable means the same request may succeed later without the person changing anything: a
 * network that comes back, a server that finishes starting. A certificate or a proxy that refuses
 * does not change on its own.
 */

export interface NetworkFailure {
  userMessage: string
  retryable: boolean
  /** The link that said what happened, as `<code>: <message>`, not the wrapper around it. */
  detail: string
}

type Cause = 'dns' | 'refused' | 'unreachable' | 'timeout' | 'dropped' | 'tls' | 'proxy'

const CODES: Readonly<Record<string, Cause>> = {
  ENOTFOUND: 'dns',
  EAI_AGAIN: 'dns',
  EAI_NONAME: 'dns',
  ECONNREFUSED: 'refused',
  ConnectionRefused: 'refused',
  EHOSTUNREACH: 'unreachable',
  ENETUNREACH: 'unreachable',
  ENETDOWN: 'unreachable',
  FailedToOpenSocket: 'unreachable',
  ETIMEDOUT: 'timeout',
  ESOCKETTIMEDOUT: 'timeout',
  UND_ERR_CONNECT_TIMEOUT: 'timeout',
  UND_ERR_HEADERS_TIMEOUT: 'timeout',
  UND_ERR_BODY_TIMEOUT: 'timeout',
  ECONNRESET: 'dropped',
  ECONNABORTED: 'dropped',
  EPIPE: 'dropped',
  ConnectionClosed: 'dropped',
  UND_ERR_SOCKET: 'dropped',
  ERR_STREAM_PREMATURE_CLOSE: 'dropped',
  ERR_PROXY_TUNNEL: 'proxy',
}

// Node's and Bun's certificate codes (`CERT_HAS_EXPIRED`, `DEPTH_ZERO_SELF_SIGNED_CERT`,
// `ERR_TLS_CERT_ALTNAME_INVALID`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, …).
const TLS_CODE =
  /^(CERT_|ERR_TLS_|ERR_SSL_|UNABLE_TO_(GET|VERIFY)_|DEPTH_ZERO_SELF_SIGNED|SELF_SIGNED_CERT|HOSTNAME_MISMATCH)/

// Phrases that mean a dropped connection when no code survived the wrapping.
const DROPPED_PHRASE =
  /fetch failed|socket hang up|premature close|network connection was lost|connection closed/i

/** Cause-chain objects examined; a chain deeper than this (or a cycle) is not a network failure. */
const MAX_DEPTH = 5

function causeOfCode(code: unknown): Cause | undefined {
  if (typeof code !== 'string') return undefined
  return CODES[code] ?? (TLS_CODE.test(code) ? 'tls' : undefined)
}

const hostOfUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  try {
    return new URL(value).host || undefined
  } catch {
    return undefined
  }
}

/**
 * The host a link of the chain names: its request URL (the AI SDK's `url`, Bun's `path`), or the
 * name a DNS lookup failed on.
 */
function hostOf(link: {
  url?: unknown
  path?: unknown
  hostname?: unknown
  message?: unknown
}): string | undefined {
  if (typeof link.hostname === 'string' && link.hostname) return link.hostname
  const fromUrl = hostOfUrl(link.url) ?? hostOfUrl(link.path)
  if (fromUrl) return fromUrl
  const message = typeof link.message === 'string' ? link.message : ''
  return /\b(?:ENOTFOUND|EAI_AGAIN)\s+([\w.-]+)/.exec(message)?.[1]
}

function sentence(
  cause: Cause,
  host: string | undefined,
  reason: string,
): Omit<NetworkFailure, 'detail'> {
  const target = host ?? 'the provider'
  switch (cause) {
    case 'dns':
      return {
        userMessage: `Could not reach ${target}: its address could not be found. Check the internet connection.`,
        retryable: true,
      }
    case 'refused':
      return {
        userMessage: `Could not reach ${target}: the connection was refused. Check that the server is running.`,
        retryable: true,
      }
    case 'unreachable':
      return {
        userMessage: `Could not reach ${target}: the network is unreachable. Check the internet connection.`,
        retryable: true,
      }
    case 'timeout':
      return {
        userMessage: `Could not reach ${target}: the connection timed out.`,
        retryable: true,
      }
    case 'dropped':
      // No "Retrying…": this is also the TERMINAL reason once every retry is spent.
      return {
        userMessage: host
          ? `The connection to ${host} dropped.`
          : 'Network connection to the provider dropped.',
        retryable: true,
      }
    case 'tls':
      return {
        userMessage: `Could not reach ${target} securely: ${reason}. A proxy or security software that inspects HTTPS can cause this.`,
        retryable: false,
      }
    case 'proxy':
      return {
        userMessage: `Could not reach ${target} through the proxy: ${reason}. Check the proxy settings.`,
        retryable: false,
      }
  }
}

/**
 * The network cause of `error`, read along its `cause` chain, or undefined when it is not a
 * failure to reach the server. A code anywhere in the chain wins over a phrase.
 */
export function networkFailureOf(error: unknown): NetworkFailure | undefined {
  let cause: Cause | undefined
  let host: string | undefined
  let reason = ''
  let phrased = false
  let detail = ''
  const seen = new Set<unknown>()
  let link: unknown = error
  for (let depth = 0; link && typeof link === 'object' && depth < MAX_DEPTH; depth++) {
    if (seen.has(link)) break
    seen.add(link)
    const o = link as { code?: unknown; message?: unknown; cause?: unknown }
    host ??= hostOf(o as Parameters<typeof hostOf>[0])
    const found = causeOfCode(o.code)
    if (found && !cause) {
      cause = found
      reason = typeof o.message === 'string' ? o.message : ''
      detail = `${String(o.code)}: ${reason}`
    }
    if (typeof o.message === 'string' && DROPPED_PHRASE.test(o.message)) {
      if (!phrased && !detail) detail = o.message
      phrased = true
    }
    link = o.cause
  }
  if (!cause && !phrased) return undefined
  const plain = reason.replace(/\s*For more information, pass `verbose: true`.*$/s, '').trim()
  return {
    ...sentence(cause ?? 'dropped', host, plain.replace(/[.\s]+$/u, '') || 'unknown cause'),
    detail,
  }
}
