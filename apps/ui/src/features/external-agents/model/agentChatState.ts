import type { ExternalTranscriptMessage } from './toMessages'

/** A message the person sent that the agent's own history does not show yet. */
export interface PendingMessage {
  id: string
  text: string
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * What a coding agent's chat view shows: its history, plus what the person just sent and the
 * history has not caught up with — so a message appears the moment it is sent — and whether the
 * agent is working: a message still unanswered, or a turn whose last step is a tool rather than
 * its answer in words.
 */
export function agentChatState(
  history: readonly ExternalTranscriptMessage[],
  pending: readonly PendingMessage[],
): { messages: ExternalTranscriptMessage[]; working: boolean; settled: string[] } {
  const said = history
    .filter((message) => message.role === 'user')
    .map((message) => normalize(message.content ?? ''))
  const settled = pending
    .filter((message) => said.includes(normalize(message.text)))
    .map((message) => message.id)
  const waiting = pending.filter((message) => !settled.includes(message.id))
  const messages = [
    ...history,
    ...waiting.map((message) => ({ id: message.id, role: 'user' as const, content: message.text })),
  ]
  const last = messages.at(-1)
  const lastItem = last?.role === 'assistant' ? last.items?.at(-1) : undefined
  const answered = last?.role === 'assistant' && (lastItem as { type?: string })?.type === 'text'
  return { messages, working: messages.length > 0 && !answered, settled }
}
