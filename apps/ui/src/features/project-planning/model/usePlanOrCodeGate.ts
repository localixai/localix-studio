import { useCallback, useState } from 'react'
import { backendClient } from '@/shared/api/client'
import { applyServerSession } from '@/entities/chat/model/sessionSync'
import { toast } from '@/shared/lib/notify'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { PLANNING_TOOLS, planKickoff } from './planPrompt'
import { beginPlanFlow } from './planFlow'
import { shouldAskPlanOrCode } from './planOrCode'

/** Chats whose plan-or-code question was answered in this window. */
const answered = new Set<string>()

/** Plan mode and the planning tools, for a chat the person chose to plan in. */
export async function switchToPlanning(sessionId: string): Promise<void> {
  applyServerSession(
    await backendClient.updateSession(sessionId, {
      permissionMode: 'plan',
      activateTools: [...PLANNING_TOOLS],
    }),
  )
}

/** A held send; given `rewrite`, it sends the rewritten text instead of the draft. */
export type HeldSend = (rewrite?: (text: string) => string) => void

/**
 * Holds a chat's first send in the normal mode until the person says plan or code. The send runs
 * once they answer; closing the question keeps the draft in the box and sends nothing. Plan sends
 * the planning kickoff with the draft as the project, and walks the chat through its steps.
 */
export function usePlanOrCodeGate(chat: {
  sessionId: string | null
  hasMessages: boolean
  permissionMode: string | undefined
}) {
  const [held, setHeld] = useState<HeldSend | null>(null)
  const gate = useCallback(
    (send: HeldSend, isInternal = false) => {
      if (!shouldAskPlanOrCode({ ...chat, isInternal }, answered)) return send()
      setHeld(() => send)
    },
    [chat],
  )
  const answer = useCallback(
    async (choice: 'plan' | 'code') => {
      const send = held
      setHeld(null)
      if (!send || !chat.sessionId) return
      answered.add(chat.sessionId)
      if (choice === 'plan') {
        try {
          await switchToPlanning(chat.sessionId)
        } catch (cause) {
          answered.delete(chat.sessionId)
          toast.error('Could not switch to Plan mode', {
            description: errorMessage(cause, '') || undefined,
          })
          return
        }
        beginPlanFlow(chat.sessionId)
        return send(planKickoff)
      }
      send()
    },
    [held, chat.sessionId],
  )
  return {
    gate,
    dialog: {
      open: held !== null,
      onPlan: () => void answer('plan'),
      onCode: () => void answer('code'),
      onCancel: () => setHeld(null),
    },
  }
}
