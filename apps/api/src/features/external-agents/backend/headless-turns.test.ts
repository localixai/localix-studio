import { expect, test } from 'bun:test'
import { createHeadlessTurns, type TurnProcess } from './headless-turns'

/** A turn process the test ends by hand: its output lines, then its exit. */
function fakeProcess() {
  const started: { argv: string[]; cwd: string; stdin: string; env: object }[] = []
  let finish: (lines: string[], code?: number) => void = () => {}
  let killed = 0
  const spawn = (argv: string[], options: { cwd: string; stdin: string; env: object }) => {
    started.push({ argv, ...options })
    let resolveExit: (code: number) => void = () => {}
    const queued: string[] = []
    const process: TurnProcess = {
      exited: new Promise((resolve) => (resolveExit = resolve)),
      lines: (async function* () {
        await new Promise<void>((resolve) => {
          finish = (lines, code = 0) => {
            queued.push(...lines)
            resolve()
            queueMicrotask(() => resolveExit(code))
          }
        })
        yield* queued
      })(),
      kill: () => {
        killed++
        finish([], 143)
      },
    }
    return process
  }
  return {
    spawn,
    started,
    finish: (lines: string[], code?: number) => finish(lines, code),
    killed: () => killed,
  }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const RESULT_OK = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'ok',
})

test('a turn runs the agent once, with the message on its stdin, and is busy until it ends', async () => {
  const fake = fakeProcess()
  const turns = createHeadlessTurns({ spawn: fake.spawn })
  turns.start('chat', { argv: ['claude', '-p'], cwd: '/work', env: {}, prompt: 'fix the build' })
  expect(fake.started).toEqual([
    { argv: ['claude', '-p'], cwd: '/work', stdin: 'fix the build', env: {} },
  ])
  expect(turns.state('chat')).toEqual({ busy: true })
  fake.finish([JSON.stringify({ type: 'assistant' }), RESULT_OK])
  await settle()
  expect(turns.state('chat')).toEqual({ busy: false })
})

test('a second message while a turn runs is refused, not queued behind it', () => {
  const fake = fakeProcess()
  const turns = createHeadlessTurns({ spawn: fake.spawn })
  turns.start('chat', { argv: ['claude'], cwd: '/w', env: {}, prompt: 'one' })
  expect(() =>
    turns.start('chat', { argv: ['claude'], cwd: '/w', env: {}, prompt: 'two' }),
  ).toThrow()
  expect(fake.started).toHaveLength(1)
})

test('a turn the agent ends in error says why, until the next turn starts', async () => {
  const fake = fakeProcess()
  const turns = createHeadlessTurns({ spawn: fake.spawn })
  turns.start('chat', { argv: ['claude'], cwd: '/w', env: {}, prompt: 'hi' })
  fake.finish(
    [
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Not logged in · Please run /login',
      }),
    ],
    1,
  )
  await settle()
  expect(turns.state('chat')).toEqual({ busy: false, error: 'Not logged in · Please run /login' })
  turns.start('chat', { argv: ['claude'], cwd: '/w', env: {}, prompt: 'again' })
  expect(turns.state('chat')).toEqual({ busy: true })
})

test('an agent that exits without a result reports its exit code', async () => {
  const fake = fakeProcess()
  const turns = createHeadlessTurns({ spawn: fake.spawn })
  turns.start('chat', { argv: ['claude'], cwd: '/w', env: {}, prompt: 'hi' })
  fake.finish(['not json'], 2)
  await settle()
  expect(turns.state('chat').error).toContain('exited with code 2')
})

test('stopping a turn ends its process and is not an error', async () => {
  const fake = fakeProcess()
  const turns = createHeadlessTurns({ spawn: fake.spawn })
  turns.start('chat', { argv: ['claude'], cwd: '/w', env: {}, prompt: 'long task' })
  expect(turns.stop('chat')).toBe(true)
  await settle()
  expect(fake.killed()).toBe(1)
  expect(turns.state('chat')).toEqual({ busy: false })
  expect(turns.stop('chat')).toBe(false)
})
