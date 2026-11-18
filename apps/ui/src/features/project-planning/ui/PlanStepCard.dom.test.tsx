import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing/dom'
import type { PlanCard } from '../model/planFlow'

let teardown: () => Promise<void>

beforeAll(() => {
  teardown = registerDom()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  await teardown()
})

async function mount(card: PlanCard) {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { PlanStepCard } = await import('./PlanStepCard')
  const pressed: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(PlanStepCard, {
        card,
        onYes: () => pressed.push('yes'),
        onLater: () => pressed.push('later'),
      }),
    )
  })
  const press = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === label,
    )
    if (!button) throw new Error(`no button "${label}" in: ${host.textContent}`)
    await act(async () => button.click())
  }
  const unmount = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  return { host, pressed, press, unmount }
}

test('the written plan asks before Project Space opens and draws it', async () => {
  const card = await mount('draw')
  expect(card.host.textContent).toContain('Draw this plan in Project Space?')
  await card.press('Open and draw')
  await card.press('Keep talking')
  expect(card.pressed).toEqual(['yes', 'later'])
  await card.unmount()
})

test('the drawn map asks before the board opens and fills', async () => {
  const card = await mount('board')
  expect(card.host.textContent).toContain('Put the tasks on the Kanban board?')
  await card.press('Open board and add tasks')
  expect(card.pressed).toEqual(['yes'])
  await card.unmount()
})

test('a step the model skipped says so and offers it again', async () => {
  const card = await mount('refill')
  expect(card.host.textContent).toContain('No tasks were added')
  await card.press('Try again')
  expect(card.pressed).toEqual(['yes'])
  await card.unmount()
})

test('nothing starts until the person approves the plan', async () => {
  const card = await mount('approve')
  expect(card.host.textContent).toContain('Approve the plan?')
  await card.press('Change something')
  await card.press('Approve and start')
  expect(card.pressed).toEqual(['later', 'yes'])
  await card.unmount()
})
