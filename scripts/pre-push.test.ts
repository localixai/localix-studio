import { describe, expect, test } from 'bun:test'
import { gateArgv, pushChecks } from './pre-push-plan.mjs'

const ZERO = '0'.repeat(40)
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

/** One line of what git writes to a pre-push hook: local ref, local sha, remote ref, remote sha. */
const update = (localSha: string, remoteSha: string, ref = 'refs/heads/dev') =>
  `${ref} ${localSha} ${ref} ${remoteSha}\n`

describe('a push checks only what it adds, and never runs the test suite here', () => {
  test('an existing branch is checked against what the remote already has', () => {
    const checks = pushChecks(update(A, B))
    expect(checks?.base).toBe(B)
    expect(checks?.gates).toContain('type-check')
  })

  test('a new branch is checked against main', () => {
    expect(pushChecks(update(A, ZERO))?.base).toBe('origin/main')
  })

  test('several branches at once are checked against main', () => {
    const both = update(A, B) + update(B, A, 'refs/heads/other')
    expect(pushChecks(both)?.base).toBe('origin/main')
  })

  test('deleting a branch checks nothing', () => {
    expect(pushChecks(update(ZERO, B))).toBeNull()
  })

  test('the repository guards run here, so a rule CI enforces fails before the push', () => {
    // Architecture rules, file size, test determinism and UI tokens read the whole tree in a few
    // seconds and never flake; dev reached main 341 commits late once because only CI ran them.
    expect(pushChecks(update(A, B))?.gates).toContain('check:guards')
  })

  test('the unit and integration suites are left to CI on our runner', () => {
    const gates = pushChecks(update(A, B))?.gates ?? []
    expect(gates).not.toContain('test')
    expect(gates).not.toContain('test:integration')
  })
})

describe('a gate runs the same on every platform', () => {
  test('a script with parameter defaults runs as its expanded words, with no shell', () => {
    // Bun's shell on Windows passed `${TURBO_CONCURRENCY:-2}` to turbo as written.
    const script = 'bunx turbo type-check --concurrency=${TURBO_CONCURRENCY:-2} ${TURBO_FILTER:-}'
    expect(gateArgv(script, {})).toEqual(['bunx', 'turbo', 'type-check', '--concurrency=2'])
    expect(gateArgv(script, { TURBO_CONCURRENCY: '4', TURBO_FILTER: '--affected' })).toEqual([
      'bunx',
      'turbo',
      'type-check',
      '--concurrency=4',
      '--affected',
    ])
  })

  test('a script that needs a shell (a glob, quotes, a pipe) is left to bun run', () => {
    expect(gateArgv('bun test scripts/*guard*.test.ts', {})).toBeNull()
    expect(gateArgv("bun x 'quoted arg'", {})).toBeNull()
  })
})
