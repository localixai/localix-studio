import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing/dom'
import type { AgentAccount } from '@localixai/api/external-agent-contracts'

let teardown: () => Promise<void>

beforeAll(() => {
  teardown = registerDom()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  await teardown()
})

async function mount(account: AgentAccount) {
  const React = await import('react')
  const { act } = React
  const { createRoot } = await import('react-dom/client')
  const { AgentAccountBar } = await import('./AgentAccountBar')
  const calls: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(AgentAccountBar, {
        account,
        onLogin: async () => {
          calls.push('login')
        },
        onLogout: async () => {
          calls.push('logout')
        },
      }),
    )
  })
  const click = async (name: string) =>
    act(async () =>
      [...host.querySelectorAll('button')].find((button) => button.textContent === name)?.click(),
    )
  const unmount = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  return { host, click, calls, unmount }
}

test('a signed-in agent says who it is signed in as, and signs out from the chat', async () => {
  const view = await mount({ loggedIn: true, email: 'me@example.com', plan: 'pro' })
  expect(view.host.textContent).toContain('me@example.com')
  expect(view.host.textContent).toContain('Pro')
  await view.click('Log out')
  expect(view.calls).toEqual(['logout'])
  await view.unmount()
})

test('a signed-out agent offers to sign in', async () => {
  const view = await mount({ loggedIn: false })
  expect(view.host.textContent).toContain('Not signed in')
  await view.click('Log in')
  expect(view.calls).toEqual(['login'])
  await view.unmount()
})
