import type {
  BandDrawn,
  BandRow,
  Drawn,
  ElementNode,
  HookReport,
  ModsHost as KitModsHost,
} from '@localix-ai/agent-plugins/mods'
import type { RunSurface } from './session/run-tools'
import {
  routeScreenControl,
  siteDrawing,
  type ControlAction,
  type HeldDrawing,
  type ScreenElement,
} from './site-drawing'

/**
 * The band above a conversation's prompt box: Claude Code's `AbovePrompt` render site, one per
 * conversation, drawn as Claude Code draws it since 2.1.323 (the kit's `ModsUi.drawBand`): every
 * mod of the conversation that hooks `ui.render` is asked for its own row (`surface: 'desktop'`,
 * `e.plugin` naming it), in the order the mods loaded, and the rows that fit one tree's limits are
 * stacked through `AbovePromptList`, whose hooks may hide, reorder or wrap them. A row past the
 * limits is left out while the others draw. Its controls work as a pane's (`site-drawing.ts`),
 * their events and `$` calls in that conversation, so a press can fill its prompt box. The screen
 * draws it again on the `mods` poke.
 */

export interface BandViewport {
  columns: number
  rows: number
}

/** What the person did with the band on the screen that asks for it. */
export interface BandView {
  /**
   * The person collapsed it (`e.props.isCollapsed`): the mods still draw their rows, and the
   * screen shows one line of what each part says.
   */
  collapsed?: boolean
}

export interface BandDrawing {
  sessionId: string
  /** The stacked rows' tree; null when no mod draws the band, or its drawing was refused. */
  tree: Array<ScreenElement | string> | null
  /** The mods whose rows were stacked, in order. */
  rows: string[]
  /** The conversation's turn is running (`isWorking`): the screen holds the band still. */
  working: boolean
  /** Why nothing was drawn, or a row was left out, in Claude Code's words. */
  problem?: string
}

export type BandAction = ControlAction

/** The cells Claude Code keeps at the band's right end for its `[-]` mark. */
const MARK_COLUMNS = 5

/**
 * What the band shows: a mod's tree where an `AbovePromptList` hook answered, else Claude Code's
 * own stack of the rows the last `next(e)` passed, from the top (one row is the row itself). A
 * hook may pass fewer rows or reorder them, never others: each is read back by its mod.
 */
function stacked(band: BandDrawn): { drawn: Drawn; rows: readonly BandRow[] } {
  if (!('engine' in band.drawn)) return { drawn: band.drawn, rows: band.rows }
  const ref = band.drawn.engine?.ref as { props?: { rows?: unknown } } | undefined
  const passed = Array.isArray(ref?.props?.rows)
    ? (ref.props.rows as Array<{ plugin?: unknown }>)
    : []
  const rows = passed.flatMap((row) => band.rows.filter((own) => own.plugin === row.plugin))
  if (rows.length === 0) return { drawn: { engine: undefined }, rows }
  const tree: ElementNode =
    rows.length === 1
      ? rows[0]!.tree
      : { type: 'Box', props: { flexDirection: 'column' }, children: rows.map((row) => row.tree) }
  return { drawn: { tree }, rows }
}

export function createModBand(deps: {
  /** The conversation's mods host, loaded for it when it is not yet. */
  hostOf: (sessionId: string) => Promise<KitModsHost | undefined>
  changed: () => void
  report: (report: HookReport) => void
  signal: AbortSignal
}) {
  /** The running turn of each conversation with mods, lending them its tools (`isWorking`). */
  const running = new Map<string, RunSurface>()
  /** Each band as last drawn, with its controls' callbacks. */
  const drawn = new Map<string, HeldDrawing>()

  async function render(
    sessionId: string,
    viewport: BandViewport,
    view: BandView = {},
  ): Promise<BandDrawing> {
    const kit = await deps.hostOf(sessionId)
    const working = running.has(sessionId)
    const mods = (kit?.active() ?? []).map((mod) => mod.name)
    const maxRows = Math.max(2, viewport.rows)
    if (!kit || mods.length === 0) {
      drawn.delete(sessionId)
      return { sessionId, tree: null, rows: [], working }
    }
    const band = await kit.ui.drawBand(
      {
        surface: 'desktop',
        props: {
          hasSurvey: false,
          isCollapsed: view.collapsed === true,
          isWorking: working,
          maxRows,
          bodyColumns: Math.max(1, viewport.columns - MARK_COLUMNS),
          scroll: { bodyRows: maxRows - 1, offset: 0 },
          view: {},
        },
        viewport: { ...viewport, isFullscreen: false },
      },
      mods,
    )
    const shown = stacked(band)
    const drawing = siteDrawing(shown.drawn)
    // A row left out past the band's limits is said even while the others draw.
    const leftOut = band.lines.join('\n')
    if (drawing.screen === null) {
      drawn.delete(sessionId)
      const problem = drawing.problem ?? leftOut
      return { sessionId, tree: null, rows: [], working, ...(problem ? { problem } : {}) }
    }
    drawn.set(sessionId, drawing.held)
    const rows = shown.rows.map((row) => row.plugin)
    return {
      sessionId,
      tree: drawing.screen,
      rows,
      working,
      ...(leftOut ? { problem: leftOut } : {}),
    }
  }

  async function interact(sessionId: string, action: BandAction): Promise<boolean> {
    const held = drawn.get(sessionId)
    const kit = held ? await deps.hostOf(sessionId) : undefined
    if (!held || !kit) return false
    const used = await routeScreenControl(kit, held, action, deps)
    if (used) deps.changed()
    return used
  }

  return {
    render,
    interact,
    /** A turn lends its tools while it runs; the band redraws as one starts and ends. */
    runs: {
      attach(sessionId: string, surface: RunSurface) {
        running.set(sessionId, surface)
        deps.changed()
      },
      detach(sessionId: string) {
        if (running.delete(sessionId)) deps.changed()
      },
      get: (sessionId: string) => running.get(sessionId),
    },
  }
}

export type ModBand = ReturnType<typeof createModBand>
