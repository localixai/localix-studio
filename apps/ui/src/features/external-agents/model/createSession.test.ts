import { expect, mock, spyOn, test } from 'bun:test'
import { registerInspectorHandler } from '@/shared/lib/inspectorBus'
import { terminal as terminalBus } from '@/shared/lib/terminalBus'
import { externalAgentsApi } from '../api'
import { openOwnedExternalSession } from './createSession'

test('opening our external session shows the agent as a chat in that chat, not its terminal', async () => {
  const open = spyOn(externalAgentsApi, 'openOwned').mockResolvedValue({
    terminalId: 'pty',
    providerName: 'Claude Code',
  })
  const requests: unknown[] = []
  const unhandle = registerInspectorHandler((request) => {
    requests.push(request)
  })
  const reveal = mock((_sessionId: string, _terminalId: string, _title: string) => {})
  const unregister = terminalBus.setOwnedOpener(reveal)
  try {
    await openOwnedExternalSession('owner')
    expect(open).toHaveBeenCalledWith('owner')
    expect(requests).toEqual([
      {
        kind: 'work-item',
        workKind: 'external-agent-chat',
        id: 'external-agent-chat:owner',
        title: 'Claude Code',
        scope: 'owner',
        payload: { sessionId: 'owner', terminalId: 'pty', providerName: 'Claude Code' },
      },
    ])
    // The terminal keeps running behind the chat view; it is shown only when asked for.
    expect(reveal).not.toHaveBeenCalled()
  } finally {
    open.mockRestore()
    unhandle()
    unregister()
  }
})
