import { useEffect } from 'react'
import useSWR from 'swr'
import type { AgentAccount, AgentScreen } from '@localixai/api/external-agent-contracts'
import { externalAgentsApi } from '../api'

/** How often the agent's screen is read while its chat is open: a question shows within it. */
const SCREEN_REFRESH_MS = 1000

/**
 * The chat's agent besides its conversation: whether it runs, the question it waits on, and who it
 * is signed in as. The account is read again whenever the agent stops or starts, which is when a
 * sign-in or sign-out has finished.
 */
export function useAgentTerminal(sessionId: string) {
  const screen = useSWR<AgentScreen>(
    sessionId ? ['external-agent:screen', sessionId] : null,
    () => externalAgentsApi.screen(sessionId),
    { refreshInterval: SCREEN_REFRESH_MS, keepPreviousData: true },
  )
  const account = useSWR<AgentAccount | null>(
    sessionId ? ['external-agent:account', sessionId] : null,
    () => externalAgentsApi.account(sessionId),
    { revalidateOnFocus: true },
  )
  const running = screen.data?.running
  const { mutate } = account
  useEffect(() => {
    if (running !== undefined) void mutate()
  }, [running, mutate])
  return {
    running,
    headless: screen.data?.headless ?? false,
    busy: screen.data?.busy ?? false,
    error: screen.data?.error,
    prompt: screen.data?.prompt ?? null,
    refreshScreen: () => screen.mutate(),
    account: account.data ?? null,
    setAccount: (next: AgentAccount | null) => account.mutate(next, { revalidate: false }),
  }
}
