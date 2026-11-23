import { useId, useState } from 'react'
import { Workflow } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Textarea } from '@localixai/kit/textarea'
import { TogglePill } from '@localixai/kit/toggle-pill'
import { toast } from '@/shared/lib/notify'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { DIAGRAM_KINDS, type DiagramKind } from '../model/overviewPrompt'
import { startOverviewChat } from '../model/startOverviewChat'

/**
 * Describe the project in your own words (or leave it to the agent) and pick diagrams: a new chat
 * in the project reads the code and answers with Mermaid flowcharts, on the project's model —
 * a provider, or a model running on this computer.
 */
export function DiagramCard(props: {
  projectId: string
  projectName: string
  onOpenChat: (sessionId: string) => void
  onChooseModel: () => void
}) {
  const descriptionId = useId()
  const [description, setDescription] = useState('')
  const [diagrams, setDiagrams] = useState<DiagramKind[]>(['architecture', 'data-flow'])
  const [busy, setBusy] = useState(false)
  const toggle = (kind: DiagramKind) =>
    setDiagrams((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    )
  const start = async () => {
    setBusy(true)
    try {
      const sessionId = await startOverviewChat({
        projectId: props.projectId,
        projectName: props.projectName,
        description,
        diagrams,
      })
      props.onOpenChat(sessionId)
    } catch (cause) {
      toast.error('Could not start the overview chat', {
        description: errorMessage(cause, '') || undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="block text-xs font-medium">
          Describe the project (optional)
        </label>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What it does, its parts, how data moves… Leave empty and the agent reads the folder."
          rows={4}
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Diagrams to draw">
        {DIAGRAM_KINDS.map((kind) => (
          <TogglePill
            key={kind.id}
            active={diagrams.includes(kind.id)}
            onClick={() => toggle(kind.id)}
          >
            {kind.label}
          </TogglePill>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="mono" onClick={() => void start()} disabled={busy}>
          <Workflow data-icon="inline-start" />
          {busy ? 'Starting…' : 'Generate overview'}
        </Button>
        <Button onClick={props.onChooseModel}>Connect a local model…</Button>
      </div>
      <p className="text-2xs text-text-soft">
        Runs in a new chat on this project&apos;s model. Pick a model on your computer in Settings →
        Models, or a local server (Ollama, LM Studio) as a provider; nothing then leaves the
        computer.
      </p>
    </div>
  )
}
