import { open, stat } from 'node:fs/promises'
import { BINARY_SNIFF_LENGTH, hasBinarySignature } from '@localixai/mini-app-sdk/backend'

import type { FileContentResponse } from '../contracts'

/** What a capped read appends, so the viewer and a mini app both see where the text stops. */
export const TRUNCATED_MARKER = '\n[…truncated…]'

/**
 * A path that is neither a regular file nor a folder: a FIFO, a socket, a device. Never opened —
 * opening a FIFO for reading waits for a writer that may never come, which held the request and a
 * worker of the API forever, and a socket or device has no content to show. Answered from the stat
 * alone. A path that cannot be stat'ed is not special: the read that follows says why.
 */
export async function isSpecialFile(resolved: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const info = await stat(resolved)
    return !info.isFile() && !info.isDirectory()
  } catch {
    return false
  } finally {
    signal?.throwIfAborted()
  }
}

/** The first `length` bytes of a file (fewer when it is shorter), without reading the rest. */
async function readFileHead(file: string, length: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(length)
    let filled = 0
    while (filled < length) {
      const { bytesRead } = await handle.read(buffer, filled, length - filled, filled)
      if (bytesRead === 0) break
      filled += bytesRead
      signal?.throwIfAborted()
    }
    return buffer.subarray(0, filled)
  } finally {
    await handle.close()
  }
}

/**
 * A regular file larger than the read cap, answered from its head alone.
 *
 * The cap used to bound only what was SENT: the whole file was read into memory first, so a large
 * log cost its full size to show its first megabytes, and a file past what one read can hold (a
 * multi-gigabyte `.zip`) failed outright and was filed as an error. Now the cap bounds what comes
 * off disk. A binary is told apart by the shared sniff (a NUL in the first few kilobytes, git's
 * rule, the one the viewer and the agent's `read` use) and answers only that head: the viewer shows
 * its binary notice from it, and nobody needs megabytes of undecodable bytes. A text file answers
 * the capped head, as before. Either way the answer is `truncated`, with no hash, so it can never
 * be saved back, and `bytes` is the file's real size.
 */
export async function readPastCap(
  resolved: string,
  bytes: number,
  cap: number,
  signal?: AbortSignal,
): Promise<FileContentResponse> {
  const sniff = await readFileHead(resolved, Math.min(cap, BINARY_SNIFF_LENGTH), signal)
  const head = hasBinarySignature(sniff) ? sniff : await readFileHead(resolved, cap, signal)
  return {
    path: resolved,
    content: `${head.toString('utf8')}${TRUNCATED_MARKER}`,
    bytes,
    truncated: true,
  }
}
