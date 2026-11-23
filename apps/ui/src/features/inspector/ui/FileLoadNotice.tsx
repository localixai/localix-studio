import { useEffect, useRef } from 'react'
import { FileQuestion, FileX2 } from 'lucide-react'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { StateNotice } from '@localixai/kit/state-notice'
import { baseName } from '@localixai/mini-app-sdk/ui/utilities'
import { ProblemLine } from '@/shared/ui/problem-report'
import type { FileLoadState } from './fileLoadState'
import type { useFileEditor } from './useFileEditor'

/**
 * Nothing at the path: a reply named a file that is not there. One quiet sentence naming the
 * resolved path — no error, no Retry, no Event Center row. Opening the same link again focuses this
 * tab with a new `revealAt`, and that looks again, since the file may have been made since.
 */
export function FileMissingNotice({
  path,
  message,
  revealAt,
  onRecheck,
}: {
  path: string
  message: string
  revealAt?: number
  onRecheck: () => void
}) {
  const shownAt = useRef(revealAt)
  useEffect(() => {
    if (revealAt === shownAt.current) return
    shownAt.current = revealAt
    onRecheck()
  }, [revealAt, onRecheck])
  return <StateNotice icon={FileQuestion} title={baseName(path)} body={message} role="status" />
}

/**
 * What a file tab shows before it has a file to show: loading (or reconnecting), nothing at the
 * path, or a read that failed. The failure is the tab's standing problem, owned by `useFileEditor`
 * and drawn here as its one line; the missing notice reports nothing.
 */
export function FileLoadNotice({
  path,
  state,
  problem,
  revealAt,
  onRecheck,
}: {
  path: string
  state: Exclude<FileLoadState, { status: 'ready' }>
  problem: ReturnType<typeof useFileEditor>['problem']
  revealAt?: number
  onRecheck: () => void
}) {
  if (state.status === 'loading') {
    return (
      <LoadingHint className="min-h-0 flex-1 text-xs">
        {state.reconnecting ? 'Reconnecting to the local service…' : `Loading ${baseName(path)}…`}
      </LoadingHint>
    )
  }
  if (state.status === 'missing') {
    return (
      <FileMissingNotice
        path={path}
        message={state.message}
        revealAt={revealAt}
        onRecheck={onRecheck}
      />
    )
  }
  return (
    <StateNotice
      icon={FileX2}
      title={baseName(path)}
      body={problem && <ProblemLine {...problem} className="items-center" />}
    />
  )
}
