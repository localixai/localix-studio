import { registerInspectorHandler } from '@/shared/lib/inspectorBus'
import { AGENT_CHAT_KIND } from './createSession'

/** Tests: call `seen(sessionId, terminalId, providerName)` whenever a coding agent's chat view opens. */
export function onAgentChatOpen(
  seen: (sessionId: string, terminalId: string, providerName: string) => void,
): () => void {
  return registerInspectorHandler((request) => {
    if (request.kind !== 'work-item' || request.workKind !== AGENT_CHAT_KIND) return
    const payload = request.payload ?? {}
    seen(String(payload.sessionId), String(payload.terminalId), String(payload.providerName))
  })
}
