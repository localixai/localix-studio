import { describe, expect, test } from 'bun:test'

import { shouldAskPlanOrCode } from './planOrCode'

const base = { sessionId: 's1', hasMessages: false, permissionMode: 'default', isInternal: false }

describe('shouldAskPlanOrCode', () => {
  test('the first message of a chat in the normal mode asks whether to plan or to code', () => {
    expect(shouldAskPlanOrCode(base, new Set())).toBe(true)
  })

  test('a chat already under way, already answered, or in another mode does not ask', () => {
    expect(shouldAskPlanOrCode({ ...base, hasMessages: true }, new Set())).toBe(false)
    expect(shouldAskPlanOrCode(base, new Set(['s1']))).toBe(false)
    expect(shouldAskPlanOrCode({ ...base, permissionMode: 'plan' }, new Set())).toBe(false)
    expect(shouldAskPlanOrCode({ ...base, permissionMode: 'bypass' }, new Set())).toBe(false)
  })

  test('a machine-composed send or a composer with no chat yet is never stopped', () => {
    expect(shouldAskPlanOrCode({ ...base, isInternal: true }, new Set())).toBe(false)
    expect(shouldAskPlanOrCode({ ...base, sessionId: null }, new Set())).toBe(false)
  })
})
