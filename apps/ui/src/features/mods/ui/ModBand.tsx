import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { IconButton } from '@localixai/kit/icon-button'
import { ActionTooltip } from '@localixai/kit/tooltip'
import type { ModAction, ModElement } from '@/shared/api/modsApi'
import { bandLayout } from './bandLayout'
import { ROW, Row, rowsOf } from './BandRows'
import { BandScroller } from './BandScroller'
import { ModSiteContext } from './modSite'
import { hotkeysOf, pressHotkey } from './siteHotkeys'
import { useComposerShell } from './useComposerShell'

/**
 * The band above the prompt box, as Claude Code draws its `AbovePrompt` site, drawn as part of the
 * composer rather than a strip bolted onto it: on the composer's own surface (no fill of its own),
 * inset to the composer's 12px padding, with one hairline between it and the input. The mods' tree
 * is at strip density (`modStyle.ts`), laid out by its shape (`bandLayout.ts`, `BandRows.tsx`), in
 * rows of one 28px height, a capped height that scrolls, and the band's one control — a ghost
 * collapse control — in a column of its own centred on the first row, never over text.
 *
 * Each mod draws its own row and the API stacks them (Claude Code 2.1.323), so the band is one
 * tree. Its Buttons' hotkeys work while the band holds the focus, and a digit typed alone into the
 * empty prompt box presses its Button on that digit (`useComposerShell.ts`). Collapsed, the band is
 * one row of what each part of it says.
 */

export interface ModBandProps {
  tree: Array<ModElement | string>
  /** The person collapsed the band; its owner keeps it, as the mods are told it. */
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  /** A control used in the band. */
  act: (action: ModAction) => void
  /** Runs `run` once the person paused; injected by tests. */
  afterPause?: (run: () => void) => () => void
}

export function ModBand({ tree, collapsed, onCollapsedChange, act, afterPause }: ModBandProps) {
  const root = useRef<HTMLDivElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const controlsWidth = useWidth(controls)
  const hotkeys = useMemo(() => hotkeysOf(tree), [tree])
  const blocks = useMemo(() => bandLayout(tree), [tree])
  useComposerShell(root, { hotkeys, act, collapsed, ...(afterPause ? { afterPause } : {}) })

  return (
    // Inset to the composer's own padding, so the band's text starts where the input's does.
    <div ref={root} className="@container shrink-0 px-3 text-2xs text-text-soft">
      {/* The controls sit over the first row's end, which keeps their width free; every other row
          has the band's whole width. */}
      <div
        data-slot="mods-band-seam"
        className="relative border-b border-border-faint py-0.5"
        style={{ '--band-controls': `${controlsWidth}px` } as CSSProperties}
      >
        {collapsed ? (
          <BandScroller
            label="Mods band, collapsed"
            className={`${ROW} -ml-2 pr-(--band-controls)`}
          >
            {blocks.map((part, at) => (
              <ActionTooltip key={at} label={part.summary}>
                <Button
                  size="xs"
                  variant="ghost"
                  className="max-w-56 font-normal text-text-faint"
                  onClick={() => onCollapsedChange(false)}
                >
                  <span className="min-w-0 truncate">{part.summary}</span>
                </Button>
              </ActionTooltip>
            ))}
          </BandScroller>
        ) : (
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegated hotkeys: the keydown comes from the Buttons inside, the region is never the target
          <div
            role="region"
            aria-label="Mods band"
            // The band takes the keyboard on a click or Tab, and its Buttons' hotkeys with it.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the region is the focus scope for the hotkeys of the Buttons inside it
            tabIndex={0}
            className="max-h-40 min-w-0 overflow-x-hidden overflow-y-auto rounded-sm focus-ring"
            onKeyDown={(event) => pressHotkey(event, hotkeys, act)}
          >
            <ModSiteContext.Provider value="band">
              <div className="[&>:first-child]:pr-(--band-controls)">
                {rowsOf(blocks).map((row, index) => (
                  <Row key={index} row={row} act={act} />
                ))}
              </div>
            </ModSiteContext.Provider>
          </div>
        )}
        {/* Centred on the first row, as the composer's other strip controls sit on theirs. */}
        <div ref={controls} className={`${ROW} absolute top-0.5 right-0`}>
          <IconButton
            size="xs"
            aria-label={collapsed ? 'Expand the band' : 'Collapse the band'}
            tooltip={collapsed ? 'Expand the band' : 'Collapse the band'}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </IconButton>
        </div>
      </div>
    </div>
  )
}

/** An element's width, kept current: the room the first row leaves for the band's controls. */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setWidth(Math.ceil(node.getBoundingClientRect().width))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}
