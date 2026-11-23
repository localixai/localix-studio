import { describe, expect, test } from 'bun:test'

import { RequiredMcpServersError } from '../../../mcp/client-manager-types'
import type { McpServerRecord } from '../../../mcp/repository'
import { withStorePages } from './mcp-tools'

const own = (name: string, projectId = ''): McpServerRecord =>
  ({ id: `row-${name}`, userId: 'u1', projectId, name }) as McpServerRecord

describe('a required server that did not start, and where it is fixed', () => {
  test('a server the person added has its Store page; any other has none', () => {
    const error = withStorePages(
      new RequiredMcpServersError([
        { server: 'mine', error: 'a' },
        { server: 'ours', error: 'b' },
        { server: 'from-a-file', error: 'c' },
      ]),
      [own('mine'), own('ours', 'p1')],
    )
    expect(error.failures.map((failure) => failure.storeId)).toEqual([
      'mine',
      'project:ours',
      undefined,
    ])
  })
})
