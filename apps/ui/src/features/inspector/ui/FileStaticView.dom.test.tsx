import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing/dom'
import { REVEAL_IN_OS_LABEL } from '@localixai/kit/environment'
import { backendClient } from '@/shared/api/client'
import { storeApi } from '@/shared/api/store-client'
import { turns } from '@/testing/settle'
import type { FileLoadState } from './fileLoadState'

/**
 * What a file tab shows for a path the editor cannot open as text, as a person meets it after
 * clicking a path in a reply: nothing there, a folder, a binary such as a `.zip`.
 */

let teardown: () => Promise<void>
beforeAll(() => {
  teardown = registerDom()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterAll(async () => teardown())

type Ready = Extract<FileLoadState, { status: 'ready' }>
const ready = (over: Partial<Ready>): Ready => ({
  status: 'ready',
  content: '',
  truncated: false,
  absPath: '/workspace/x',
  editable: false,
  directory: false,
  special: false,
  ...over,
})

let unmount: (() => Promise<void>) | null = null
afterEach(async () => {
  await unmount?.()
  unmount = null
  document.body.innerHTML = ''
})

async function render(node: React.ReactNode) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(node)
    await turns()
  })
  unmount = () => act(async () => root.unmount())
  return {
    rerender: (next: React.ReactNode) =>
      act(async () => {
        root.render(next)
        await turns()
      }),
    click: (label: string) =>
      act(async () => {
        const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label)
        if (!button) throw new Error(`no button "${label}"`)
        button.click()
        await turns()
      }),
    text: () => host.textContent ?? '',
    buttons: () => [...host.querySelectorAll('button')].map((b) => b.textContent),
  }
}

describe('a path the editor cannot open as text', () => {
  test('a folder is shown as a folder and can be revealed in the file manager', async () => {
    const reveal = spyOn(backendClient, 'revealFileEntry').mockResolvedValue({ opened: true })
    try {
      const { FileStaticView } = await import('./FileStaticView')
      const view = await render(
        <FileStaticView
          sessionId="session-a"
          path="docs"
          state={ready({ absPath: '/workspace/docs', directory: true, content: 'Directory …' })}
        />,
      )
      expect(view.text()).toContain('This is a folder.')
      expect(view.text()).not.toContain('Directory …')
      await view.click(REVEAL_IN_OS_LABEL)
      expect(reveal).toHaveBeenCalledWith('session-a', '/workspace/docs')
    } finally {
      reveal.mockRestore()
    }
  })

  test('a FIFO, socket or device says what it is and offers the file manager', async () => {
    const reveal = spyOn(backendClient, 'revealFileEntry').mockResolvedValue({ opened: true })
    try {
      const { FileStaticView } = await import('./FileStaticView')
      const view = await render(
        <FileStaticView
          sessionId="session-a"
          path="events.pipe"
          state={ready({ absPath: '/workspace/events.pipe', special: true })}
        />,
      )
      expect(view.text()).toContain('This is not a regular file.')
      expect(view.text()).not.toContain('Empty file')
      await view.click(REVEAL_IN_OS_LABEL)
      expect(reveal).toHaveBeenCalledWith('session-a', '/workspace/events.pipe')
    } finally {
      reveal.mockRestore()
    }
  })

  test('a binary file offers the file manager instead of garbled text', async () => {
    const reveal = spyOn(backendClient, 'revealFileEntry').mockResolvedValue({ opened: true })
    const openers = spyOn(storeApi, 'openers').mockResolvedValue({ listings: [] })
    try {
      const { FileStaticView } = await import('./FileStaticView')
      const view = await render(
        <FileStaticView
          sessionId="session-a"
          path="~/Desktop/logs.zip"
          state={ready({ absPath: '/home/me/Desktop/logs.zip', content: 'PK\u0003\u0004\u0000' })}
        />,
      )
      expect(view.text()).toContain('Binary file — preview not supported.')
      await view.click(REVEAL_IN_OS_LABEL)
      expect(reveal).toHaveBeenCalledWith('session-a', '/home/me/Desktop/logs.zip')
    } finally {
      reveal.mockRestore()
      openers.mockRestore()
    }
  })

  test('nothing at the path is one plain sentence, with nothing to retry or send', async () => {
    const { FileMissingNotice } = await import('./FileLoadNotice')
    const checks: number[] = []
    const notice = (revealAt: number) => (
      <FileMissingNotice
        path="logs/desktop.log"
        message="There is no file at /workspace/logs/desktop.log"
        revealAt={revealAt}
        onRecheck={() => checks.push(revealAt)}
      />
    )
    const view = await render(notice(1))
    expect(view.text()).toContain('There is no file at /workspace/logs/desktop.log')
    expect(view.buttons()).toEqual([])
    expect(checks).toEqual([])
    // Clicking the link again looks again: the file may exist by now.
    await view.rerender(notice(2))
    expect(checks).toEqual([2])
  })
})
