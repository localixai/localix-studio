import { useSyncExternalStore } from 'react'
import type { Message } from '@/entities/chat/model/types'

/**
 * A planning chat walks through its steps one at a time, and the person says yes before each:
 * the plan is written in the chat (`outline`), drawn in Project Space (`draw`), put on the Kanban
 * board (`board`), then approved. Each step is one short prompt with one tool, because a small
 * local model given every step at once wrote text, skipped tools, or said it had filled the board
 * when it had not. The app, not the model, checks that each step really happened.
 */
export type PlanStep = 'outline' | 'draw' | 'board'

/** The question shown when the agent has answered: what the person is asked next. */
export type PlanCard = 'draw' | 'redraw' | 'board' | 'refill' | 'approve'

export interface PlanFlow {
  step: PlanStep
  /** Messages in the chat when this step's prompt was sent; the step's result comes after. */
  since: number
  /** Messages in the chat when the person chose to keep talking; the card waits for a new reply. */
  snoozedAt?: number
}

/** Planning chats in this window. Lost on reload; the chat then simply carries on as Plan mode. */
const flows = new Map<string, PlanFlow>()
const listeners = new Set<() => void>()

function write(sessionId: string, flow: PlanFlow | undefined): void {
  if (flow) flows.set(sessionId, flow)
  else flows.delete(sessionId)
  for (const listener of listeners) listener()
}

export const readPlanFlow = (sessionId: string): PlanFlow | undefined => flows.get(sessionId)

export function beginPlanFlow(sessionId: string): void {
  write(sessionId, { step: 'outline', since: 0 })
}

export function movePlanFlow(sessionId: string, step: PlanStep, since: number): void {
  write(sessionId, { step, since })
}

export function snoozePlanFlow(sessionId: string, messageCount: number): void {
  const flow = flows.get(sessionId)
  if (flow) write(sessionId, { ...flow, snoozedAt: messageCount })
}

export function endPlanFlow(sessionId: string): void {
  write(sessionId, undefined)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePlanFlow(sessionId: string | null): PlanFlow | undefined {
  const read = () => (sessionId ? flows.get(sessionId) : undefined)
  return useSyncExternalStore(subscribe, read, read)
}

/** Whether the agent called this tool, and it succeeded, in these messages. */
function called(messages: readonly Message[], tool: string): boolean {
  return messages.some(
    (message) =>
      message.role === 'assistant' &&
      (message.items ?? []).some(
        (item) => 'name' in item && item.name === tool && item.status === 'completed',
      ),
  )
}

/**
 * The card to show, or null while the agent is working, before it has answered the step, or
 * while the person keeps talking. A step that did not call its tool is offered again rather than
 * moved past: the board is never filled from a map that was not drawn.
 */
export function planCard(
  flow: PlanFlow | undefined,
  running: boolean,
  messages: readonly Message[],
): PlanCard | null {
  if (!flow || running || messages.at(-1)?.role !== 'assistant') return null
  if (flow.snoozedAt !== undefined && messages.length <= flow.snoozedAt) return null
  const result = messages.slice(flow.since)
  if (flow.step === 'outline') return 'draw'
  if (flow.step === 'draw') return called(result, 'space_apply') ? 'board' : 'redraw'
  return called(result, 'kanban') ? 'approve' : 'refill'
}
