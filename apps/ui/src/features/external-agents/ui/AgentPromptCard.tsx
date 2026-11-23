import { useState } from 'react'
import { ArrowDown, ArrowUp, CornerDownLeft, ExternalLink } from 'lucide-react'
import type { AgentKey, AgentPrompt } from '@localixai/api/external-agent-contracts'
import { Button } from '@localixai/kit/button'
import { IconButton } from '@localixai/kit/icon-button'

/**
 * A question the agent's terminal waits on (folder trust, a permission, a login method), drawn in
 * its chat. Until it is answered the agent reads no message, so the answers are buttons here; the
 * one the agent has highlighted, which Enter would give, is marked.
 */
export function AgentPromptCard(props: {
  providerName: string
  prompt: AgentPrompt
  onChoose: (index: number) => Promise<void>
  onKeys: (keys: AgentKey[]) => Promise<void>
  onOpenLink: (url: string) => void
}) {
  const { prompt } = props
  const [busy, setBusy] = useState(false)
  const act = async (run: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await run()
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label={`${props.providerName} is asking`}
      className="flex flex-col gap-2 rounded-md border border-border-soft bg-field-fill p-3"
    >
      <p className="text-xs font-medium text-text-soft">{`${props.providerName} is asking`}</p>
      <pre className="max-h-48 overflow-auto font-mono text-xs/relaxed whitespace-pre-wrap text-foreground">
        {prompt.question.join('\n')}
      </pre>
      {prompt.options.length > 0 && (
        <div role="group" aria-label="Answers" className="flex flex-col items-start gap-1">
          {prompt.options.map((option, index) => (
            <Button
              key={`${index}:${option.label}`}
              size="sm"
              variant={option.selected ? 'field' : 'default'}
              aria-current={option.selected ? 'true' : undefined}
              disabled={busy}
              onClick={() => void act(() => props.onChoose(index))}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      {prompt.url && (
        <div>
          <Button size="sm" variant="mono" onClick={() => props.onOpenLink(prompt.url ?? '')}>
            <ExternalLink data-icon="inline-start" />
            Open sign-in page
          </Button>
        </div>
      )}
      {prompt.kind === 'text' && (
        <p className="text-xs text-text-soft">
          Type the answer in the message box below and send it.
        </p>
      )}
      <div className="flex items-center gap-1" role="group" aria-label="Keys">
        <IconButton
          size="sm"
          aria-label="Up"
          tooltip="Up"
          disabled={busy}
          onClick={() => void act(() => props.onKeys(['up']))}
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          size="sm"
          aria-label="Down"
          tooltip="Down"
          disabled={busy}
          onClick={() => void act(() => props.onKeys(['down']))}
        >
          <ArrowDown />
        </IconButton>
        <IconButton
          size="sm"
          aria-label="Enter"
          tooltip="Enter"
          disabled={busy}
          onClick={() => void act(() => props.onKeys(['enter']))}
        >
          <CornerDownLeft />
        </IconButton>
        <Button size="sm" disabled={busy} onClick={() => void act(() => props.onKeys(['escape']))}>
          Cancel (Esc)
        </Button>
      </div>
    </section>
  )
}
