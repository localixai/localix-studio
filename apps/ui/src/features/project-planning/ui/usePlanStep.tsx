import { useState, type ReactNode } from 'react'
import { localixUri } from '@localixai/mini-app-sdk/navigation'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { backendClient } from '@/shared/api/client'
import { useChatStore } from '@/entities/chat/model/store'
import { findSessionInState } from '@/entities/chat/model/findSession'
import { applyServerSession } from '@/entities/chat/model/sessionSync'
import { sendChatMessage } from '@/entities/chat/model/sendChatMessage'
import { useUiNavigation } from '@/shared/hooks/useUiNavigation'
import { navigateUi } from '@/shared/lib/uiNavigation'
import { toast } from '@/shared/lib/notify'
import {
  endPlanFlow,
  movePlanFlow,
  planCard,
  snoozePlanFlow,
  usePlanFlow,
  type PlanStep,
} from '../model/planFlow'
import { BOARD_PROMPT, DRAW_PROMPT, START_PROMPT } from '../model/planPrompt'
import { PlanStepCard } from './PlanStepCard'

/**
 * Where each step's work shows: this chat's Project Space and its Kanban board, the resources the
 * planning tools (`PLANNING_TOOLS`) offer in their results. Opened before the step's prompt is
 * sent, so the person watches the map drawn and the cards arrive. When the mini app is missing
 * nothing opens and the step still runs.
 */
const stepView = (step: Exclude<PlanStep, 'outline'>, sessionId: string) =>
  step === 'draw'
    ? localixUri('resource', ['project-space', 'space', sessionId])
    : localixUri('resource', ['kanban', 'board', sessionId])

/**
 * A planning chat's next step, for the composer to show in place of the message box: the card,
 * or null when nothing is waiting on the person.
 */
export function usePlanStep(sessionId: string | null, keyboardActive: boolean): ReactNode {
  const flow = usePlanFlow(sessionId)
  const session = useChatStore((state) => findSessionInState(state, sessionId))
  const host = useUiNavigation({ sessionId })
  const [busy, setBusy] = useState(false)
  const messages = session?.messages ?? []
  const card = planCard(flow, session?.isRunning ?? false, messages)
  if (!sessionId || !card) return null

  const act = (work: () => Promise<void>) => async () => {
    if (busy) return
    setBusy(true)
    try {
      await work()
    } catch (cause) {
      toast.error('Could not go on with the plan', {
        description: errorMessage(cause, '') || undefined,
      })
    } finally {
      setBusy(false)
    }
  }
  const runStep = (step: Exclude<PlanStep, 'outline'>, prompt: string) =>
    act(async () => {
      navigateUi(stepView(step, sessionId), host)
      movePlanFlow(sessionId, step, messages.length)
      await sendChatMessage(sessionId, prompt)
    })
  const approve = act(async () => {
    applyServerSession(await backendClient.updateSession(sessionId, { permissionMode: 'default' }))
    endPlanFlow(sessionId)
    await sendChatMessage(sessionId, START_PROMPT)
  })
  const onYes =
    card === 'approve'
      ? approve
      : card === 'draw' || card === 'redraw'
        ? runStep('draw', DRAW_PROMPT)
        : runStep('board', BOARD_PROMPT)

  return (
    <PlanStepCard
      card={card}
      busy={busy}
      keyboardActive={keyboardActive}
      onYes={() => void onYes()}
      onLater={() => snoozePlanFlow(sessionId, messages.length)}
    />
  )
}
