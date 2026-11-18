import { backendClient } from '@/shared/api/client'
import { applyServerSession } from '@/entities/chat/model/sessionSync'
import { sendChatMessage } from '@/entities/chat/model/sendChatMessage'
import { projectOverviewPrompt, type DiagramKind } from './overviewPrompt'

/**
 * Start a chat in the project that asks for its overview and diagrams. The chat runs on the
 * project's model (a provider or a model on this computer); returns the new chat's id so the
 * caller can open it.
 */
export async function startOverviewChat(input: {
  projectId: string
  projectName: string
  description: string
  diagrams: readonly DiagramKind[]
}): Promise<string> {
  const session = await backendClient.createSession({
    projectId: input.projectId,
    title: `${input.projectName} overview`,
  })
  applyServerSession(session)
  void sendChatMessage(session.id, projectOverviewPrompt(input))
  return session.id
}
