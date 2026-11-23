/**
 * The question a coding agent's terminal is waiting on, read off its rendered screen.
 *
 * A chat that types into the agent's terminal cannot see these, and they block it: Claude Code's
 * folder trust question highlights "No, exit", so a message followed by Enter quit the agent. The
 * shapes are those Claude Code draws (captured from 2.1.330 in the tests):
 *
 *   ❯ No, exit                      a menu: the highlighted answer after `❯`, indented, and its
 *     Yes, I trust this folder      siblings two columns further in; a wrapped answer continues
 *                                   further in still
 *   Enter to confirm · Esc to cancel  its footer, unless the answers are numbered
 *
 * The question is what the agent drew between the last full-width rule above the answers and the
 * answers. The message box (`❯` in column 0) and slash command completions (`❯ /login …`, neither
 * numbered nor followed by a footer) are not questions.
 */
import type { AgentPrompt, AgentPromptOption } from '../../shared/agent-prompt'

/** A section boundary. The dashed `╌` rules inside a permission frame the command, and stay. */
const RULE = /^\s*[─▔]{20,}\s*$/
const SELECTED = /^( +)❯ (\S.*)$/
const FOOTER = /enter to (?:confirm|select)|esc to (?:cancel|exit|go back)/i
const NUMBERED = /^\d+\.\s/
const CODE_REQUEST = /paste code here/i
const URL_START = /https?:\/\/\S+/
/** How far above its answers a question is read when no rule bounds it. */
const QUESTION_LINES = 14

export function screenPrompt(text: string, cols: number): AgentPrompt | null {
  const lines = text.split('\n').map((line) => line.trimEnd())
  return choicePrompt(lines) ?? textPrompt(lines, cols)
}

function choicePrompt(lines: string[]): AgentPrompt | null {
  for (let at = lines.length - 1; at >= 0; at--) {
    const selected = SELECTED.exec(lines[at] ?? '')
    if (!selected) continue
    const indent = selected[1]?.length ?? 1
    const sibling = new RegExp(`^ {${indent + 2}}(\\S.*)$`)
    const continued = new RegExp(`^ {${indent + 3},}\\S`)
    const belongs = (line: string | undefined) =>
      line !== undefined && (sibling.test(line) || continued.test(line))
    let start = at
    while (start > 0 && belongs(lines[start - 1])) start--
    // A continuation line cannot open the list: it belongs to the question above.
    while (start < at && !sibling.test(lines[start] ?? '')) start++
    let end = at
    while (end + 1 < lines.length && belongs(lines[end + 1])) end++
    const options: AgentPromptOption[] = []
    for (let row = start; row <= end; row++) {
      const line = lines[row] ?? ''
      const label = row === at ? (selected[2] ?? '') : (sibling.exec(line)?.[1] ?? '')
      if (row === at || sibling.test(line)) options.push({ label, selected: row === at })
      else if (options.length) options[options.length - 1]!.label += ` ${line.trim()}`
    }
    const footer = lines
      .slice(end + 1)
      .filter((line) => line.trim())
      .slice(0, 2)
      .some((line) => FOOTER.test(line))
    const numbered = options.every((option) => NUMBERED.test(option.label))
    if (options.length < 2 || !(footer || numbered)) return null
    return { kind: 'choice', question: questionAbove(lines, start), options }
  }
  return null
}

function textPrompt(lines: string[], cols: number): AgentPrompt | null {
  const at = lines.findLastIndex((line) => CODE_REQUEST.test(line))
  if (at < 0) return null
  const question = questionAbove(lines, at + 1)
  const url = wrappedUrl(question, cols)
  return { kind: 'text', question, options: [], ...(url ? { url } : {}) }
}

/** The lines from the last rule above `end` to it, without the margin the agent drew. */
function questionAbove(lines: string[], end: number): string[] {
  let start = end
  while (start > 0 && end - start < QUESTION_LINES && !RULE.test(lines[start - 1] ?? '')) start--
  const block = lines.slice(start, end)
  while (block.length && !block[0]?.trim()) block.shift()
  while (block.length && !block.at(-1)?.trim()) block.pop()
  return block.map((line) => line.trim()).filter((line, index, all) => line || all[index - 1])
}

/** A link longer than the terminal is wide fills every row it wraps onto. */
function wrappedUrl(lines: string[], cols: number): string | undefined {
  const at = lines.findIndex((line) => URL_START.test(line))
  if (at < 0) return undefined
  let url = URL_START.exec(lines[at] ?? '')?.[0] ?? ''
  let row = at
  while ((lines[row]?.length ?? 0) >= cols - 1 && /^\S+$/.test(lines[row + 1] ?? '')) {
    row++
    url += lines[row]
  }
  return url
}
