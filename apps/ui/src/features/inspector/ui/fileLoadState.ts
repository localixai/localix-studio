import { looksBinary } from '@/shared/lib/looksBinary'
import { isMarkdown } from './fileTabHelpers'
import type { FileContentResponse } from '@/shared/api/contracts'

type ReadyState = {
  status: 'ready'
  content: string
  truncated: boolean
  mimeType?: string
  encoding?: 'utf8' | 'base64'
  /** Absolute resolved path (LSP + save key). */
  absPath: string
  /** Optimistic-concurrency token (absent when truncated). */
  hash?: string
  /** Editable text (not image/binary/truncated) → opens directly in the editor. */
  editable: boolean
  /** The path is a folder: shown as one, never as text. */
  directory: boolean
  /** A FIFO, socket or device: never read by the server, shown as what it is. */
  special: boolean
}

export type FileLoadState =
  | { status: 'loading'; reconnecting?: boolean }
  /** `message` is the classified sentence; `detail` is the backend's own words, for the centre. */
  | { status: 'error'; message: string; detail?: string }
  /**
   * Nothing at the path — a reply named a file that is not there. A routine answer, not a failure:
   * `message` is the server's sentence naming the resolved path, and nothing is reported.
   */
  | { status: 'missing'; message: string }
  | ReadyState

export function readyStateFor(path: string, response: FileContentResponse): ReadyState {
  const isImage = Boolean(response.mimeType?.startsWith('image/'))
  const directory = response.directory === true
  const special = response.special === true
  const isBinary = !directory && !isMarkdown(path) && !isImage && looksBinary(response.content)
  return {
    status: 'ready',
    content: response.content,
    truncated: response.truncated,
    mimeType: response.mimeType,
    encoding: response.encoding,
    absPath: response.path,
    hash: response.hash,
    editable:
      !directory &&
      !special &&
      !isImage &&
      !isBinary &&
      !response.truncated &&
      response.hash != null,
    directory,
    special,
  }
}
