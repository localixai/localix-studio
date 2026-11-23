import { externalAgentsApi } from '../api'
import { inspector } from '@/shared/lib/inspectorBus'
import { toast } from '@/shared/lib/notify'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'

export const AGENT_CHAT_KIND = 'external-agent-chat'

/** The agent's chat view in its Localix chat: its turns as messages, its terminal behind it. */
export function openAgentChat(sessionId: string, terminalId: string | null, providerName: string) {
  inspector.openWorkItem({
    workKind: AGENT_CHAT_KIND,
    id: `${AGENT_CHAT_KIND}:${sessionId}`,
    title: providerName,
    scope: sessionId,
    payload: { sessionId, terminalId, providerName },
  })
}

export async function openOwnedExternalSession(
  sessionId: string,
  shouldReveal: () => boolean = () => true,
) {
  try {
    const terminal = await externalAgentsApi.openOwned(sessionId)
    if (shouldReveal()) openAgentChat(sessionId, terminal.terminalId, terminal.providerName)
  } catch (error) {
    toast.error('Could not open the agent', {
      description: errorMessage(error, '') || undefined,
    })
  }
}
