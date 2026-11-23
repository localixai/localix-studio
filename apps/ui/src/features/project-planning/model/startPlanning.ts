import { backendClient } from '@/shared/api/client'
import { localModelsApi } from '@/shared/api/localModelsApi'
import { applyServerSession } from '@/entities/chat/model/sessionSync'
import { sendChatMessage } from '@/entities/chat/model/sendChatMessage'
import { composerBus } from '@/shared/lib/composerBus'
import { openModelPicker } from '@/shared/lib/modelPickerBus'
import { findLocalModel, LOCAL_PROVIDER_ID, type LocalModelChoice } from './localModel'
import { PLAN_KICKOFF, PLANNING_TOOLS } from './planPrompt'
import { beginPlanFlow } from './planFlow'

/** The model on this computer to plan on, or null when none is connected yet. */
export async function checkLocalModel(): Promise<LocalModelChoice | null> {
  const [connections, status] = await Promise.all([
    backendClient.listConnections(),
    localModelsApi.status(),
  ])
  return findLocalModel(connections, status.installed, status.external ?? [])
}

/**
 * Start planning in this chat on the local model. A downloaded model is routed to and the kickoff
 * sent at once; behind a model server, the kickoff waits in the message box while the picker asks
 * which of the server's models to use.
 */
/**
 * A planning chat plans and describes: Plan mode lets it read the project and change only its own
 * state (the board, Project Space), never code; the tools it draws and plans with are loaded up
 * front, so a small local model does not have to find them first.
 */
const PLANNING_SETUP = { permissionMode: 'plan' as const, activateTools: [...PLANNING_TOOLS] }

export async function startPlanning(sessionId: string, choice: LocalModelChoice): Promise<void> {
  beginPlanFlow(sessionId)
  if (!choice.modelId) {
    applyServerSession(await backendClient.updateSession(sessionId, PLANNING_SETUP))
    composerBus.insert({ sessionId, text: PLAN_KICKOFF, replace: true, focus: true })
    openModelPicker({ sessionId })
    return
  }
  // Local models need the Local connection (no key: it only lists them in the picker). Added here
  // rather than sending the person to a form that asks for an API key it does not need.
  const connectionId =
    choice.connectionId ??
    (
      await backendClient.createConnection({
        providerId: LOCAL_PROVIDER_ID,
        providerName: 'Local',
        label: 'Local',
        apiKey: 'local',
      })
    ).id
  const session = await backendClient.updateSession(sessionId, {
    route: { providerConnectionId: connectionId, modelId: choice.modelId },
    ...PLANNING_SETUP,
  })
  applyServerSession(session)
  await sendChatMessage(sessionId, PLAN_KICKOFF)
}
