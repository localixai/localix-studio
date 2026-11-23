import type { AppDeps } from '../app'
import { createOwnedAgentRoutes } from '../features/external-agents/backend/owned-session-routes'
import { recordTerminalWork } from '../features/terminal/terminal-work'
import { createAttachAgentRoutes } from '../features/external-agents/backend/attach-session-routes'
import { createLinkAgentRoutes } from '../features/external-agents/backend/link-session-routes'
import { createOwnedScreenRoutes } from '../features/external-agents/backend/owned-screen-routes'
import { createAgentAccountRoutes } from '../features/external-agents/backend/agent-account-routes'
import { agentMcpServers } from './agent-mcp-servers'
import { runAgentProgram, spawnAgentTurn } from './agent-program'
import { createHeadlessTurns } from '../features/external-agents/backend/headless-turns'
import { createHeadlessChat } from '../features/external-agents/backend/headless-chat'
import { installedExternalAgents } from '../features/external-agents/installed'

export function ownedAgentRoutes(
  deps: Pick<
    AppDeps,
    'chatService' | 'terminalService' | 'work' | 'externalAgents' | 'logger' | 'projectsService'
  >,
) {
  const session = (userId: string, sessionId: string) =>
    deps.chatService.getSession(userId, sessionId)
  const terminals = (userId: string) => deps.terminalService.list(userId)
  const spawn = async (
    userId: string,
    sessionId: string,
    command: string,
    options?: { env?: Record<string, string | undefined> },
  ) => {
    const terminal = await deps.terminalService.spawnCommand(userId, {
      sessionId,
      command,
      env: options?.env,
    })
    recordTerminalWork(deps.work, { owner: { userId, sessionId }, label: command, terminal })
    return terminal
  }
  const cwd = (userId: string, sessionId: string) =>
    deps.chatService.resolveSessionCwd(userId, sessionId)
  const remember = (userId: string, id: string, key: string) =>
    deps.chatService.updateSession(userId, id, { externalAgentSessionKey: key })
  const mcpServers = (_userId: string, sessionId: string, origin: string) =>
    agentMcpServers(origin, sessionId)
  // Claude Code is chatted with headless: one `claude -p` turn per message, no terminal.
  const headless = createHeadlessChat({
    session,
    remember,
    cwd,
    mcpServers,
    installed: installedExternalAgents,
    transcriptExists: async (key) => Boolean(await deps.externalAgents?.nativeSummary(key)),
    turns: createHeadlessTurns({ spawn: spawnAgentTurn }),
  })
  return createOwnedAgentRoutes(
    {
      session,
      cwd,
      terminals,
      spawn,
      reportError: (...[error]) =>
        deps.logger.warn({ event: 'external_agents.identity_save_failed', error: String(error) }),
      remember,
      mcpServers,
    },
    deps.externalAgents,
    installedExternalAgents,
    { headless },
  )
    .route(
      '/',
      createOwnedScreenRoutes(
        {
          session,
          terminals,
          screen: async (userId, terminalId) =>
            (await deps.terminalService.get(userId, terminalId)?.screen()) ?? null,
          write: (...args) => deps.terminalService.writeUserInput(...args),
        },
        { agents: deps.externalAgents, headless },
      ),
    )
    .route(
      '/',
      createAgentAccountRoutes(
        {
          session,
          terminals,
          spawn,
          close: (...args) => deps.terminalService.close(...args),
          run: runAgentProgram,
        },
        deps.externalAgents,
      ),
    )
    .route(
      '/',
      createLinkAgentRoutes({
        session: (...args) => deps.chatService.getSession(...args),
        link: (userId, id, provider) =>
          deps.chatService.updateSession(userId, id, { externalAgentProvider: provider }),
      }),
    )
    .route(
      '/',
      createAttachAgentRoutes({
        native: async (...args) => deps.externalAgents?.nativeSummary(...args) ?? null,
        sessions: (...args) => deps.chatService.listSessions(...args),
        project: (...args) => deps.projectsService.getProject(...args),
        resolveProject: async (...args) =>
          (await deps.projectsService.resolveProjectByPath(...args)).project,
        create: (...args) => deps.chatService.createSession(...args),
      }),
    )
}
