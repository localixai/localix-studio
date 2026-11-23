import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing/dom'
import type { AgentPrompt } from '@localixai/api/external-agent-contracts'

let teardown: () => Promise<void>

beforeAll(() => {
  teardown = registerDom()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  await teardown()
})

const TRUST: AgentPrompt = {
  kind: 'choice',
  question: ['Accessing workspace:', '', 'D:\\work\\shop', '', 'Security guide'],
  options: [
    { label: 'No, exit', selected: true },
    { label: 'Yes, I trust this folder', selected: false },
  ],
}

async function mount(prompt: AgentPrompt) {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { AgentPromptCard } = await import('./AgentPromptCard')
  const chosen: number[] = []
  const pressed: string[][] = []
  const opened: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(AgentPromptCard, {
        providerName: 'Claude Code',
        prompt,
        onChoose: async (index: number) => {
          chosen.push(index)
        },
        onKeys: async (keys: string[]) => {
          pressed.push(keys)
        },
        onOpenLink: (url: string) => opened.push(url),
      }),
    )
  })
  const button = (name: string) =>
    [...host.querySelectorAll('button')].find(
      (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent) === name,
    )
  const click = async (name: string) => act(async () => button(name)?.click())
  const unmount = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  return { host, button, click, chosen, pressed, opened, unmount }
}

test('the agent’s question reads in the chat, and an answer is a click', async () => {
  const view = await mount(TRUST)
  expect(view.host.textContent).toContain('Claude Code is asking')
  expect(view.host.textContent).toContain('D:\\work\\shop')
  // The answer Enter would give is marked, so "No, exit" is not chosen by surprise.
  expect(view.button('No, exit')?.getAttribute('aria-current')).toBe('true')
  expect(view.button('Yes, I trust this folder')?.getAttribute('aria-current')).toBeNull()

  await view.click('Yes, I trust this folder')
  expect(view.chosen).toEqual([1])

  await view.click('Cancel (Esc)')
  expect(view.pressed).toEqual([['escape']])
  await view.unmount()
})

test('a sign-in link is opened from the chat, and the code goes in the message box', async () => {
  const view = await mount({
    kind: 'text',
    question: ['Login', '', 'Paste code here if prompted >'],
    options: [],
    url: 'https://claude.com/cai/oauth/authorize?code=true',
  })
  await view.click('Open sign-in page')
  expect(view.opened).toEqual(['https://claude.com/cai/oauth/authorize?code=true'])
  expect(view.host.textContent).toContain('message box')
  await view.unmount()
})
