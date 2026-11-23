import { classifyAgentError, type AgentErrorInfo } from '@localixai/agent/agents'
import { DomainError } from '../../../../lib/domain-errors'
import { RequiredMcpServersError } from '../../../mcp/client-manager'
import { LocalContextBudgetExceededError } from '../context-budget'

/**
 * The host itself refused, in its own words (a chat whose project folder is gone, a record that
 * does not exist, a request it will not serve). Not a provider's answer, so it never goes through
 * the provider's status table, which has no sentence for a 404 or 409 and called it "an unexpected
 * error". A host fault that may clear (`unavailable`, `internal`) still does, so it is retried.
 */
const isHostRefusal = (error: unknown): error is DomainError =>
  error instanceof DomainError && error.kind !== 'unavailable' && error.kind !== 'internal'

/** An MCP server's own error text, bounded: a crashed process can leave a page of stderr. */
const MCP_ERROR_MAX = 200

/**
 * A server the agent marks `required` did not start, so the run did not either. It read as "an
 * unexpected error" (or, when its text said "timed out", as a provider's temporary fault); it is
 * the server's to fix, on its Store page.
 */
function requiredMcpServerInfo(error: RequiredMcpServersError): AgentErrorInfo {
  const [first] = error.failures
  const names = error.failures.map(({ server }) => `“${server}”`).join(', ')
  const said =
    error.failures.length === 1
      ? first!.error
      : error.failures.map((f) => `${f.server}: ${f.error}`).join('; ')
  const words = said
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.\s]+$/u, '')
  const bounded = words.length > MCP_ERROR_MAX ? `${words.slice(0, MCP_ERROR_MAX - 1)}…` : words
  const subject =
    error.failures.length === 1 ? `The MCP server ${names}` : `The MCP servers ${names}`
  return {
    kind: 'fatal',
    userMessage: `${subject} this agent requires did not start: ${bounded}.`,
    retryable: false,
    detail: error.message,
    // Its Store page when it has one; otherwise the MCP shelf, where every server is listed.
    recovery: [first?.storeId ? `open-store:mcp-server/${first.storeId}` : 'open-store:mcp-server'],
  }
}

/**
 * `classifyAgentError`, plus vault-value redaction of the fields that leave the process.
 *
 * `info.userMessage` may quote a provider's answer and `info.detail` holds all of it, and a
 * provider that rejects a request may echo the credential it rejected. Both reach sinks that do
 * not redact vault values:
 *
 *   - the run's system notice, persisted in the transcript the user scrolls (reason and detail);
 *   - the `run.failed` frame, on every connected client, and the Event Center row;
 *   - the API log: the failed run's line (`failure-log.ts`) and the transient retry's line.
 *
 * So the redaction belongs at the classification, not at each sink. Both places that let a
 * classified message REACH a sink use this: the run-failure finalizer and the transient retry's log
 * line. Any bare `classifyAgentError` call left elsewhere must read `kind`/`retryable` only; once
 * one reads the message, it moves here.
 *
 * The audit that found this also found the reason it went unnoticed: the shield's `redactText` had no
 * caller anywhere outside its own module, and `providerHttpErrorMessage` — the function the previous
 * fix's rationale named as the leak path — has no call sites at all. The leak was real; the named
 * path was not.
 */
export function classifyRunError(
  deps: { sanitizeText?: (userId: string, text: string) => string },
  userId: string,
  error: unknown,
): AgentErrorInfo {
  const info: AgentErrorInfo = isHostRefusal(error)
    ? { kind: 'fatal', userMessage: error.message, retryable: false }
    : error instanceof LocalContextBudgetExceededError
      ? error.reason === 'estimated_context_too_large'
        ? {
            kind: 'context_overflow',
            userMessage: error.message,
            retryable: false,
            shouldCompress: true,
          }
        : {
            kind: 'fatal',
            userMessage: error.message,
            retryable: false,
          }
      : error instanceof RequiredMcpServersError
        ? requiredMcpServerInfo(error)
        : classifyAgentError(error)
  if (!deps.sanitizeText) return info
  const safe = deps.sanitizeText(userId, info.userMessage)
  // `detail` is the provider's whole answer: the likeliest of all to echo a credential.
  const detail = info.detail === undefined ? undefined : deps.sanitizeText(userId, info.detail)
  // Same object when nothing matched, so a caller comparing identity (or a test asserting the
  // classifier's own result) sees no difference on the overwhelmingly common path.
  return safe === info.userMessage && detail === info.detail
    ? info
    : { ...info, userMessage: safe, ...(detail === undefined ? {} : { detail }) }
}
