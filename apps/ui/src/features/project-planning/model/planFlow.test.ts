import { afterEach, describe, expect, test } from 'bun:test'
import type { Message } from '@/entities/chat/model/types'
import {
  beginPlanFlow,
  endPlanFlow,
  movePlanFlow,
  planCard,
  readPlanFlow,
  snoozePlanFlow,
} from './planFlow'

const user = (text = 'hi'): Message =>
  ({ id: `u${text}`, role: 'user', content: text, items: [] }) as unknown as Message
const reply = (...tools: { name: string; status?: string }[]): Message =>
  ({
    id: `a${tools.map((tool) => tool.name).join()}`,
    role: 'assistant',
    content: '',
    items: tools.map((tool, index) => ({
      id: `t${index}`,
      type: 'tool_call',
      toolCallId: `c${index}`,
      name: tool.name,
      status: tool.status ?? 'completed',
      activeVerb: '',
    })),
  }) as unknown as Message

afterEach(() => endPlanFlow('s1'))

describe('planCard', () => {
  test('no card for a chat that is not being planned', () => {
    expect(planCard(readPlanFlow('s1'), false, [user(), reply()])).toBeNull()
  })

  test('once the plan is written, the person is asked before it is drawn', () => {
    beginPlanFlow('s1')
    expect(planCard(readPlanFlow('s1'), false, [user(), reply()])).toBe('draw')
  })

  test('nothing is asked while the agent is still answering', () => {
    beginPlanFlow('s1')
    expect(planCard(readPlanFlow('s1'), true, [user(), reply()])).toBeNull()
    expect(planCard(readPlanFlow('s1'), false, [user(), reply(), user('more')])).toBeNull()
  })

  test('a drawn flow map leads to the board question; nothing drawn offers a retry', () => {
    beginPlanFlow('s1')
    const before = [user(), reply()]
    movePlanFlow('s1', 'draw', before.length)
    const flow = readPlanFlow('s1')
    expect(planCard(flow, false, [...before, user('draw'), reply({ name: 'space_apply' })])).toBe(
      'board',
    )
    expect(planCard(flow, false, [...before, user('draw'), reply()])).toBe('redraw')
    expect(
      planCard(flow, false, [
        ...before,
        user('draw'),
        reply({ name: 'space_apply', status: 'failed' }),
      ]),
    ).toBe('redraw')
  })

  test('tasks on the board lead to approval; an empty board offers a retry', () => {
    beginPlanFlow('s1')
    movePlanFlow('s1', 'board', 2)
    const flow = readPlanFlow('s1')
    const before = [user(), reply({ name: 'space_apply' })]
    expect(planCard(flow, false, [...before, user('tasks'), reply({ name: 'kanban' })])).toBe(
      'approve',
    )
    expect(planCard(flow, false, [...before, user('tasks'), reply()])).toBe('refill')
  })

  test('keep talking hides the card until the agent answers again', () => {
    beginPlanFlow('s1')
    const messages = [user(), reply()]
    snoozePlanFlow('s1', messages.length)
    expect(planCard(readPlanFlow('s1'), false, messages)).toBeNull()
    expect(planCard(readPlanFlow('s1'), false, [...messages, user('x'), reply()])).toBe('draw')
  })
})
