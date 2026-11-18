import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing/dom'

let teardown: () => Promise<void>

beforeAll(() => {
  teardown = registerDom()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  await teardown()
})

const NOW = new Date(2024, 5, 12, 15).getTime()
const commit = (hash: string, day: number, subject: string) => ({
  hash: hash.repeat(40),
  time: new Date(2024, 5, day, 10).getTime(),
  author: 'Ada',
  subject,
})

test('picking a day on the grid lists that day’s commits, and picking it again hides them', async () => {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { buildActivityYear } = await import('../model/activityYear')
  const { ActivityHeatmap } = await import('./ActivityHeatmap')
  const commits = [commit('b', 12, 'feat: add search'), commit('a', 10, 'fix: login')]
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(ActivityHeatmap, { year: buildActivityYear(commits, NOW), commits }),
    )
  })

  const day = host.querySelector<HTMLButtonElement>('[aria-label^="Wed, Jun 12, 2024: 1 commit"]')
  expect(day).not.toBeNull()
  expect(host.textContent).not.toContain('feat: add search')

  await act(async () => day?.click())
  expect(day?.getAttribute('aria-selected')).toBe('true')
  expect(host.textContent).toContain('feat: add search')
  expect(host.textContent).not.toContain('fix: login')

  await act(async () => day?.click())
  expect(host.textContent).not.toContain('feat: add search')

  // A day after today cannot be picked.
  const future = host.querySelector<HTMLButtonElement>('[aria-label^="Thu, Jun 13, 2024"]')
  expect(future?.disabled).toBe(true)

  await act(async () => root.unmount())
  host.remove()
})
