import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { MAX_TRANSCRIPT_EVENTS } from '@localixai/api/external-agent-contracts'
import { Button } from '@localixai/kit/button'
import { EmptyHint } from '@localixai/kit/empty-hint'
import { WorkbenchNoticeBar } from '@localixai/kit/workbench-notice-bar'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import type { WorkItem } from '@/shared/lib/workItem'
import { terminal as terminalBus } from '@/shared/lib/terminalBus'
import { openExternal } from '@/shared/lib/openExternal'
import { toast } from '@/shared/lib/notify'
import { useAutoScroll } from '@/shared/hooks/useAutoScroll'
import { useChatStore } from '@/entities/chat/model/store'
import { findSessionInState } from '@/entities/chat/model/findSession'
import { TranscriptView } from '@/entities/chat/ui/TranscriptView'
import { externalAgentsApi } from '../api'
import { externalSessionMessages } from '../model/openSession'
import { agentChatState, type PendingMessage } from '../model/agentChatState'
import { useAgentTerminal } from '../model/useAgentTerminal'
import { useHistoryStream } from '../model/useHistoryStream'
import { AgentChatPanel } from './AgentChatPanel'
import { AgentPromptCard } from './AgentPromptCard'
import { AgentAccountBar } from './AgentAccountBar'
import { PermissionModePicker, usePermissionMode } from './PermissionModePicker'

/**
 * How often the agent's own history is read again while its chat view is open: soon when nothing
 * says it changed, rarely when its writes are pushed (`useHistoryStream`) and the timer is only a
 * backstop. A read is up to the transcript's last events, so it is not repeated every second.
 */
const LIVE_REFRESH_MS = 2000
const PUSHED_REFRESH_MS = 15_000
/** A link key saved before the agent's own session id is known (`live/store.ts`). */
const PENDING_MARK = 'pending-terminal-'

/**
 * A linked coding agent shown as a chat. Its turns come from the agent's own session history,
 * read again every moment while open; a message is typed into its terminal, then Enter. What the
 * terminal asks besides (folder trust, a permission, a sign-in) is answered here too.
 */
export default function AgentChatView({ item, focused }: { item: WorkItem; focused: boolean }) {
  const sessionId = typeof item.payload?.sessionId === 'string' ? item.payload.sessionId : ''
  const providerName =
    typeof item.payload?.providerName === 'string' ? item.payload.providerName : item.title
  const key = useChatStore(
    (state) => findSessionInState(state, sessionId)?.externalAgentSessionKey ?? null,
  )
  // Until Localix has identified the agent's own session, there is no history to read yet.
  const readable = key && !key.includes(PENDING_MARK) ? key : null
  const pushed = useRef(false)
  const live = useSWR(
    readable ? ['external-agent:live', readable] : null,
    () => externalAgentsApi.items(readable ?? '', MAX_TRANSCRIPT_EVENTS, true),
    {
      refreshInterval: () => (pushed.current ? PUSHED_REFRESH_MS : LIVE_REFRESH_MS),
      keepPreviousData: true,
    },
  )
  const streaming = useHistoryStream(Boolean(readable), () => void live.mutate())
  useEffect(() => {
    pushed.current = streaming
  }, [streaming])
  const history = live.data ? externalSessionMessages(live.data) : []
  // What was sent and the agent's history does not show yet: on screen the moment it is sent.
  const [pending, setPending] = useState<PendingMessage[]>([])
  const { messages, working, settled } = agentChatState(history, pending)
  const scroll = useAutoScroll<HTMLDivElement>(`agent-chat:${sessionId}`, focused)
  const agent = useAgentTerminal(sessionId)
  const [permissionMode, setPermissionMode] = usePermissionMode()
  // A turn that just ended has written its last words: read them now, not at the next beat.
  const { mutate: reread } = live
  useEffect(() => {
    if (!agent.busy) void reread()
  }, [agent.busy, reread])

  const failed = (title: string) => (cause: unknown) => {
    toast.error(title, { description: errorMessage(cause, '') || undefined })
  }
  const send = async (text: string) => {
    const sent = { id: `agent-chat:pending:${Date.now()}`, text }
    // Those the history already shows are dropped as the next one is added.
    setPending((current) => [...current.filter((m) => !settled.includes(m.id)), sent])
    try {
      await externalAgentsApi.input(sessionId, text, permissionMode || undefined)
      // A message answering a question (a sign-in code) is not a turn of the conversation.
      if (agent.prompt) setPending((current) => current.filter((m) => m.id !== sent.id))
    } catch (cause) {
      setPending((current) => current.filter((message) => message.id !== sent.id))
      failed(`Could not reach ${providerName}`)(cause)
      throw cause
    } finally {
      void agent.refreshScreen()
    }
  }
  const start = () =>
    externalAgentsApi
      .openOwned(sessionId)
      .then(() => agent.refreshScreen())
      .catch(failed(`Could not start ${providerName}`))
  const showTerminal = () =>
    externalAgentsApi
      .openOwned(sessionId, true)
      .then((opened) => {
        if (opened.terminalId) terminalBus.openOwned(sessionId, opened.terminalId, providerName)
      })
      .catch(failed(`Could not open ${providerName}`))
  const press = (keys: Parameters<typeof externalAgentsApi.keys>[1]) =>
    externalAgentsApi
      .keys(sessionId, keys)
      .then(() => void agent.refreshScreen())
      .catch(failed(`Could not answer ${providerName}`))

  const prompt = agent.prompt
  const login = () =>
    externalAgentsApi
      .login(sessionId)
      .then(() => void agent.refreshScreen())
      .catch(failed('Could not start the sign-in'))
  return (
    <AgentChatPanel
      providerName={providerName}
      onSend={send}
      busy={agent.busy}
      onStop={() =>
        externalAgentsApi
          .stop(sessionId)
          .then(() => void agent.refreshScreen())
          .catch(failed(`Could not stop ${providerName}`))
      }
      options={
        agent.headless ? (
          <PermissionModePicker value={permissionMode} onChange={setPermissionMode} />
        ) : undefined
      }
      onShowTerminal={() => void showTerminal()}
      held={
        prompt?.kind === 'choice'
          ? `Answer ${providerName}’s question above first: Enter there picks the highlighted answer.`
          : undefined
      }
      notice={
        agent.headless && agent.error && !agent.busy ? (
          <WorkbenchNoticeBar
            role="alert"
            tone="error"
            title={`${providerName} could not answer`}
            description={agent.error}
            actions={
              /log ?in/i.test(agent.error) ? (
                <Button size="sm" variant="mono" onClick={() => void login()}>
                  Log in
                </Button>
              ) : undefined
            }
          />
        ) : agent.running === false ? (
          <WorkbenchNoticeBar
            role="status"
            title={`${providerName} is not running`}
            description="It exited, or was stopped to sign in or out. Start it to continue this conversation."
            actions={
              <Button size="sm" variant="mono" onClick={() => void start()}>
                Start {providerName}
              </Button>
            }
          />
        ) : undefined
      }
      prompt={
        prompt ? (
          <AgentPromptCard
            providerName={providerName}
            prompt={prompt}
            onChoose={(index) => press({ choose: index })}
            onKeys={(keys) => press({ keys })}
            onOpenLink={openExternal}
          />
        ) : undefined
      }
      account={
        agent.account ? (
          <AgentAccountBar
            account={agent.account}
            onLogin={login}
            onLogout={() =>
              externalAgentsApi
                .logout(sessionId)
                .then((account) => void agent.setAccount(account))
                .then(() => void agent.refreshScreen())
                .catch(failed('Could not sign out'))
            }
          />
        ) : undefined
      }
      transcript={
        <TranscriptView
          messages={messages}
          sessionId={sessionId}
          isFocused={focused}
          scroll={scroll}
          isGenerating={agent.headless ? agent.busy : working && agent.running !== false && !prompt}
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
