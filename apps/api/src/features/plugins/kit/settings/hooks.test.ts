import { expect, test } from 'bun:test'
import { settingsStatusLine } from './hooks'
import { settingsFixture } from './testing/settings-fixture'

const read = settingsFixture('kit-settings-hooks-')
test('the highest file that sets a status line applies, with its padding and refresh', () => {
  const line = (command: string, extra = {}) => ({
    statusLine: { type: 'command', command, ...extra },
  })
  const settings = read({
    user: line('mine'),
    project: line('team', { padding: 2.7, refreshInterval: 5 }),
    trusted: true,
  })
  expect(settingsStatusLine(settings)).toEqual({ command: 'team', padding: 2, refreshInterval: 5 })
})

test('a file that still holds the dropped subagentStatusLine keeps its status line', () => {
  const settings = read({
    user: {
      statusLine: { type: 'command', command: 'mine' },
      subagentStatusLine: { type: 'command', command: 'rows' },
    },
    trusted: true,
  })
  expect(settingsStatusLine(settings)).toEqual({ command: 'mine', padding: 0 })
})
