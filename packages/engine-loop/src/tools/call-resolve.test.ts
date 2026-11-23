import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import type { AgentTool } from '@localixai/agent/agents'

import { resolveCall, toRunTool, type CallEnvironment } from './call'

const board = toRunTool({
  name: 'kanban',
  description: 'The board',
  inputSchema: z.object({ action: z.string(), title: z.string().optional() }),
  execute: async () => ({ content: [] }),
} as unknown as AgentTool)

const env = {
  tools: new Map([['kanban', board]]),
  naming: { internal: (name: string) => name },
} as unknown as CallEnvironment

const call = (name: string, args: object) => ({
  id: 'c1',
  name,
  arguments: JSON.stringify(args),
})

describe('resolveCall', () => {
  test('a small model gluing the action onto the tool name still reaches the tool', () => {
    const resolved = resolveCall(
      env,
      call('kanban.create', { action: 'create', title: 'Login' }) as never,
    )
    expect(resolved.kind).toBe('parsed')
    expect(resolved.call.name).toBe('kanban')
  })

  test('a name that is not a tool, even with a dot, is still not found', () => {
    const resolved = resolveCall(env, call('board.create', { action: 'create' }) as never)
    expect(resolved.kind).toBe('settled')
    expect(JSON.stringify(resolved)).toContain('Tool board.create not found')
  })
})
