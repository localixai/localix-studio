import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { clonePlan } from '@localix-ai/agent-plugins/marketplace'

const execFileAsync = promisify(execFile)

/**
 * The environment git reaches a plugin's or a marketplace's repository with, as the kit plans a
 * clone (`clonePlan`; plugins/install.md, "Add a private marketplace"): git's prompts and askpass
 * programs off, and the client's own `ssh` run with `BatchMode=yes` and `StrictHostKeyChecking=yes`,
 * so a host not already in `known_hosts` is refused, never accepted, whatever the person's ssh
 * config says (plugins/troubleshooting.md, "SSH host key is not in your known_hosts file"). An SSH
 * program the person's git setup names (`GIT_SSH_COMMAND`, `GIT_SSH`, `core.sshCommand`) runs as
 * they wrote it: setting `GIT_SSH_COMMAND` over `core.sshCommand` would replace it.
 */
export function gitRemoteEnvironment(
  base: NodeJS.ProcessEnv,
  coreSshCommand?: string,
): NodeJS.ProcessEnv {
  const plan = clonePlan({
    ...(base.GIT_SSH_COMMAND ? { gitSshCommand: base.GIT_SSH_COMMAND } : {}),
    ...(base.GIT_SSH ? { gitSsh: base.GIT_SSH } : {}),
    ...(coreSshCommand ? { coreSshCommand } : {}),
  })
  return {
    ...base,
    ...plan.environment,
    ...(plan.sshOptions.length > 0
      ? { GIT_SSH_COMMAND: ['ssh', ...plan.sshOptions].join(' ') }
      : {}),
  }
}

/** `core.sshCommand` of the person's git configuration, or undefined when it names none. */
async function coreSshCommandOf(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'core.sshCommand'], {
      env,
      timeout: 10_000,
      killSignal: 'SIGKILL',
      windowsHide: true,
    })
    return String(stdout).trim() || undefined
  } catch {
    // `git config --get` exits 1 when the key is unset; a git that cannot answer names none either.
    return undefined
  }
}

/** {@link gitRemoteEnvironment} of `base`, with the person's `core.sshCommand` read from git. */
export async function readGitRemoteEnvironment(
  base: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  return gitRemoteEnvironment(base, await coreSshCommandOf(base))
}
