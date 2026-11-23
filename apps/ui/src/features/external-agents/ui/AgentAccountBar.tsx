import { useState } from 'react'
import type { AgentAccount } from '@localixai/api/external-agent-contracts'
import { TextAction } from '@localixai/kit/text-action'

const plan = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * Who the chat's agent is signed in as, with signing in or out beside it: done by the agent's own
 * commands, so the person never opens its terminal for it.
 */
export function AgentAccountBar(props: {
  account: AgentAccount
  onLogin: () => Promise<void>
  onLogout: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }
  const { account } = props
  const who = account.loggedIn
    ? [account.email ?? 'Signed in', account.plan ? plan(account.plan) : null]
        .filter(Boolean)
        .join(' · ')
    : 'Not signed in'
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-text-soft">
      <span className="truncate">{who}</span>
      <TextAction
        disabled={busy}
        className="shrink-0 text-foreground"
        onClick={() => void run(account.loggedIn ? props.onLogout : props.onLogin)}
      >
        {account.loggedIn ? 'Log out' : 'Log in'}
      </TextAction>
    </div>
  )
}
