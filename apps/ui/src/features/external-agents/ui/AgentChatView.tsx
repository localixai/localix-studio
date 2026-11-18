import { useState } from 'react'
import useSWR from 'swr'
import { MAX_TRANSCRIPT_EVENTS } from '@localixai/api/external-agent-contracts'
import { EmptyHint } from '@localixai/kit/empty-hint'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import type { WorkItem } from '@/shared/lib/workItem'
import { backendClient } from '@/shared/api/client'
import { terminal as terminalBus } from '@/shared/lib/terminalBus'
import { toast } from '@/shared/lib/notify'
import { useAutoScroll } from '@/shared/hooks/useAutoScroll'
import { useChatStore } from '@/entities/chat/model/store'
import { findSessionInState } from '@/entities/chat/model/findSession'
import { TranscriptView } from '@/entities/chat/ui/TranscriptView'
import { externalAgentsApi } from '../api'
import { externalSessionMessages } from '../model/openSession'
import { agentChatState, type PendingMessage } from '../model/agentChatState'
import { AgentChatPanel } from './AgentChatPanel'

/** How often the agent's own history is read again while its chat view is open. */
const LIVE_REFRESH_MS = 1000
/** A link key saved before the agent's own session id is known (`live/store.ts`). */
const PENDING_MARK = 'pending-terminal-'

/**
 * A linked coding agent shown as a chat. Its turns come from the agent's own session history,
 * read again every moment while open; a message is typed into its terminal, then Enter.
 */
export default function AgentChatView({ item, focused }: { item: WorkItem; focused: boolean }) {
  const sessionId = typeof item.payload?.sessionId === 'string' ? item.payload.sessionId : ''
  const terminalId = typeof item.payload?.terminalId === 'string' ? item.payload.terminalId : ''
  const providerName =
    typeof item.payload?.providerName === 'string' ? item.payload.providerName : item.title
  const key = useChatStore(
    (state) => findSessionInState(state, sessionId)?.externalAgentSessionKey ?? null,
  )
  // Until Localix has identified the agent's own session, there is no history to read yet.
  const readable = key && !key.includes(PENDING_MARK) ? key : null
  const live = useSWR(
    readable ? ['external-agent:live', readable] : null,
    () => externalAgentsApi.items(readable ?? '', MAX_TRANSCRIPT_EVENTS, true),
    { refreshInterval: LIVE_REFRESH_MS, keepPreviousData: true },
  )
  const history = live.data ? externalSessionMessages(live.data) : []
  // What was sent and the agent's history does not show yet: on screen the moment it is sent.
  const [pending, setPending] = useState<PendingMessage[]>([])
  const { messages, working, settled } = agentChatState(history, pending)
  const scroll = useAutoScroll<HTMLDivElement>(`agent-chat:${sessionId}`, focused)

  const send = async (text: string) => {
    const sent = { id: `agent-chat:pending:${Date.now()}`, text }
    // Those the history already shows are dropped as the next one is added.
    setPending((current) => [...current.filter((m) => !settled.includes(m.id)), sent])
    try {
      // The text, then Enter on its own: a single write ending in a newline reads as a paste
      // to a terminal app, which keeps the newline instead of submitting.
      await backendClient.writeTerminalInput(terminalId, text)
      await backendClient.writeTerminalInput(terminalId, '\r')
    } catch (cause) {
      setPending((current) => current.filter((message) => message.id !== sent.id))
      toast.error(`Could not reach ${providerName}`, {
        description: errorMessage(
          cause,
          'Its terminal has ended. Reopen the chat to start it again.',
        ),
      })
      throw cause
    }
  }

  return (
    <AgentChatPanel
      providerName={providerName}
      onSend={send}
      onShowTerminal={() => terminalBus.openOwned(sessionId, terminalId, providerName)}
      transcript={
        <TranscriptView
          messages={messages}
          sessionId={sessionId}
          isFocused={focused}
          scroll={scroll}
          isGenerating={working}
          phaseLabel={`${providerName} is working…`}
          foreignTools
          empty={
            <EmptyHint>
              {`${providerName} is ready. Send a message to start; its replies appear here.`}
            </EmptyHint>
          }
        />
      }
    />
  )
}
