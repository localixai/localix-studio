import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { tempDirPerTest } from '@localixai/testing'

import { createChatRoutes, type ChatRoutesService } from './routes'
import { readFile } from './service/file-ops'
import type { FileOpsContext } from './service/file-ops'
import type { SessionRecord } from './repository'

/**
 * A folder named in a reply, read through the file route. The read lists it through a shell
 * (`tryListDirectory`), which puts this case in the integration tier. The answer used to be the
 * listing WITH a hash, so the editor took it for a text file it could edit and save over the folder.
 */

const project = tempDirPerTest('file-paths-folder', { 'docs/guide.md': '# Guide\n' })

const get = (filePath: string) => {
  const ctx: FileOpsContext = {
    requireSession: async () => ({ id: 'session-a' }) as unknown as SessionRecord,
    resolveSessionWorkingDir: async () => project(),
  }
  const service = {
    readFile: (_userId: string, _sessionId: string, p: string, opts?: { full?: boolean }) =>
      readFile(ctx, 'u', 'session-a', p, opts),
  } as unknown as ChatRoutesService
  return createChatRoutes(service).request(
    new Request(`http://local/sessions/session-a/file?full=1&path=${encodeURIComponent(filePath)}`),
  )
}

describe('a folder at the path', () => {
  test('answers as a folder, never as an editable text file', async () => {
    const res = await get('docs')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { path: string; directory?: boolean; hash?: string }
    expect(body.path).toBe(path.join(project(), 'docs'))
    expect(body.directory).toBe(true)
    expect(body.hash).toBeUndefined()
  })
})
