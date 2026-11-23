import { expect, test } from 'bun:test'

import { agentMcpServers } from './agent-mcp-servers'

test('offers the board’s MCP endpoint when it answers, scoped to the chat', async () => {
  const asked: string[] = []
  const servers = await agentMcpServers('http://127.0.0.1:5051', 'chat 1', async (input) => {
    asked.push(String(input))
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 0, result: {} }), { status: 200 })
  })
  expect(asked).toEqual(['http://127.0.0.1:5051/rpc/kanban/mcp?sessionId=chat%201'])
  expect(servers).toEqual({
    'localix-board': {
      type: 'http',
      url: 'http://127.0.0.1:5051/rpc/kanban/mcp?sessionId=chat%201',
    },
  })
})

test('offers nothing when the board is not installed or does not answer', async () => {
  expect(
    await agentMcpServers('http://x', 'c', async () => new Response('nope', { status: 404 })),
  ).toEqual({})
  expect(
    await agentMcpServers('http://x', 'c', async () => {
      throw new Error('refused')
    }),
  ).toEqual({})
})
