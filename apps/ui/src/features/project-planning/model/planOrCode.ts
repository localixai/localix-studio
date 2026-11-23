/**
 * In the normal (Default) mode, a chat's first message asks once: plan, or code? Planning switches
 * the chat to Plan mode — it reads the project and changes only its own state (the board, Project
 * Space), never code — and loads the planning tools. Coding sends as it always did.
 */
export function shouldAskPlanOrCode(
  send: {
    sessionId: string | null
    hasMessages: boolean
    permissionMode: string | undefined
    isInternal: boolean
  },
  answered: ReadonlySet<string>,
): boolean {
  if (!send.sessionId || send.isInternal || send.hasMessages) return false
  if ((send.permissionMode ?? 'default') !== 'default') return false
  return !answered.has(send.sessionId)
}
