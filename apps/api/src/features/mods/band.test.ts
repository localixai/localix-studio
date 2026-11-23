import { describe, expect, test } from 'bun:test'
import { hostWithMod, hostWithMods } from './testing/testing-host'

const texts = (tree: unknown): string[] =>
  typeof tree === 'string'
    ? [tree]
    : Array.isArray(tree)
      ? tree.flatMap(texts)
      : tree && typeof tree === 'object'
        ? texts((tree as { children?: unknown }).children ?? [])
        : []

/** The band above a conversation's prompt box (`AbovePrompt`), as a mod draws in it. */

type Ui = { Box: Fn; Text: Fn; Button: Fn }
type Fn = (props: Record<string, unknown>) => unknown
const ui = ($: any, e: unknown) => ($.ui.resolve as (e: unknown) => Ui)(e)

describe('the AbovePrompt band', () => {
  test('a mod draws the band with the site’s props; nobody drawing leaves no band', async () => {
    let seen: Record<string, unknown> | undefined
    const { host } = await hostWithMod((on) => {
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        seen = e as Record<string, unknown>
        return ui($, e).Text({ children: 'forecast' })
      })
    })
    const drawing = await host.band.render('s1', { columns: 100, rows: 12 })
    expect(drawing.tree).toEqual([{ type: 'Text', props: {}, children: ['forecast'] }])
    expect(seen).toMatchObject({
      component: 'AbovePrompt',
      surface: 'desktop',
      props: {
        hasSurvey: false,
        isCollapsed: false,
        isWorking: false,
        maxRows: 12,
        bodyColumns: 95,
        scroll: { bodyRows: 11, offset: 0 },
        view: {},
      },
    })

    const quiet = await hostWithMod((on) => on('ui.render', (_$, e, next) => next(e)))
    expect((await quiet.host.band.render('s1', { columns: 100, rows: 12 })).tree).toBeNull()
  })

  // 2.1.330 `isCollapsed`: the person collapsed the band; a tree still returns, and the collapsed
  // band shows one line of what each part of it says.
  test('a collapsed band still asks each mod for its row, saying it is collapsed', async () => {
    const collapsed: unknown[] = []
    const { host } = await hostWithMod((on) => {
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        collapsed.push((e as { props: { isCollapsed?: unknown } }).props.isCollapsed)
        return ui($, e).Text({ children: 'forecast' })
      })
    })
    const drawing = await host.band.render('s1', { columns: 100, rows: 12 }, { collapsed: true })
    expect(texts(drawing.tree)).toEqual(['forecast'])
    await host.band.render('s1', { columns: 100, rows: 12 })
    expect(collapsed).toEqual([true, false])
  })

  // reference.md, "Render sites" (2.1.323): `AbovePrompt` is asked once for each mod, `e.plugin`
  // naming it, and the rows are stacked through `AbovePromptList` under one tree's limits.
  test('each mod draws its own row, stacked in the order the mods loaded', async () => {
    const heard: Record<string, unknown[]> = { outer: [], inner: [] }
    const { host } = await hostWithMods({
      outer: (on) =>
        on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
          heard.outer!.push((e as { plugin?: unknown }).plugin)
          return ui($, e).Text({ children: 'outer' })
        }),
      inner: (on) =>
        on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
          heard.inner!.push((e as { plugin?: unknown }).plugin)
          return ui($, e).Text({ children: 'inner' })
        }),
    })
    const drawing = await host.band.render('s1', { columns: 80, rows: 10 })
    expect(texts(drawing.tree)).toEqual(['outer', 'inner'])
    expect(drawing.rows).toEqual(['outer', 'inner'])
    // A hook with no `plugin` in its matcher hears its own mod's row alone.
    expect(heard).toEqual({ outer: ['outer'], inner: ['inner'] })
  })

  test('a mod hooking AbovePromptList may reorder or hide the rows', async () => {
    const { host } = await hostWithMods({
      first: (on) =>
        on('ui.render', { component: 'AbovePrompt' }, ($, e) => ui($, e).Text({ children: 'a' })),
      second: (on) =>
        on('ui.render', { component: 'AbovePrompt' }, ($, e) => ui($, e).Text({ children: 'b' })),
      list: (on) =>
        on('ui.render', { component: 'AbovePromptList' }, ($, e) => {
          const rows = (e as { props: { rows: Array<{ plugin: string; tree: unknown }> } }).props
            .rows
          return ui($, e).Box({ children: rows.toReversed().map((row) => row.tree) })
        }),
    })
    const drawing = await host.band.render('s1', { columns: 80, rows: 10 })
    expect(texts(drawing.tree)).toEqual(['b', 'a'])
  })

  test('a press runs onPress with its ui.press argument, in the band’s conversation', async () => {
    const pressed: unknown[] = []
    const { host } = await hostWithMod((on) => {
      on('ui.render', { component: 'AbovePrompt' }, ($, e) =>
        ui($, e).Button({
          label: 'Fill',
          hotkey: '1',
          onPress: (press: unknown) => {
            pressed.push(press)
            return ($.prompt.fill as (input: unknown) => unknown)({ text: 'run the tests' })
          },
        }),
      )
    })
    const drawing = await host.band.render('s1', { columns: 80, rows: 10 })
    expect(drawing.tree?.[0]).toMatchObject({ props: { key: 'Fill', hotkey: '1' } })
    expect(await host.band.interact('s1', { kind: 'press', element: 'Fill' })).toBe(true)
    // The kit hands a press's callback the surface it was used on.
    expect(pressed).toEqual([{ surface: 'desktop' }])
    expect(host.composer.view('s1').fills.map((fill) => fill.text)).toEqual(['run the tests'])
    expect(await host.band.interact('s1', { kind: 'press', element: 'gone' })).toBe(false)
  })

  test('isWorking is true while the conversation’s turn runs; the screen hears it too', async () => {
    const working: unknown[] = []
    const { host, scope } = await hostWithMod((on) => {
      on('ui.render', { component: 'AbovePrompt' }, (_$, e, next) => {
        working.push((e as { props: { isWorking: boolean } }).props.isWorking)
        return next(e)
      })
    })
    scope.wrapTools([])
    const during = await host.band.render('s1', { columns: 80, rows: 10 })
    await scope.turnComplete({ answer: '', turnId: 't', durationMs: 1, reason: 'answer' })
    const after = await host.band.render('s1', { columns: 80, rows: 10 })
    expect(working).toEqual([true, false])
    expect([during.working, after.working]).toEqual([true, false])
  })

  test('a conversation that ran no turn since Localix started draws its band in its own project', async () => {
    const { host, dir } = await hostWithMod(
      (on) => {
        on('ui.render', { component: 'AbovePrompt' }, async ($, e) =>
          ui($, e).Text({ children: await ($.session.cwd as () => Promise<string>)() }),
        )
      },
      { sessionCwd: async () => `${dir}/project` },
    )
    const drawing = await host.band.render('fresh', { columns: 80, rows: 10 })
    expect(drawing.tree).toEqual([{ type: 'Text', props: {}, children: [`${dir}/project`] }])
  })
})
