import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { ModAction } from '@/shared/api/modsApi'

/**
 * What the band above the prompt box hears from the composer it sits in (`ModBand.tsx`): a digit
 * typed alone into the empty prompt box presses the band's Button on that digit, once the person
 * pauses: the digit goes, the Button is pressed.
 */

/** How long the box must hold the digit alone before it presses the band's Button. */
const DIGIT_PAUSE_MS = 600

const pauseThen = (run: () => void) => {
  const timer = setTimeout(run, DIGIT_PAUSE_MS)
  return () => clearTimeout(timer)
}

const setFieldValue = (field: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

export interface ComposerShellOptions {
  /** The band's hotkeys, to the key of the Button each presses. */
  hotkeys: ReadonlyMap<string, string>
  act: (action: ModAction) => void
  /** Collapsed, nothing in the band presses. */
  collapsed: boolean
  /** Runs `run` once the person paused; injected by tests. */
  afterPause?: (run: () => void) => () => void
}

const shellOf = (root: RefObject<HTMLElement | null>) =>
  root.current?.closest('[data-agent-link-drop-target]')

/** The band's key in its composer: a digit alone in the box. */
export function useComposerShell(
  root: RefObject<HTMLElement | null>,
  options: ComposerShellOptions,
): void {
  const latest = useRef({ ...options, afterPause: options.afterPause ?? pauseThen })
  useLayoutEffect(() => {
    latest.current = { ...options, afterPause: options.afterPause ?? pauseThen }
  })

  useEffect(() => {
    const shell = shellOf(root)
    if (!shell) return
    let cancel: (() => void) | undefined
    const onInput = (event: Event) => {
      cancel?.()
      const field = event.target
      if (!(field instanceof HTMLTextAreaElement) || !shell.contains(field)) return
      const { hotkeys: keys, collapsed, afterPause } = latest.current
      const digit = field.value
      if (collapsed || !/^[0-9]$/.test(digit) || !keys.has(digit)) return
      cancel = afterPause(() => {
        if (field.value !== digit) return
        setFieldValue(field, '')
        latest.current.act({ kind: 'press', element: keys.get(digit)! })
      })
    }
    shell.addEventListener('input', onInput)
    return () => {
      cancel?.()
      shell.removeEventListener('input', onInput)
    }
  }, [root])
}
