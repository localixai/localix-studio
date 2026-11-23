import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing/dom'
import type { LocalModelChoice } from '../model/localModel'

let teardown: () => Promise<void>

beforeAll(() => {
  teardown = registerDom()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  await teardown()
})

async function mount(choice: LocalModelChoice | null) {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { PlanProjectButton } = await import('./PlanProjectButton')
  const started: LocalModelChoice[] = []
  const asked: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(PlanProjectButton, {
        check: async () => choice,
        start: async (picked: LocalModelChoice) => {
          started.push(picked)
        },
        onDownloadModel: () => asked.push('download'),
        onConnectServer: () => asked.push('server'),
      }),
    )
  })
  const button = () =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Plan your project')
  const byText = (text: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text))
  return {
    act,
    started,
    asked,
    button,
    byText,
    cleanup: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

test('with a local model connected, planning starts at once and nothing asks first', async () => {
  const view = await mount({ connectionId: 'c-local', modelId: 'gemma:Q4' })
  await view.act(async () => view.button()?.click())
  expect(view.started).toEqual([{ connectionId: 'c-local', modelId: 'gemma:Q4' }])
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await view.cleanup()
})

test('with no local model, a popup asks to connect one, and planning does not start', async () => {
  const view = await mount(null)
  await view.act(async () => view.button()?.click())
  expect(view.started).toEqual([])
  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain('Connect a local model')
  await view.act(async () => view.byText('Download a model')?.click())
  expect(view.asked).toEqual(['download'])
  await view.cleanup()
})
