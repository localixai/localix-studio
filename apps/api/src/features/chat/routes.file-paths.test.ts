import { describe, expect, spyOn, test } from 'bun:test'
import { chmodSync } from 'node:fs'
import path from 'node:path'
import { tempDirPerTest } from '@localixai/testing'

import { localEnvironment } from '../agent-core/tools/environments/local'
import { createChatRoutes, type ChatRoutesService } from './routes'
import { readFile } from './service/file-ops'
import type { FileOpsContext } from './service/file-ops'
import type { SessionRecord } from './repository'

/**
 * The paths a reply names, read through the route a click in the chat calls
 * (`GET /sessions/:id/file`). A model writes `~/Desktop/logs.zip` and `logs/desktop.log`; the
 * first used to be joined to the project folder (`<project>/~/Desktop/logs.zip`), and every
 * failure answered the same `Cannot read <path>`, so the app could not tell "nothing there" from
 * a real failure and filed both as an error.
 *
 * A failed read is answered from its own error, so none of these starts a process (the unit tier
 * forbids it); a folder, which the read lists through a shell, is in the integration file.
 */

const root = tempDirPerTest('file-paths', {
  'home/Desktop/notes.txt': 'from home',
  'project/src/a.ts': 'export const a = 1\n',
})
const home = () => path.join(root(), 'home')
const project = () => path.join(root(), 'project')

/** The route's answer to `filePath`, asserting no process was started to give it. */
async function getWithoutShell(filePath: string) {
  const exec = spyOn(localEnvironment, 'exec')
  try {
    const res = await get(filePath)
    expect(exec).not.toHaveBeenCalled()
    return res
  } finally {
    exec.mockRestore()
  }
}

const get = (filePath: string) => {
  const ctx: FileOpsContext = {
    requireSession: async () => ({ id: 'session-a' }) as unknown as SessionRecord,
    resolveSessionWorkingDir: async () => project(),
    homeDir: home(),
  }
  const service = {
    readFile: (_userId: string, _sessionId: string, p: string, opts?: { full?: boolean }) =>
      readFile(ctx, 'u', 'session-a', p, opts),
  } as unknown as ChatRoutesService
  return createChatRoutes(service).request(
    new Request(`http://local/sessions/session-a/file?full=1&path=${encodeURIComponent(filePath)}`),
  )
}

describe('a path from a reply, read through the file route', () => {
  test('~/… is the home directory, never a folder inside the project', async () => {
    const res = await get('~/Desktop/notes.txt')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { path: string; content: string }
    expect(body.path).toBe(path.join(home(), 'Desktop/notes.txt'))
    expect(body.content).toBe('from home')
  })

  test('a relative path still resolves against the session folder', async () => {
    const res = await get('src/a.ts')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { path: string }).path).toBe(path.join(project(), 'src/a.ts'))
  })

  test('nothing at the path says so, naming the resolved path', async () => {
    const res = await getWithoutShell('logs/desktop.log')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('file_not_found')
    expect(body.error.message).toBe(
      `There is no file at ${path.join(project(), 'logs/desktop.log')}`,
    )
  })

  // Root reads every file whatever its mode, so the refusal cannot be staged there.
  test.skipIf(process.getuid?.() === 0)(
    'a file the app may not read is a refusal, not a missing file',
    async () => {
      const locked = path.join(project(), 'src/a.ts')
      chmodSync(locked, 0o000)
      try {
        const res = await getWithoutShell('src/a.ts')
        expect(res.status).toBe(403)
        const body = (await res.json()) as { error: { code: string; message: string } }
        expect(body.error.code).toBe('file_not_readable')
        expect(body.error.message).toBe(`Localix is not allowed to read ${locked}`)
      } finally {
        chmodSync(locked, 0o644)
      }
    },
  )
})
