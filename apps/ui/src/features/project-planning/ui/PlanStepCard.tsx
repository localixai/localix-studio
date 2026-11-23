import { Button } from '@localixai/kit/button'
import { HitlInteractionFrame } from '@/entities/chat/ui/hitl/HitlInteractionFrame'
import type { PlanCard } from '../model/planFlow'

interface CardCopy {
  title: string
  detail: string
  yes: string
  later: string
}

const KEEP_TALKING = 'Keep talking'

const COPY: Record<PlanCard, CardCopy> = {
  draw: {
    title: 'Draw this plan in Project Space?',
    detail:
      'Opens Project Space beside the chat and draws the plan as a flow map while you watch. Nothing in your project changes.',
    yes: 'Open and draw',
    later: KEEP_TALKING,
  },
  redraw: {
    title: 'Nothing was drawn',
    detail: 'The model answered without drawing the flow map.',
    yes: 'Try again',
    later: KEEP_TALKING,
  },
  board: {
    title: 'Put the tasks on the Kanban board?',
    detail:
      'Opens this chat’s board beside the chat and adds each milestone as an epic, with its tasks and their checklists.',
    yes: 'Open board and add tasks',
    later: KEEP_TALKING,
  },
  refill: {
    title: 'No tasks were added',
    detail: 'The model answered without putting the tasks on the board.',
    yes: 'Try again',
    later: KEEP_TALKING,
  },
  approve: {
    title: 'Approve the plan?',
    detail:
      'Check the flow map and the board. Approving leaves Plan mode and starts the first task; until then nothing in your project changes.',
    yes: 'Approve and start',
    later: 'Change something',
  },
}

/**
 * A planning chat's next step, asked in place of the message box when the agent has answered:
 * yes runs the step; the other button gives the message box back until the agent answers again.
 */
export function PlanStepCard(props: {
  card: PlanCard
  onYes: () => void
  onLater: () => void
  busy?: boolean
  keyboardActive?: boolean
}) {
  const copy = COPY[props.card]
  return (
    <HitlInteractionFrame
      title={copy.title}
      detail={copy.detail}
      onDismiss={props.onLater}
      dismissLabel={copy.later}
      onSubmit={props.busy ? undefined : props.onYes}
      keyboardActive={props.keyboardActive}
      expiryOutcome="continue"
      footer={
        <>
          <Button disabled={props.busy} onClick={props.onLater}>
            {copy.later}
          </Button>
          <Button variant="mono" disabled={props.busy} onClick={props.onYes}>
            {copy.yes}
          </Button>
        </>
      }
    >
      {null}
    </HitlInteractionFrame>
  )
}
