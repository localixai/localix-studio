import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { SendHorizontal, Square, SquareTerminal } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Textarea } from '@localixai/kit/textarea'

/**
 * A coding agent (Claude Code, Codex…) as a chat: its turns above, a message box below. What is
 * typed goes to the agent's own terminal, which keeps running behind this view; **Show terminal**
 * opens it when its full screen is wanted.
 */
export function AgentChatPanel(props: {
  providerName: string
  transcript: ReactNode
  onSend: (text: string) => Promise<void>
  onShowTerminal: () => void
  /** Above the transcript: the agent has stopped, and how to start it again. */
  notice?: ReactNode
  /** Above the message box: a question the agent's terminal waits on. */
  prompt?: ReactNode
  /**
   * Why a message cannot be sent now. A message's Enter would answer the agent's open question
   * instead, picking whichever answer is highlighted ("No, exit" for folder trust).
   */
  held?: string
  /** Beside the actions: who the agent is signed in as. */
  account?: ReactNode
  /** Beside Send: how the agent may act (its permission mode). */
  options?: ReactNode
  /** The agent is answering: Stop takes Send's place. */
  busy?: boolean
  onStop?: () => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const send = async () => {
    const text = draft.trim()
    if (!text || sending || props.held || props.busy) return
    setSending(true)
    try {
      await props.onSend(text)
      setDraft('')
    } finally {
      setSending(false)
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {props.notice && <div className="shrink-0 px-4 pt-3">{props.notice}</div>}
      <div className="min-h-0 flex-1">{props.transcript}</div>
      <div className="shrink-0 border-t border-border-soft px-4 py-3">
        <div className="mx-auto flex w-full max-w-(--chat-measure) flex-col gap-2">
          {props.prompt}
          <Textarea
            aria-label={`Message ${props.providerName}`}
            placeholder={`Message ${props.providerName}…`}
            value={draft}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {props.held && <p className="text-xs text-text-soft">{props.held}</p>}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <Button size="sm" onClick={props.onShowTerminal}>
                <SquareTerminal data-icon="inline-start" />
                Show terminal
              </Button>
              {props.account}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {props.options}
              {props.busy && props.onStop ? (
                <Button size="sm" variant="mono" onClick={() => void props.onStop?.()}>
                  <Square data-icon="inline-start" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="mono"
                  disabled={!draft.trim() || sending || Boolean(props.held)}
                  onClick={() => void send()}
                >
                  <SendHorizontal data-icon="inline-start" />
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
