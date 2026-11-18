import { describe, expect, test } from 'bun:test'

import { agentChatState } from './agentChatState'

const user = (id: string, content: string) => ({ id, role: 'user' as const, content })
const reply = (id: string, ...items: object[]) => ({
  id,
  role: 'assistant' as const,
  items: items as never[],
})
const text = (value: string) => ({ type: 'text', text: value })
const tool = { type: 'tool', name: 'Bash' }

describe('agentChatState', () => {
  test('a sent message shows at once, before the agent has written anything, and reads as working', () => {
    const state = agentChatState([], [{ id: 'p1', text: 'add a login page' }])
    expect(state.messages).toEqual([{ id: 'p1', role: 'user', content: 'add a login page' }])
    expect(state.working).toBe(true)
  })

  test('once the agent’s history has the message, the copy it shows is the history’s', () => {
    const state = agentChatState(
      [user('k#turn-0', 'add a login page')],
      [{ id: 'p1', text: 'add a login page' }],
    )
    expect(state.messages.map((message) => message.id)).toEqual(['k#turn-0'])
    expect(state.settled).toEqual(['p1'])
    // Asked, not yet answered.
    expect(state.working).toBe(true)
  })

  test('working while the last step is a tool, idle once the agent answered in words', () => {
    expect(agentChatState([user('u', 'go'), reply('a', text('Looking'), tool)], []).working).toBe(
      true,
    )
    expect(
      agentChatState([user('u', 'go'), reply('a', tool, text('Done: added the page.'))], [])
        .working,
    ).toBe(false)
  })

  test('an empty chat is idle', () => {
    expect(agentChatState([], [])).toEqual({ messages: [], working: false, settled: [] })
  })
})
