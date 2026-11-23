import { describe, expect, test } from 'bun:test'
import { gitRemoteEnvironment } from './git-environment'

// plugins/install.md, "Add a private marketplace", and plugins/troubleshooting.md, "SSH host key is
// not in your known_hosts file": a clone never asks, and the client's own `ssh` refuses a host not
// already in `known_hosts`; an SSH program the person's git setup names runs as they wrote it.
describe('the environment git reaches a plugin or marketplace repository with', () => {
  const base = { PATH: '/usr/bin', GIT_ASKPASS: '/usr/local/bin/askpass' }

  test('runs ssh in batch mode that refuses an unknown host key, and never prompts', () => {
    const env = gitRemoteEnvironment(base)
    expect(env.GIT_SSH_COMMAND).toBe('ssh -o BatchMode=yes -o StrictHostKeyChecking=yes')
    expect(env).toMatchObject({ PATH: '/usr/bin', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' })
  })

  test.each<[NodeJS.ProcessEnv, string | undefined]>([
    [{ GIT_SSH_COMMAND: 'ssh -i ~/.ssh/deploy' }, undefined],
    [{ GIT_SSH: '/usr/local/bin/my-ssh' }, undefined],
    [{}, 'ssh -F ~/.ssh/work_config'],
  ])('keeps the SSH program the git setup names (%p, core.sshCommand %p)', (named, core) => {
    const env = gitRemoteEnvironment({ ...base, ...named }, core)
    expect(env.GIT_SSH_COMMAND).toBe(named.GIT_SSH_COMMAND)
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })
})
