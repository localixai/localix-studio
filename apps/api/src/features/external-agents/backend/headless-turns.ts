/**
 * A coding agent's chat turns run headless: one process per message (`claude -p`), the message on
 * its stdin, its conversation carried by the agent's own session id. Nothing is typed into a
 * terminal, so nothing the agent's terminal UI asks (folder trust, a menu) can swallow a message.
 * The turn's words reach the chat through the agent's transcript, which the chat already reads;
 * this only tracks whether a turn runs and why the last one failed.
 */
import { ConflictError } from '../../../lib/domain-errors'

/** A started turn process: its stdout lines, its exit, a way to end it early. */
export interface TurnProcess {
  lines: AsyncIterable<string>
  exited: Promise<number>
  kill(): void
}

export interface TurnSpawn {
  (
    argv: string[],
    options: { cwd: string; stdin: string; env: Record<string, string | undefined> },
  ): TurnProcess
}

export interface TurnRequest {
  argv: string[]
  cwd: string
  env: Record<string, string | undefined>
  prompt: string
}

export interface TurnState {
  busy: boolean
  /** Why the last turn failed: the agent's own words where it gave them. */
  error?: string
}

/** The last `result` record of a `stream-json` turn: whether it failed, and its words. */
function resultOf(line: string): { failed: boolean; text: string } | null {
  try {
    const record = JSON.parse(line) as Record<string, unknown>
    if (record.type !== 'result') return null
    const failed = record.is_error === true || record.subtype !== 'success'
    const errors = Array.isArray(record.errors) ? record.errors.join('; ') : ''
    const text = typeof record.result === 'string' && record.result ? record.result : errors
    return { failed, text: text || (typeof record.subtype === 'string' ? record.subtype : 'error') }
  } catch {
    return null
  }
}

export function createHeadlessTurns(deps: { spawn: TurnSpawn }) {
  const running = new Map<string, { process: TurnProcess; stopped: boolean }>()
  const errors = new Map<string, string>()
  const listeners = new Set<(sessionId: string) => void>()

  const finish = async (sessionId: string, turn: { process: TurnProcess; stopped: boolean }) => {
    let result: { failed: boolean; text: string } | null = null
    try {
      for await (const line of turn.process.lines) result = resultOf(line) ?? result
    } catch {
      // The stream ends with its process; the exit says how.
    }
    const code = await turn.process.exited
    running.delete(sessionId)
    if (turn.stopped) errors.delete(sessionId)
    else if (result?.failed) errors.set(sessionId, result.text)
    else if (!result && code !== 0) errors.set(sessionId, `The agent exited with code ${code}.`)
    for (const listener of listeners) listener(sessionId)
  }

  return {
    /** Run one turn of the chat's agent. A chat runs one turn at a time. */
    start(sessionId: string, request: TurnRequest): void {
      if (running.has(sessionId))
        throw new ConflictError('agent_busy', 'The agent is still answering. Stop it first.')
      errors.delete(sessionId)
      const process = deps.spawn(request.argv, {
        cwd: request.cwd,
        stdin: request.prompt,
        env: request.env,
      })
      const turn = { process, stopped: false }
      running.set(sessionId, turn)
      void finish(sessionId, turn)
    },
    /** End the running turn; what the agent wrote so far stays in its transcript. */
    stop(sessionId: string): boolean {
      const turn = running.get(sessionId)
      if (!turn) return false
      turn.stopped = true
      turn.process.kill()
      return true
    },
    state(sessionId: string): TurnState {
      const error = errors.get(sessionId)
      return { busy: running.has(sessionId), ...(error ? { error } : {}) }
    },
    /** Hear a turn end, for a client to re-read the chat at once. */
    onFinished(listener: (sessionId: string) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type HeadlessTurns = ReturnType<typeof createHeadlessTurns>
