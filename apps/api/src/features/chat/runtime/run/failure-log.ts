/**
 * A FAILED RUN, AS ONE LINE OF THE API LOG.
 *
 * The finalizer used to `console.error` the Error object. That never reached `api.log` (the pino
 * file under `~/.localix/logs/`): it went to the API child's stdout, which the desktop shell copies
 * into `desktop.log`, and Bun prints an Error object with the source lines around its throw site,
 * which in the shipped app is a screen of minified `server.js`. A person asked for "the log" sent
 * the one file that did not have the failure.
 *
 * So each failure is one structured record through the API's logger: what a person was told
 * (`kind`, `reason`) and what happened (`error`: name, code, status, message, stack, and the causes
 * under it), every text through the vault redaction first. Only named fields: an SDK error also
 * carries the request it made (the whole conversation) and the response body, which pino's error
 * serializer would copy into the file wholesale.
 */
import { extractProviderStatus, type AgentErrorInfo } from '@localixai/agent/agents'

/** The logger the run path has: pino in the API, anything with these methods in a test. */
export interface RunFailureLogger {
  error?: (record: Record<string, unknown>) => void
  info?: (record: Record<string, unknown>) => void
}

export interface RunFailure {
  userId: string
  sessionId: string
  runId: string
  info: AgentErrorInfo
  error: unknown
  /** The person stopped the run; the line is kept, as information, not as an error. */
  stopped: boolean
  /** Whether the run had written its reply row; undefined when that could not be read. */
  output?: boolean
}

/** Stack frames kept: enough to find the throw site, not a page of framework frames. */
const STACK_LINES = 12
/** Longest stack line kept: a minified bundle's frame can be one very long line. */
const STACK_LINE_MAX = 300
/** Links of the cause chain recorded below the error itself. */
const CAUSE_DEPTH = 4
/** Longest message kept for the error itself, and for each cause under it. */
const MESSAGE_MAX = 500
const CAUSE_MESSAGE_MAX = 200

/**
 * Errors whose message quotes what they could not read: a streamed chunk of the model's reply or
 * a tool call's arguments (the AI SDK's `Text: …`, `Value: …`). Recorded by name and length only.
 */
const QUOTES_THE_STREAM = new Set([
  'AI_JSONParseError',
  'AI_TypeValidationError',
  'JSONParseError',
  'TypeValidationError',
])

type Redact = (text: string) => string

const bounded = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

/** How much the reader was given, for an error whose content is not recorded. */
function quotedLength(error: Error): number | undefined {
  const { text, value } = error as { text?: unknown; value?: unknown }
  if (typeof text === 'string') return text.length
  if (value === undefined) return undefined
  try {
    return JSON.stringify(value)?.length
  } catch {
    return undefined
  }
}

function errorFields(error: unknown, redact: Redact, max: number) {
  if (!(error instanceof Error)) return { message: bounded(redact(String(error)), max) }
  const code = (error as { code?: unknown }).code
  const status = extractProviderStatus(error)
  const fields = {
    name: error.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    ...(status ? { status } : {}),
  }
  if (!QUOTES_THE_STREAM.has(error.name))
    return { ...fields, message: bounded(redact(error.message), max) }
  const length = quotedLength(error)
  return { ...fields, ...(length === undefined ? {} : { length }) }
}

function causesOf(error: unknown, redact: Redact) {
  const causes: ReturnType<typeof errorFields>[] = []
  let link = error instanceof Error ? error.cause : undefined
  for (let depth = 0; link !== undefined && link !== null && depth < CAUSE_DEPTH; depth++) {
    causes.push(errorFields(link, redact, CAUSE_MESSAGE_MAX))
    link = link instanceof Error ? link.cause : undefined
  }
  return causes
}

/** The stack's frames: its first line repeats the message, which is recorded (or withheld) above. */
function framesOf(error: unknown, redact: Redact): string | undefined {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return undefined
  const frames = error.stack
    .split('\n')
    .filter((line) => /^\s+at\s/u.test(line))
    .slice(0, STACK_LINES)
    .map((line) => bounded(line, STACK_LINE_MAX))
  return frames.length ? redact(frames.join('\n')) : undefined
}

/**
 * Whether the person ended the run: they stopped it, cancelled it, or dismissed what it asked.
 * Kept as information. A timeout, theirs to answer or the provider's, is a failure.
 */
const endedByThePerson = (failure: RunFailure) =>
  failure.stopped || failure.info.kind === 'abort' || failure.info.kind === 'dismissed'

/** The record for one failed run; exported for the run's other ends that log the same way. */
export function runFailureRecord(failure: RunFailure, redact: Redact): Record<string, unknown> {
  const { info, error } = failure
  const stack = framesOf(error, redact)
  const causes = causesOf(error, redact)
  return {
    event: endedByThePerson(failure) ? 'run.stopped' : 'run.failed',
    sessionId: failure.sessionId,
    runId: failure.runId,
    kind: info.kind,
    retryable: info.retryable,
    ...(info.authFailed ? { authFailed: true } : {}),
    ...(info.signInExpired ? { signInExpired: true } : {}),
    ...(info.rateLimited ? { rateLimited: true } : {}),
    ...(failure.output === undefined ? {} : { output: failure.output }),
    reason: info.userMessage,
    error: {
      ...errorFields(error, redact, MESSAGE_MAX),
      ...(stack ? { stack } : {}),
      ...(causes.length ? { causes } : {}),
    },
  }
}

/**
 * Write the failure to the API log. Without a structured logger (a host that wired none) the
 * record still goes out, as one string, so nothing prints an Error object to the console.
 */
export function logRunFailure(
  deps: {
    logger?: RunFailureLogger
    sanitizeText?: (userId: string, text: string) => string
  },
  failure: RunFailure,
): void {
  const redact: Redact = (text) => deps.sanitizeText?.(failure.userId, text) ?? text
  const record = runFailureRecord(failure, redact)
  // Called as methods: pino's read their logger off `this`.
  const logger = deps.logger
  const quiet = endedByThePerson(failure)
  if (quiet && logger?.info) logger.info(record)
  else if (!quiet && logger?.error) logger.error(record)
  else console.error(`[agent-runner] ${JSON.stringify(record)}`)
}

/**
 * A warning on the run's failure path (a retry, a recovery that could not be prepared), as one
 * line of the API log. Text only: an Error object handed to the console is printed by Bun with
 * the source lines around its throw site.
 */
export function warnOnRunPath(
  deps: { logger?: { warn: (message: string) => void } } | undefined,
  text: string,
): void {
  // A warning never throws: it runs inside catch blocks, where a missing logger would replace the
  // failure being reported with a TypeError of its own.
  if (deps?.logger) deps.logger.warn(text)
  else console.warn(text)
}
