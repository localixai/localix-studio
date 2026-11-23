import { FileQuestion, FileText, FileX2, Folder } from 'lucide-react'
import { isOpenExternallyType } from '@/shared/lib/contentTypeRouting'
import { StateNotice } from '@localixai/kit/state-notice'
import { Button } from '@localixai/kit/button'
import { REVEAL_IN_OS_LABEL } from '@localixai/kit/environment'
import { backendClient } from '@/shared/api/client'
import { toast } from '@/shared/lib/notify'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { looksBinary } from '@/shared/lib/looksBinary'
import { baseName } from '@localixai/mini-app-sdk/ui/utilities'
import type { FileLoadState } from './fileLoadState'
import { isMarkdown } from './fileTabHelpers'
import { FileImageView } from './FileImageView'
import { FileOpenerHint } from './FileOpenerHint'
import { FileReadonlyView } from './FileReadonlyView'

type ReadyState = Extract<FileLoadState, { status: 'ready' }>

/**
 * Show a path in the OS file manager — the app's way to open what it has no viewer for (a folder,
 * a `.zip`), the same handoff as the Files sidebar's own menu item. A failure is a one-off event.
 */
function RevealInOs({ sessionId, absPath }: { sessionId: string; absPath: string }) {
  const reveal = () =>
    backendClient.revealFileEntry(sessionId, absPath).catch((e) =>
      toast.error('Could not reveal this file in your file manager', {
        description: errorMessage(e, '') || undefined,
      }),
    )
  return (
    <Button type="button" variant="ghost" size="xs" onClick={() => void reveal()}>
      {REVEAL_IN_OS_LABEL}
    </Button>
  )
}

/** A loaded file the editor does not take: an image, a binary, a folder, an empty or a read-only file. */
export function FileStaticView({
  sessionId,
  path,
  state,
  line,
}: {
  sessionId: string
  path: string
  state: ReadyState
  line?: number
}) {
  // A FIFO, socket or device was never opened (reading a FIFO can wait forever); it has no
  // content to show, so the tab says what it is rather than "Empty file".
  if (state.special) {
    return (
      <StateNotice
        icon={FileQuestion}
        title={baseName(path)}
        body="This is not a regular file."
        actions={<RevealInOs sessionId={sessionId} absPath={state.absPath} />}
      />
    )
  }

  if (state.directory) {
    return (
      <StateNotice
        icon={Folder}
        title={baseName(path)}
        body="This is a folder."
        actions={<RevealInOs sessionId={sessionId} absPath={state.absPath} />}
      />
    )
  }

  if (state.mimeType?.startsWith('image/')) {
    return (
      <FileImageView
        path={path}
        content={state.content}
        mimeType={state.mimeType}
        encoding={state.encoding}
        truncated={state.truncated}
      />
    )
  }

  // Non-image binary (read back as mojibake) — don't render garbage as code. When an app in the
  // Store opens this kind of file, the line above says so (`FileOpenerHint`), here and over text.
  if (!isMarkdown(path) && looksBinary(state.content)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FileOpenerHint path={path} />
        <StateNotice
          icon={FileX2}
          title={baseName(path)}
          body="Binary file — preview not supported."
          actions={<RevealInOs sessionId={sessionId} absPath={state.absPath} />}
        />
      </div>
    )
  }

  // An empty file would render as a blank panel — say so explicitly.
  if (state.content === '') {
    return <StateNotice title={baseName(path)} body="Empty file" />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileOpenerHint path={path} inEditor />
      <FileReadonlyView
        path={path}
        content={state.content}
        truncated={state.truncated}
        line={line}
      />
    </div>
  )
}

/**
 * Safety net: pdf/office/spreadsheet files have dedicated read-only viewers that the
 * editor grid routes them to. If one reaches the code editor directly (a caller that
 * bypassed that routing), don't try to edit it or render its bytes as text — surface
 * a read-only notice keyed off the shared content-type routing.
 */
export function FileDocumentNotice({ path, contentType }: { path: string; contentType: string }) {
  return (
    <StateNotice
      icon={FileText}
      title={baseName(path)}
      body={
        isOpenExternallyType(contentType)
          ? 'This document is read-only in-app — open it from the file tree to use its viewer.'
          : 'This file opens as a table, not in the code editor.'
      }
    />
  )
}
