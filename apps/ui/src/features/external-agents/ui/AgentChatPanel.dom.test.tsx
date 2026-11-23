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
  const { AgentChatPanel } = await import('./AgentChatPanel')
  const sent: string[] = []
  let terminals = 0
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(AgentChatPanel, {
        providerName: 'Claude Code',
        transcript: React.createElement('p', null, 'Yo. What we build?'),
        onSend: async (text: string) => {
          sent.push(text)
        },
        onShowTerminal: () => {
          terminals++
        },
      }),
    )
  })
  const box = host.querySelector('textarea') as HTMLTextAreaElement
  const type = async (value: string) =>
    act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
      descriptor?.set?.call(box, value)
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const key = async (init: KeyboardEventInit) =>
    act(async () => {
      box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
    })
  return { host, box, sent, terminals: () => terminals, type, key, act, root }
}

test("the agent's turns read as a chat and Enter sends the message to the agent", async () => {
  const view = await mount()
  expect(view.host.textContent).toContain('Yo. What we build?')
  expect(view.box.getAttribute('aria-label')).toBe('Message Claude Code')

  await view.type('add a login page')
  await view.key({ key: 'Enter', shiftKey: true })
  expect(view.sent).toEqual([])

  await view.key({ key: 'Enter' })
  expect(view.sent).toEqual(['add a login page'])
  expect(view.box.value).toBe('')

  // Whitespace alone sends nothing.
  await view.type('   ')
  await view.key({ key: 'Enter' })
  expect(view.sent).toEqual(['add a login page'])

  const terminal = [...view.host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Show terminal',
  )
  await view.act(async () => terminal?.click())
  expect(view.terminals()).toBe(1)
  await view.act(async () => view.root.unmount())
  view.host.remove()
})

test('while the agent waits on a question, a message is held: its Enter would answer the question', async () => {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { AgentChatPanel } = await import('./AgentChatPanel')
  const sent: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(AgentChatPanel, {
        providerName: 'Claude Code',
        transcript: null,
        prompt: React.createElement('p', null, 'Do you trust this folder?'),
        held: 'Answer Claude Code’s question first.',
        onSend: async (text: string) => {
          sent.push(text)
        },
        onShowTerminal: () => {},
      }),
    )
  })
  expect(host.textContent).toContain('Do you trust this folder?')
  expect(host.textContent).toContain('Answer Claude Code’s question first.')
  const box = host.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, 'hi')
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  })
  expect(sent).toEqual([])
  await act(async () => root.unmount())
  host.remove()
})

test('while the agent answers, Stop takes Send’s place and ends the turn', async () => {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { AgentChatPanel } = await import('./AgentChatPanel')
  let stops = 0
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(AgentChatPanel, {
        providerName: 'Claude Code',
        transcript: null,
        busy: true,
        onStop: async () => {
          stops++
        },
        onSend: async () => {},
        onShowTerminal: () => {},
      }),
    )
  })
  const buttons = [...host.querySelectorAll('button')].map((button) => button.textContent)
  expect(buttons).toContain('Stop')
  expect(buttons).not.toContain('Send')
  await act(async () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Stop')?.click(),
  )
  expect(stops).toBe(1)
  await act(async () => root.unmount())
  host.remove()
})
