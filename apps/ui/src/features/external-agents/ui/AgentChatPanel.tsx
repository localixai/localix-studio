import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { SendHorizontal, SquareTerminal } from 'lucide-react'
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
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
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
      <div className="min-h-0 flex-1">{props.transcript}</div>
      <div className="shrink-0 border-t border-border-soft px-4 py-3">
        <div className="mx-auto flex w-full max-w-(--chat-measure) flex-col gap-2">
          <Textarea
            aria-label={`Message ${props.providerName}`}
            placeholder={`Message ${props.providerName}…`}
            value={draft}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" onClick={props.onShowTerminal}>
              <SquareTerminal data-icon="inline-start" />
              Show terminal
            </Button>
            <Button
              size="sm"
              variant="mono"
              disabled={!draft.trim() || sending}
              onClick={() => void send()}
            >
              <SendHorizontal data-icon="inline-start" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
