import { useMemo, useState } from 'react'
import { dayKey, type ActivityCell, type ActivityYear } from '../model/activityYear'
import type { GitActivity } from '../model/useGitActivity'

/** Day-cell fill per level: a veil of the first chart colour, darker with more commits. */
const LEVEL_FILL = [
  'color-mix(in oklab, var(--foreground) 6%, transparent)',
  'color-mix(in oklab, var(--chart-1) 30%, transparent)',
  'color-mix(in oklab, var(--chart-1) 52%, transparent)',
  'color-mix(in oklab, var(--chart-1) 76%, transparent)',
  'var(--chart-1)',
] as const

const DAY = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const TIME = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' })
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']

function describe(cell: ActivityCell): string {
  const day = DAY.format(cell.date)
  return cell.count
    ? `${day}: ${cell.count} commit${cell.count === 1 ? '' : 's'}`
    : `${day}: no commits`
}

/** A year of commits as a grid of days; picking a day lists its commits under the grid. */
export function ActivityHeatmap(props: { year: ActivityYear; commits: GitActivity['commits'] }) {
  const { year, commits } = props
  const [selected, setSelected] = useState<string | null>(null)
  const weeks = year.monthLabels.length
  const columns = useMemo(
    () => Array.from({ length: weeks }, (_, w) => year.cells.slice(w * 7, w * 7 + 7)),
    [year, weeks],
  )
  const selectedCell = selected ? year.cells.find((cell) => cell.key === selected) : undefined
  const dayCommits = selectedCell
    ? commits.filter((commit) => dayKey(commit.time) === selectedCell.key)
    : []

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5" role="grid" aria-label="Commits per day">
          <div className="flex gap-2" aria-hidden>
            <span className="w-7 flex-none" />
            <div className="flex gap-[3px]">
              {year.monthLabels.map((label, w) => (
                <span
                  key={w}
                  className="w-[11px] flex-none overflow-visible whitespace-nowrap text-3xs text-text-faint"
                >
                  {label ?? ''}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex w-7 flex-none flex-col gap-[3px]" aria-hidden>
              {WEEKDAYS.map((day, i) => (
                <span key={i} className="h-[11px] text-3xs leading-[11px] text-text-faint">
                  {day}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {columns.map((column, w) => (
                <div key={w} className="flex flex-col gap-[3px]" role="row">
                  {column.map((cell) => (
                    <button
                      key={cell.key}
                      type="button"
                      role="gridcell"
                      disabled={cell.future}
                      title={describe(cell)}
                      aria-label={describe(cell)}
                      aria-selected={selected === cell.key}
                      onClick={() => setSelected(selected === cell.key ? null : cell.key)}
                      className="size-[11px] rounded-xs outline-none focus-ring disabled:invisible aria-selected:ring-1 aria-selected:ring-foreground"
                      style={{ background: LEVEL_FILL[cell.level] }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-2xs text-text-soft">
        <span className="min-w-48 flex-1">
          Each square is a day of this folder&apos;s git history. Pick a day to see its commits.
        </span>
        <span className="inline-flex items-center gap-1" aria-hidden>
          Less
          {LEVEL_FILL.map((fill, i) => (
            <span key={i} className="size-[11px] rounded-xs" style={{ background: fill }} />
          ))}
          More
        </span>
      </div>
      {selectedCell ? (
        <div className="space-y-1" aria-live="polite">
          <p className="text-xs font-medium">{describe(selectedCell)}</p>
          <ul className="divide-y divide-border/60">
            {dayCommits.map((commit) => (
              <li key={commit.hash} className="flex min-h-8 items-center gap-3 text-xs">
                <code className="text-2xs text-text-soft">{commit.hash.slice(0, 7)}</code>
                <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                <span className="text-2xs text-text-soft">{commit.author}</span>
                <span className="text-2xs text-text-faint">{TIME.format(commit.time)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
