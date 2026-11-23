import { afterEach, describe, expect, test } from 'bun:test'
import { closeSync, constants, openSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { runSync, tempDirPerTest } from '@localixai/testing'

import { createChatRoutes, type ChatRoutesService } from './routes'
import { readFile } from './service/file-ops'
import type { FileOpsContext } from './service/file-ops'
import type { SessionRecord } from './repository'

/**
 * A FIFO named in a reply, opened through the file route. Opening a FIFO for reading waits for a
 * writer that never comes, so the read used to hold the request (and a worker of the API) forever.
 * It is answered from its stat now, and never opened. Integration tier: `mkfifo` is a child
 * process, and the socket is a real listening server.
 */

const project = tempDirPerTest('special-files')
const fifo = () => path.join(project(), 'events.pipe')

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

// A read left blocked on the FIFO (the red run) is released here: a writer that opens and closes
// gives it end-of-file, so a failing test ends instead of keeping the process alive.
afterEach(() => {
  try {
    closeSync(openSync(fifo(), constants.O_WRONLY | constants.O_NONBLOCK))
  } catch {
    // ENXIO: no reader is waiting, which is the passing case. ENOENT: the test made none.
  }
})

describe('a FIFO at the path', () => {
  test(
    'is answered as a special file without opening it',
    async () => {
      expect(runSync('mkfifo', [fifo()]).code).toBe(0)
      const res = await get('events.pipe')
      expect(res.status).toBe(200)
      const body = (await res.json()) as { special?: boolean; content: string; hash?: string }
      expect(body.special).toBe(true)
      expect(body.content).toBe('')
      expect(body.hash).toBeUndefined()
    },
    // The deadline: a read that blocks fails the test here instead of hanging the run.
    5_000,
  )

  // A socket is neither a file nor a folder: reading it is refused by the OS, and the read was
  // filed as an error. The name is short: a Unix socket path is limited to 104 bytes on macOS.
  test('a socket is a special file, answered from its stat, never read', async () => {
    const socket = path.join(project(), 's')
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(socket, resolve))
    try {
      const res = await get('s')
      expect(res.status).toBe(200)
      const body = (await res.json()) as { special?: boolean; content: string; hash?: string }
      expect(body.special).toBe(true)
      expect(body.content).toBe('')
      expect(body.hash).toBeUndefined()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
