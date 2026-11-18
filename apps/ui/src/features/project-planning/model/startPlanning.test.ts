import { expect, spyOn, test } from 'bun:test'
import { backendClient } from '@/shared/api/client'
import { composerBus } from '@/shared/lib/composerBus'
import { subscribeModelPicker } from '@/shared/lib/modelPickerBus'
import { PLAN_KICKOFF, PLANNING_TOOLS } from './planPrompt'
import { startPlanning } from './startPlanning'
import { endPlanFlow, readPlanFlow } from './planFlow'

test('behind a model server, the kickoff waits in the message box while the picker opens', async () => {
  const inserted: unknown[] = []
  const insert = spyOn(composerBus, 'insert').mockImplementation((request) => {
    inserted.push(request)
  })
  const pickers: unknown[] = []
  const unsubscribe = subscribeModelPicker((request) => pickers.push(request))
  const update = spyOn(backendClient, 'updateSession').mockResolvedValue({ id: 'chat-1' } as never)
  try {
    await startPlanning('chat-1', { connectionId: 'c-ollama', modelId: null })
    expect(inserted).toEqual([
      { sessionId: 'chat-1', text: PLAN_KICKOFF, replace: true, focus: true },
    ])
    expect(pickers).toEqual([{ sessionId: 'chat-1' }])
    // Plan mode (no code) and the board and Project Space tools, before anything is sent.
    expect(update).toHaveBeenCalledWith('chat-1', {
      permissionMode: 'plan',
      activateTools: [...PLANNING_TOOLS],
    })
    // The steps after the written plan (draw, board, approve) are asked one at a time.
    expect(readPlanFlow('chat-1')).toEqual({ step: 'outline', since: 0 })
  } finally {
    endPlanFlow('chat-1')
    insert.mockRestore()
    update.mockRestore()
    unsubscribe()
  }
})

test('a downloaded model is routed to before the kickoff is sent', async () => {
  const update = spyOn(backendClient, 'updateSession').mockRejectedValue(new Error('offline'))
  try {
    await expect(
      startPlanning('chat-1', { connectionId: 'c-local', modelId: 'gemma:Q4' }),
    ).rejects.toThrow('offline')
    expect(update).toHaveBeenCalledWith('chat-1', {
      route: { providerConnectionId: 'c-local', modelId: 'gemma:Q4' },
      permissionMode: 'plan',
      activateTools: [...PLANNING_TOOLS],
    })
  } finally {
    update.mockRestore()
  }
})

test('a model in Ollama with Local not yet connected: Local is added, then the chat routed to it', async () => {
  const create = spyOn(backendClient, 'createConnection').mockResolvedValue({
    id: 'c-new-local',
  } as never)
  const update = spyOn(backendClient, 'updateSession').mockRejectedValue(new Error('stop here'))
  try {
    await expect(
      startPlanning('chat-1', { connectionId: null, modelId: 'gemma4:e4b-it-qat' }),
    ).rejects.toThrow('stop here')
    expect(create).toHaveBeenCalledWith({
      providerId: 'local',
      providerName: 'Local',
      label: 'Local',
      apiKey: 'local',
    })
    expect(update).toHaveBeenCalledWith('chat-1', {
      route: { providerConnectionId: 'c-new-local', modelId: 'gemma4:e4b-it-qat' },
      permissionMode: 'plan',
      activateTools: [...PLANNING_TOOLS],
    })
  } finally {
    create.mockRestore()
    update.mockRestore()
  }
})
