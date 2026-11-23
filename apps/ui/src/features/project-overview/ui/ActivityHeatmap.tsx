import { useEffect, useMemo, useState } from 'react'
import type { ActivityCell, ActivityYear } from '../model/activityYear'

export interface DayCommit {
  hash: string
  time: number
  author: string
  subject: string
}

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

/**
 * A year of commits as a grid of days; picking a day lists its commits under the grid. The grid
 * holds counts only: a picked day's commits are read for that day (`readDay`, local midnight to
 * the next).
 */
export function ActivityHeatmap(props: {
  year: ActivityYear
  readDay: (from: number, to: number) => Promise<DayCommit[]>
}) {
  const { year, readDay } = props
  const [selected, setSelected] = useState<string | null>(null)
  const weeks = year.monthLabels.length
  const columns = useMemo(
    () => Array.from({ length: weeks }, (_, w) => year.cells.slice(w * 7, w * 7 + 7)),
    [year, weeks],
  )
  const selectedCell = selected ? year.cells.find((cell) => cell.key === selected) : undefined
  const [day, setDay] = useState<{ key: string; commits: DayCommit[] } | null>(null)
  const selectedDate = selectedCell?.date
  useEffect(() => {
    if (selected === null || selectedDate === undefined) return
    let current = true
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + 1)
    readDay(selectedDate, next.getTime()).then(
      (commits) => current && setDay({ key: selected, commits }),
      () => current && setDay({ key: selected, commits: [] }),
    )
    return () => {
      current = false
    }
  }, [selected, selectedDate, readDay])
  const dayCommits = day && day.key === selected ? day.commits : []

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5" role="grid" aria-label="Commits per day">
          <div className="flex gap-2" aria-hidden>
            <span className="w-7 flex-none" />
            <div className="flex gap-0.75">
              {year.monthLabels.map((label, w) => (
                <span
                  key={w}
                  className="w-2.75 flex-none overflow-visible whitespace-nowrap text-3xs text-text-faint"
                >
                  {label ?? ''}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex w-7 flex-none flex-col gap-0.75" aria-hidden>
              {WEEKDAYS.map((day, i) => (
                <span
                  key={i}
                  className="flex h-2.75 items-center text-3xs leading-none text-text-faint"
                >
                  {day}
                </span>
              ))}
            </div>
            <div className="flex gap-0.75">
              {columns.map((column, w) => (
                <div key={w} className="flex flex-col gap-0.75" role="row">
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
                      className="size-2.75 rounded-xs outline-none focus-ring disabled:invisible aria-selected:ring-1 aria-selected:ring-foreground"
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
            <span key={i} className="size-2.75 rounded-xs" style={{ background: fill }} />
          ))}
          More
        </span>
      </div>
      {selectedCell ? (
        <div className="space-y-1" aria-live="polite">
          <p className="text-xs font-medium">{describe(selectedCell)}</p>
          <ul className="divide-y divide-border-faint">
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
