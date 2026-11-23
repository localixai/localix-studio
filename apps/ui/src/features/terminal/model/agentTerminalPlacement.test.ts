import { afterEach, expect, test } from 'bun:test'
import { emptyEditorState, groupOfTab, useGridStore } from '@/entities/workspace-grid/model'
import { openNewTerminal, openOwnedTerminal } from './terminalTabs'

const originalGrid = useGridStore.getState()

afterEach(() => {
  useGridStore.setState(originalGrid)
})

function openChat(sessionId: string): string {
  useGridStore.setState(emptyEditorState('g1'))
  useGridStore.getState().reopenChat(sessionId)
  const grid = useGridStore.getState()
  const chatTab = Object.values(grid.items).find((item) => item.kind === 'chat')
  if (!chatTab) throw new Error('chat tab did not open')
  const group = groupOfTab(grid.root, chatTab.id)
  if (!group) throw new Error('chat tab has no group')
  return group.id
}

test('a linked coding agent (Claude Code) opens where the chat is, as the active tab', () => {
  const chatGroup = openChat('s1')
  openOwnedTerminal('s1', 'claude-pty', 'Claude Code')
  const grid = useGridStore.getState()
  const agent = Object.values(grid.items).find((item) => item.title === 'Claude Code')
  expect(agent?.kind).toBe('terminal')
  const group = groupOfTab(grid.root, agent?.id ?? '')
  expect(group?.id).toBe(chatGroup)
  expect(group?.activeTab).toBe(agent?.id)
})

test('reopening the same agent reveals its tab in the chat group instead of a second one', () => {
  openChat('s1')
  openOwnedTerminal('s1', 'claude-pty', 'Claude Code')
  openOwnedTerminal('s1', 'claude-pty', 'Claude Code')
  const terminals = Object.values(useGridStore.getState().items).filter(
    (item) => item.kind === 'terminal',
  )
  expect(terminals).toHaveLength(1)
})

test('a plain terminal still opens in the editor area, not over the chat', async () => {
  const chatGroup = openChat('s1')
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: 'shell-pty', cwd: '/w' }), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
  try {
    await openNewTerminal('s1')
  } finally {
    globalThis.fetch = realFetch
  }
  const grid = useGridStore.getState()
  const shell = Object.values(grid.items).find((item) => item.kind === 'terminal')
  expect(shell).toBeDefined()
  expect(groupOfTab(grid.root, shell?.id ?? '')?.id).not.toBe(chatGroup)
})
