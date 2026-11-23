import { expect, test } from 'bun:test'

import {
  BOARD_PROMPT,
  DRAW_PROMPT,
  PLAN_KICKOFF,
  PLANNING_TOOLS,
  START_PROMPT,
  planKickoff,
} from './planPrompt'

test('the kickoff writes the plan as Markdown in the chat, and holds the tools for later', () => {
  expect(PLAN_KICKOFF).toMatch(/do not (write|create|change).*code/i)
  expect(PLAN_KICKOFF).toMatch(/markdown/i)
  expect(PLAN_KICKOFF).toMatch(/milestone/i)
  expect(PLAN_KICKOFF).toMatch(/do not call .*tools? yet/i)
})

test('what the person already said about the project rides with the kickoff', () => {
  const text = planKickoff('a coding app that connects my local model')
  expect(text.startsWith(PLAN_KICKOFF)).toBe(true)
  expect(text).toContain('a coding app that connects my local model')
  expect(planKickoff('  ')).toBe(PLAN_KICKOFF)
})

test('drawing turns the written plan into one space_apply flow map', () => {
  expect(DRAW_PROMPT).toContain('`space_apply`')
  expect(DRAW_PROMPT).toMatch(/rectangle/)
  expect(DRAW_PROMPT).toMatch(/ellipse/)
  expect(DRAW_PROMPT).toMatch(/"op": "connect"/)
  expect(DRAW_PROMPT).not.toContain('`kanban`')
})

test('the board step is one batched kanban create and nothing else', () => {
  expect(BOARD_PROMPT).toContain('`kanban`')
  expect(BOARD_PROMPT).toContain('"action": "create"')
  expect(BOARD_PROMPT).toContain('"parent"')
  expect(BOARD_PROMPT).not.toContain('`space_apply`')
})

test('approval starts the work from the board', () => {
  expect(START_PROMPT).toMatch(/approve/i)
  expect(START_PROMPT).toMatch(/board/i)
})

test('the chat starts with exactly the tools the plan needs already loaded', () => {
  expect(PLANNING_TOOLS).toEqual(['kanban', 'space_read', 'space_apply', 'space_view'])
})
