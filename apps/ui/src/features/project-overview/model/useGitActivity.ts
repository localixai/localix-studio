import { useCallback, useEffect, useState } from 'react'
import { backendClient } from '@/shared/api/client'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'

export type GitActivity = Awaited<ReturnType<typeof backendClient.gitActivity>>

export type GitActivityState =
  | { status: 'loading' }
  | { status: 'ready'; activity: GitActivity }
  | { status: 'error'; message: string }

type Answer = { request: string; state: GitActivityState }

/** The project's last year of commits, read again when the project changes or on `reload`. */
export function useGitActivity(projectId: string): {
  state: GitActivityState
  reload: () => void
} {
  const [round, setRound] = useState(0)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const reload = useCallback(() => setRound((n) => n + 1), [])
  const request = `${projectId}:${round}`
  useEffect(() => {
    const controller = new AbortController()
    backendClient.gitActivity(projectId, controller.signal).then(
      (activity) => setAnswer({ request, state: { status: 'ready', activity } }),
      (cause: unknown) => {
        if (controller.signal.aborted) return
        const message = errorMessage(cause, 'Could not read the git history')
        setAnswer({ request, state: { status: 'error', message } })
      },
    )
    return () => controller.abort()
  }, [projectId, request])
  // An answer for another project or an earlier round is stale: the new read is still loading.
  return { state: answer?.request === request ? answer.state : { status: 'loading' }, reload }
}
