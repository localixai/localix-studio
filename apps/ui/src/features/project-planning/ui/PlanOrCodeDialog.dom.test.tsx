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

async function mount() {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { PlanOrCodeDialog } = await import('./PlanOrCodeDialog')
  const chosen: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(PlanOrCodeDialog, {
        open: true,
        onPlan: () => chosen.push('plan'),
        onCode: () => chosen.push('code'),
        onCancel: () => chosen.push('cancel'),
      }),
    )
  })
  const button = (text: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text))
  return { act, chosen, button, root, host }
}

test('the first message asks to plan or to code, and each choice is reported', async () => {
  const view = await mount()
  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain('Plan or code?')
  expect(dialog?.textContent).toMatch(/never changes code/i)
  await view.act(async () => view.button('Plan')?.click())
  await view.act(async () => view.button('Code')?.click())
  expect(view.chosen).toEqual(['plan', 'code'])
  await view.act(async () => view.root.unmount())
  view.host.remove()
})
