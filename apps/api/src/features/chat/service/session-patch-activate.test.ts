import { expect, test } from 'bun:test'

import type { SessionRecord } from '../repository'
import { sessionFieldsPatch } from './session-patch'

const now = () => '2026-11-18T00:00:00.000Z'
const session = { title: 'Plan', activatedTools: ['space_read'] } as unknown as SessionRecord

test('a chat can start with deferred tools already loaded, kept with those it loaded before', () => {
  expect(sessionFieldsPatch(session, { activateTools: ['kanban', 'space_read'] }, now)).toEqual({
    activatedTools: ['space_read', 'kanban'],
    updatedAt: now(),
  })
})

test('naming none changes nothing', () => {
  expect(sessionFieldsPatch(session, { activateTools: [] }, now)).toBeNull()
})
