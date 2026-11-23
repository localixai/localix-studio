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

test('the three window buttons close, minimize and maximize the window, in that order', async () => {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { WindowControls } = await import('./WindowControls')
  const calls: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(WindowControls, {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          calls.push(`${command}:${String(args?.action)}`)
          return undefined
        },
      }),
    )
  })
  const buttons = [...host.querySelectorAll('button')]
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Close window',
    'Minimize window',
    'Maximize window',
  ])
  for (const button of buttons) await act(async () => button.click())
  expect(calls).toEqual([
    'window_control:close',
    'window_control:minimize',
    'window_control:toggle_maximize',
  ])
  // The buttons are never part of the drag strip, or a press would drag instead of click.
  expect(host.firstElementChild?.getAttribute('data-tauri-drag-region')).toBe('false')
  await act(async () => root.unmount())
  host.remove()
})
