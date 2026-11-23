import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import path from 'node:path'
import { tempDirPerTest } from '@localixai/testing'

import { localEnvironment } from '../../agent-core/tools/environments/local'
import type { SessionRecord } from '../repository'
import { fileReadFailure } from './file-read-failure'
import { readFile, type FileOpsContext } from './file-ops'

/**
 * Why a read failed is what the read itself said. It used to be thrown away and guessed again with
 * `access()`, which passes where macOS privacy control (Desktop, Documents) still refuses the open,
 * and which has no answer at all for an I/O error, too many open files or a cancelled read: all of
 * those came back as 404 "Cannot read <path>", with no cause and nothing logged.
 */

const dir = tempDirPerTest('read-failure', { 'notes.txt': 'hello', 'photo.jpg': 'jpeg bytes' })
const errno = (code: string, message = `${code}: failed`) =>
  Object.assign(new Error(message), { code })

const warn = spyOn(console, 'warn').mockImplementation(() => {})
afterEach(() => warn.mockClear())

describe('a failed read, classified by its own error', () => {
  test('a refusal the OS gave is a refusal, even where access() would pass', async () => {
    const file = path.join(dir(), 'notes.txt')
    const failure = await fileReadFailure(file, errno('EPERM', 'operation not permitted'))
    expect(failure.status).toBe(403)
    expect(failure.code).toBe('file_not_readable')
    expect(failure.message).toBe(`Localix is not allowed to read ${file}`)
  })

  test('nothing at the path is a missing file', async () => {
    const file = path.join(dir(), 'gone.txt')
    const failure = await fileReadFailure(file, errno('ENOENT'))
    expect(failure.status).toBe(404)
    expect(failure.code).toBe('file_not_found')
  })

  // The packaged app does not route the console into the API log, so the line goes to the
  // structured logger itself: one record naming the path and the cause, never the file's content.
  test('an I/O fault keeps its cause and is one structured line in the API log', async () => {
    const file = path.join(dir(), 'notes.txt')
    const records: Record<string, unknown>[] = []
    const failure = await fileReadFailure(file, errno('EIO', 'i/o error, read'), {
      error: (record) => void records.push(record),
    })
    expect(failure.status).toBe(500)
    expect(failure.code).toBe('file_unreadable')
    expect(failure.detail).toBe('EIO: i/o error, read')
    expect(records).toEqual([
      {
        event: 'file.read_failed',
        path: file,
        code: 'EIO',
        status: 500,
        detail: 'EIO: i/o error, read',
      },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  test('a missing or refused file is an answer, not a log line', async () => {
    const records: unknown[] = []
    const log = { error: (record: unknown) => void records.push(record) }
    await fileReadFailure(path.join(dir(), 'gone.txt'), errno('ENOENT'), log)
    await fileReadFailure(path.join(dir(), 'notes.txt'), errno('EACCES'), log)
    expect(records).toEqual([])
  })

  test('a path too long to open is the request, not the server', async () => {
    const failure = await fileReadFailure(path.join(dir(), 'x'), errno('ENAMETOOLONG'))
    expect(failure.status).toBe(422)
    expect(failure.code).toBe('file_unreadable')
  })

  test('a shell that failed without a code is asked again by opening the path', async () => {
    const file = path.join(dir(), 'gone.png')
    const failure = await fileReadFailure(file, { stderr: `sh: ${file}: No such file`, code: 1 })
    expect(failure.code).toBe('file_not_found')
  })
})

describe('a cancelled read', () => {
  test('a binary read cancelled mid-way is a cancellation, not a file problem', async () => {
    const controller = new AbortController()
    const exec = spyOn(localEnvironment, 'exec').mockImplementation(async () => {
      controller.abort()
      return { stdout: '', stderr: '', exitCode: 143 }
    })
    const ctx: FileOpsContext = {
      requireSession: async () => ({ id: 's' }) as unknown as SessionRecord,
      resolveSessionWorkingDir: async () => dir(),
    }
    try {
      const read = readFile(ctx, 'u', 's', 'photo.png', { signal: controller.signal })
      await expect(read).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      exec.mockRestore()
    }
  })

  test('a read the shell could not finish is logged through the session logger', async () => {
    const records: Record<string, unknown>[] = []
    const exec = spyOn(localEnvironment, 'exec').mockResolvedValue({
      stdout: '',
      stderr: 'base64: write error',
      exitCode: 1,
    })
    const ctx: FileOpsContext = {
      requireSession: async () => ({ id: 's' }) as unknown as SessionRecord,
      resolveSessionWorkingDir: async () => dir(),
      logger: { error: (record) => void records.push(record) },
    }
    try {
      await expect(readFile(ctx, 'u', 's', 'photo.jpg')).rejects.toMatchObject({ status: 500 })
      expect(records).toEqual([
        {
          event: 'file.read_failed',
          path: path.join(dir(), 'photo.jpg'),
          code: null,
          status: 500,
          detail: 'base64: write error',
        },
      ])
    } finally {
      exec.mockRestore()
    }
  })
})
