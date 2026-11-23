import { describe, expect, spyOn, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { tempDirPerTest } from '@localixai/testing'

import { localEnvironment } from '../agent-core/tools/environments/local'
import { createChatRoutes, type ChatRoutesService } from './routes'
import { readFile } from './service/file-ops'
import type { FileOpsContext } from './service/file-ops'
import type { SessionRecord } from './repository'

/**
 * A big file opened from a reply or the tree, read through the file route. The read used to pull
 * the WHOLE file into memory and only then cut it to the editor's cap: a multi-gigabyte `.zip`
 * failed outright ("Cannot read …", filed as an error), and a large log was read in full to show
 * its first megabytes. The cap now bounds what is read from disk, not only what is sent.
 *
 * The caps are small here (the context takes them), so "past the cap" needs kilobytes, not a
 * multi-gigabyte file that a filesystem without sparse files would have to write out.
 */

const CAPS = { view: 4_000, edit: 20_000 }
const project = tempDirPerTest('file-size')

const get = (filePath: string, full = true) => {
  const ctx: FileOpsContext = {
    requireSession: async () => ({ id: 'session-a' }) as unknown as SessionRecord,
    resolveSessionWorkingDir: async () => project(),
    readCaps: CAPS,
  }
  const service = {
    readFile: (_userId: string, _sessionId: string, p: string, opts?: { full?: boolean }) =>
      readFile(ctx, 'u', 'session-a', p, opts),
  } as unknown as ChatRoutesService
  const query = `${full ? 'full=1&' : ''}path=${encodeURIComponent(filePath)}`
  return createChatRoutes(service).request(
    new Request(`http://local/sessions/session-a/file?${query}`),
  )
}

type Body = { content: string; bytes: number; truncated: boolean; hash?: string }

/** The route's answer, and whether the whole file was ever pulled into memory to give it. */
async function readWatched(filePath: string, full: boolean) {
  const wholeReads = spyOn(localEnvironment, 'readFile')
  try {
    const res = await get(filePath, full)
    expect(res.status).toBe(200)
    return { body: (await res.json()) as Body, wholeReads: wholeReads.mock.calls.length }
  } finally {
    wholeReads.mockRestore()
  }
}

describe('a file past the read cap', () => {
  test('a binary is shown as a binary from its first bytes, never read whole', async () => {
    writeFileSync(path.join(project(), 'logs.zip'), Buffer.alloc(50_000))
    const { body, wholeReads } = await readWatched('logs.zip', true)
    expect(wholeReads).toBe(0)
    expect(body.bytes).toBe(50_000)
    expect(body.truncated).toBe(true)
    expect(body.hash).toBeUndefined()
    // What the viewer recognises a binary by: a NUL near the start.
    expect(body.content.slice(0, 16)).toContain('\u0000')
    // The sniffed head only, not the cap's worth of undecodable bytes.
    expect(body.content.length).toBeLessThan(CAPS.edit)
  })

  test('a large text file is read only up to the cap and says it is truncated', async () => {
    const line = 'INFO request served in 12 ms\n'
    const log = line.repeat(Math.ceil(10_000 / line.length))
    writeFileSync(path.join(project(), 'desktop.log'), log)
    const { body, wholeReads } = await readWatched('desktop.log', false)
    expect(wholeReads).toBe(0)
    expect(body.truncated).toBe(true)
    expect(body.bytes).toBe(Buffer.byteLength(log))
    expect(body.hash).toBeUndefined()
    expect(body.content).toBe(`${log.slice(0, CAPS.view)}\n[…truncated…]`)
  })

  test('a file within the cap is still read whole, with its edit hash', async () => {
    writeFileSync(path.join(project(), 'small.ts'), 'export const a = 1\n')
    const body = (await (await get('small.ts')).json()) as Body
    expect(body.truncated).toBe(false)
    expect(body.content).toBe('export const a = 1\n')
    expect(body.hash).toBeString()
  })
})
