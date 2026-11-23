import { describe, expect, test } from 'bun:test'

import { presentErrorInfo } from '@localixai/agent/agents'

import { NotFoundError } from '../../../../lib/domain-errors'
import { ActiveTurnTooLargeError, LocalContextBudgetExceededError } from '../context-budget'
import { classifyRunError } from './classify-run-error'

const frame = {
  rawWindow: 272_000,
  effectiveWindow: 256_000,
  reserve: 25_600,
  fixedOverhead: 10_000,
  trigger: 230_400,
  historyBudget: 220_400,
}

describe('local context policy classification', () => {
  test('recoverable old-history pressure compacts once without pretending it came from a provider', () => {
    const error = new LocalContextBudgetExceededError({
      reason: 'estimated_context_too_large',
      frame,
      requiredTokens: 231_000,
      availableTokens: 230_400,
      estimateSource: 'heuristic',
      message: 'Local policy estimate is over budget.',
    })

    expect(classifyRunError({}, 'u1', error)).toEqual({
      kind: 'context_overflow',
      userMessage: error.message,
      retryable: false,
      shouldCompress: true,
    })
  })

  test('an irreducible active turn is actionable and never enters compaction retry', () => {
    const error = new ActiveTurnTooLargeError({
      frame,
      requiredTokens: 230_000,
      availableTokens: 220_400,
      estimateSource: 'heuristic',
      message: 'Move the attachment to a file.',
    })

    expect(classifyRunError({}, 'u1', error)).toEqual({
      kind: 'fatal',
      userMessage: error.message,
      retryable: false,
    })
  })
})

describe('a refusal of the host itself', () => {
  test('a chat whose project folder is gone says so in its own words, never "unexpected"', () => {
    const error = new NotFoundError(
      'session_not_found',
      'The project folder is gone, so the project and its chats were removed: /Users/me/app',
    )
    const presented = presentErrorInfo(classifyRunError({}, 'u1', error))

    expect(presented.reason).toBe(
      'The project folder is gone, so the project and its chats were removed: /Users/me/app.',
    )
    expect(presented.actions).toEqual([])
  })
})

describe('what a provider echoed back', () => {
  test('is redacted in the detail too, where its whole answer is kept', () => {
    const error = Object.assign(new Error('openai 422: invalid key sk-vault-1 for this model'), {
      name: 'FetchError',
    })
    const info = classifyRunError(
      { sanitizeText: (_userId, text) => text.replaceAll('sk-vault-1', '[redacted]') },
      'u1',
      error,
    )
    expect(info.userMessage).not.toContain('sk-vault-1')
    expect(info.detail).toBe('openai 422: invalid key [redacted] for this model')
  })
})
