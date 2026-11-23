import { childEnv } from '../lib/login-shell-env'
import { whichBinary } from '../features/agent-core/tools/environments/shell'
import type { TurnSpawn } from '../features/external-agents/backend/headless-turns'
import { createLineSplitter } from '../lib/line-splitter'
import { killProcessTree } from '../lib/process-tree'

/** Longer than a sign-out or a status read takes; a hung CLI must not hold its request open. */
const RUN_DEADLINE_MS = 30_000

/**
 * Run a coding agent's own command to its end, without a terminal (`claude auth status`), and
 * return what it printed. The program is found on the repaired PATH, as installed agents are.
 */
export async function runAgentProgram(
  program: string,
  args: readonly string[],
  env: Record<string, string | undefined>,
): Promise<{ code: number; stdout: string }> {
  const merged = childEnv(env)
  const child = Bun.spawn([whichBinary(program, merged) ?? program, ...args], {
    env: merged,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    signal: AbortSignal.timeout(RUN_DEADLINE_MS),
    windowsHide: true,
  })
  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
  return { code, stdout }
}

/**
 * Start one headless turn of a coding agent (`claude -p …`): the message on its stdin, its
 * `stream-json` records read line by line. Stopping it ends its whole process tree, the tools it
 * started included.
 */
export const spawnAgentTurn: TurnSpawn = (argv, options) => {
  const env = childEnv(options.env)
  const [program = '', ...args] = argv
  const child = Bun.spawn([whichBinary(program, env) ?? program, ...args], {
    cwd: options.cwd,
    env,
    stdin: new TextEncoder().encode(options.stdin),
    stdout: 'pipe',
    stderr: 'ignore',
    windowsHide: true,
  })
  const lines = async function* () {
    const split = createLineSplitter()
    const decoder = new TextDecoder()
    for await (const bytes of child.stdout)
      yield* split.push(decoder.decode(bytes, { stream: true }))
    yield* split.flush()
  }
  // Stop answers within a second: the agent has nothing to save that its transcript lacks.
  return { lines: lines(), exited: child.exited, kill: () => killProcessTree(child.pid, 1_000) }
}
