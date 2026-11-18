import { useGridStore, groupOfTab, type WorkItem } from '@/entities/workspace-grid/model'

export function makeTerminalItem(args: {
  sessionId: string
  terminalId: string
  owned: boolean
  title: string
  command?: string
  cwd?: string
}): WorkItem {
  return {
    kind: 'terminal',
    id: `terminal:${args.terminalId}`,
    title: args.title,
    scope: args.sessionId,
    payload: {
      sessionId: args.sessionId,
      terminalId: args.terminalId,
      owned: args.owned,
      command: args.command,
      cwd: args.cwd,
    },
  }
}

/** Open `item` as a terminal tab: reveal it if already open, else dock it into the
 *  terminal role group. Only someone's explicit open reaches here, so it always takes focus. */
export function placeTerminal(item: WorkItem): void {
  const grid = useGridStore.getState()
  const already = groupOfTab(grid.root, item.id)
  const group = already ? already.id : grid.resolveRoleGroup('terminal')
  grid.openItem(item, { group, activate: true })
}

/** Open a linked coding agent's CLI (Claude Code, Codex…) where its chat is: a tab beside the chat
 *  in the chat's own group, so the agent takes the chat's place instead of a split beside it. */
export function placeAgentTerminal(item: WorkItem): void {
  const grid = useGridStore.getState()
  const already = groupOfTab(grid.root, item.id)
  const group = already ? already.id : grid.resolveRoleGroup('chat')
  grid.openItem(item, { group, activate: true })
}
