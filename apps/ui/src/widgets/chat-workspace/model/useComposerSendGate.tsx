import { useCallback } from 'react'
import { useChatStore } from '@/entities/chat/model/store'
import { findSessionInState } from '@/entities/chat/model/findSession'
import type { MessageBinding } from '@/shared/api/contracts'
import { usePlanOrCodeGate } from '@/features/project-planning/model/usePlanOrCodeGate'
import { PlanOrCodeDialog } from '@/features/project-planning/ui/PlanOrCodeDialog'
import { usePlanStep } from '@/features/project-planning/ui/usePlanStep'

type Send = (text?: string, bindings?: MessageBinding[], internal?: boolean) => void

/**
 * The composer's send: the selected system context rides along, and a chat's first message in the
 * normal mode is held until the person says plan (Plan mode: no code) or code. `dialog` is that
 * question, rendered by the surface. `planStep` is a planning chat's next step (draw the plan,
 * fill the board, approve), shown in place of the message box while it waits on the person.
 */
export function useComposerSendGate(
  onSend: Send,
  selection: MessageBinding | null | undefined,
  sessionId: string | null,
  hasMessages: boolean,
) {
  const send = useCallback<Send>(
    (text, bindings, internal) =>
      onSend(text, selection ? [...(bindings ?? []), selection] : bindings, internal),
    [onSend, selection],
  )
  const permissionMode = useChatStore(
    (state) => findSessionInState(state, sessionId)?.permissionMode,
  )
  const planOrCode = usePlanOrCodeGate({ sessionId, hasMessages, permissionMode })
  const { gate } = planOrCode
  const gatedSend = useCallback<Send>(
    (text, bindings, internal) =>
      gate(
        (rewrite) => send(rewrite ? rewrite(text ?? '') : text, bindings, internal),
        internal === true,
      ),
    [gate, send],
  )
  const planStep = usePlanStep(sessionId, true)
  return { send: gatedSend, dialog: <PlanOrCodeDialog {...planOrCode.dialog} />, planStep }
}
