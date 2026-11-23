import { open } from 'node:fs/promises'

import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnprocessableError,
  type DomainError,
} from '../../../lib/domain-errors'

const MISSING = new Set(['ENOENT', 'ENOTDIR'])
const REFUSED = new Set(['EACCES', 'EPERM'])
/** Faults of the path the request named rather than of the machine. */
const BAD_PATH = new Set(['ENAMETOOLONG', 'ELOOP', 'EINVAL'])

const errnoOf = (cause: unknown): { code: string; message: string } | null => {
  if (!cause || typeof cause !== 'object') return null
  const code = (cause as { code?: unknown }).code
  if (typeof code !== 'string') return null
  const message = (cause as { message?: unknown }).message
  return { code, message: typeof message === 'string' && message ? message : code }
}

/** The shell's own words, when the failure came from one (the binary branch's `wc` and `base64`). */
const stderrOf = (cause: unknown): string | undefined => {
  const stderr = (cause as { stderr?: unknown } | null)?.stderr
  return typeof stderr === 'string' && stderr.trim() ? stderr.trim() : undefined
}

/**
 * The cause when the read did not name one: open the path, exactly as the read would have. Not
 * `access()`, which passes where macOS privacy control (Desktop, Documents, Downloads) still
 * refuses the open. Special files never reach here (`isSpecialFile` answered them first).
 */
async function probe(resolved: string): Promise<{ code: string; message: string } | null> {
  try {
    await (await open(resolved, 'r')).close()
    return null
  } catch (error) {
    return errnoOf(error)
  }
}

/** The API's structured log (pino in the API); a test hands in anything with `error`. */
export interface FileReadLog {
  error?: (record: Record<string, unknown>) => void
}

/**
 * Why a session file could not be read, in the words the person needs, from what the read said.
 *
 * Nothing there is `file_not_found`, a routine answer the UI shows quietly. A refusal by the OS is
 * a 403 that says so. Anything else is a real fault: it keeps its code and message in `detail`,
 * is one structured line in the API log (`file.read_failed`: path, code, status and the error's
 * own words, never the file's content), and is never passed off as a missing file. The line goes
 * to the logger itself: the packaged app does not route the console into `api.log`. The caller checks its abort signal first: a cancelled read is not the file's fault.
 */
export async function fileReadFailure(
  resolved: string,
  /** What the failed read left behind: a Node error with its `code`, or a shell's `stderr`. */
  cause: unknown,
  log?: FileReadLog,
): Promise<DomainError> {
  const errno = errnoOf(cause) ?? (await probe(resolved))
  if (errno && MISSING.has(errno.code)) {
    return new NotFoundError('file_not_found', `There is no file at ${resolved}`)
  }
  if (errno && REFUSED.has(errno.code)) {
    return new ForbiddenError('file_not_readable', `Localix is not allowed to read ${resolved}`)
  }
  // Node's own messages already start with their code (`EIO: i/o error, read`).
  const detail = errno
    ? errno.message.startsWith(`${errno.code}:`)
      ? errno.message
      : `${errno.code}: ${errno.message}`
    : (stderrOf(cause) ?? String(cause))
  const failure =
    errno && BAD_PATH.has(errno.code)
      ? new UnprocessableError('file_unreadable', `Cannot read ${resolved}`, detail)
      : new InternalError('file_unreadable', `Cannot read ${resolved}`, detail)
  const record = {
    event: 'file.read_failed',
    path: resolved,
    code: errno?.code ?? null,
    status: failure.status,
    detail,
  }
  // Called as a method: pino reads its logger off `this`. A host with no logger still gets one
  // line, as a string, rather than nothing.
  if (log?.error) log.error(record)
  else console.warn(`[files] ${JSON.stringify(record)}`)
  return failure
}
