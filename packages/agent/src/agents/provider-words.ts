/**
 * WHAT A PROVIDER SAID, as words a person can read.
 *
 * An error the classifier has no sentence for still has text: a provider's refusal
 * (`openai 422: {"error":{"message":"Invalid schema…"}}`), an exception's own message. Showing
 * the raw body is no explanation, and hiding it behind "an unexpected error" hid the one thing
 * that said what went wrong. So the text is reduced to its human part: the status label and
 * `Error:` prefix dropped, the `message` (or `error_description`, `detail`, a string `error`) of a
 * JSON body taken over the JSON itself, whitespace folded, and the length bounded.
 *
 * What is NOT quoted: markup (a gateway's HTML error page) and JSON that does not parse (cut by an
 * adapter's body limit, or followed by text of its own). Of those only the words before the brace
 * are kept, never the tail, which is where a provider echoes the request it refused.
 */

const MAX_WORDS = 160

// An HTML or XML document, or a fragment of one: a proxy's or a CDN's error page.
const MARKUP = /<\s*(!doctype|html|head|body|title|div|p|h1|center|script|\?xml)\b/i

// The `"<label> <status>: "` prefix `providerHttpErrorMessage` writes, or a bare `"<status>: "`.
const STATUS_LABEL = /^[^\n]*?(?:^|\s)[1-5]\d{2}:\s*/

/** The most human field of a parsed error body. */
function messageIn(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const o = body as Record<string, unknown>
  for (const key of ['message', 'error_description', 'detail'] as const) {
    if (typeof o[key] === 'string' && o[key]) return o[key]
  }
  if (typeof o.error === 'string' && o.error) return o.error
  return messageIn(o.error)
}

/** The text before the first `{`, and the JSON from there when all of it parses. */
function jsonIn(text: string): { before: string; body?: unknown } | undefined {
  const start = text.indexOf('{')
  if (start < 0) return undefined
  const before = text.slice(0, start)
  try {
    return { before, body: JSON.parse(text.slice(start)) }
  } catch {
    return { before }
  }
}

/** The readable part of an error's text, or undefined when nothing readable is left. */
export function providerWords(raw: string): string | undefined {
  if (MARKUP.test(raw)) return undefined
  let text = raw.replace(/^Error:\s*/u, '').replace(STATUS_LABEL, '')
  const json = jsonIn(text)
  if (json) {
    const said = messageIn(json.body)
    text = said ?? json.before.replace(/[:\s]+$/u, '')
  }
  const folded = text
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.:;,\s]+$/u, '')
  if (!folded) return undefined
  return folded.length > MAX_WORDS ? `${folded.slice(0, MAX_WORDS - 1)}…` : folded
}
