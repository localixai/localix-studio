/**
 * A year of commit activity as a contribution grid: 53 week columns of seven days, Monday first,
 * the last column holding today. Pure, so the page and its tests share one layout.
 */

export const ACTIVITY_WEEKS = 53

export interface ActivityCell {
  /** `YYYY-MM-DD`, local time. */
  key: string
  /** Local midnight, epoch milliseconds. */
  date: number
  count: number
  /** 0 = nothing, 1–4 = quarters of the busiest day. */
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

export interface ActivityStats {
  total: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  busiest: { key: string; count: number } | null
  thisWeek: number
}

export interface ActivityYear {
  cells: ActivityCell[]
  /** One per week column: the month's short name above the first week that starts in it. */
  monthLabels: (string | null)[]
  stats: ActivityStats
}

const MONTH = new Intl.DateTimeFormat('en', { month: 'short' })
const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(time: number): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfDay(time: number): Date {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d
}

function levelOf(count: number, max: number): ActivityCell['level'] {
  if (count === 0 || max === 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as ActivityCell['level']
}

function streaks(past: ActivityCell[]): { current: number; longest: number } {
  let longest = 0
  let run = 0
  for (const cell of past) {
    run = cell.count > 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  let current = 0
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i]!.count > 0) current++
    // Today may still be empty: the streak then runs to yesterday.
    else if (i !== past.length - 1) break
  }
  return { current, longest }
}

export function buildActivityYear(
  commits: readonly { time: number }[],
  now: number,
  weeks: number = ACTIVITY_WEEKS,
): ActivityYear {
  const today = startOfDay(now)
  const start = new Date(today)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7)

  const dates: Date[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    dates.push(date)
  }
  const inGrid = new Set(dates.map((date) => dayKey(date.getTime())))
  const todayKey = dayKey(today.getTime())
  const counts = new Map<string, number>()
  for (const commit of commits) {
    const key = dayKey(commit.time)
    if (!inGrid.has(key) || key > todayKey) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const max = Math.max(0, ...counts.values())

  const cells: ActivityCell[] = dates.map((date) => {
    const key = dayKey(date.getTime())
    const count = counts.get(key) ?? 0
    return { key, date: date.getTime(), count, level: levelOf(count, max), future: key > todayKey }
  })

  const monthLabels: (string | null)[] = []
  for (let w = 0; w < weeks; w++) {
    const first = dates[w * 7]!
    const previous = w > 0 ? dates[(w - 1) * 7]! : null
    monthLabels.push(
      !previous || previous.getMonth() !== first.getMonth() ? MONTH.format(first) : null,
    )
  }

  const past = cells.filter((cell) => !cell.future)
  const { current, longest } = streaks(past)
  const busiest = past.reduce<ActivityCell | null>(
    (best, cell) => (cell.count > (best?.count ?? 0) ? cell : best),
    null,
  )
  const weekStart = dayKey(dates[(weeks - 1) * 7]!.getTime())
  return {
    cells,
    monthLabels,
    stats: {
      total: past.reduce((sum, cell) => sum + cell.count, 0),
      activeDays: past.filter((cell) => cell.count > 0).length,
      currentStreak: current,
      longestStreak: longest,
      busiest: busiest ? { key: busiest.key, count: busiest.count } : null,
      thisWeek: past.filter((cell) => cell.key >= weekStart).reduce((s, c) => s + c.count, 0),
    },
  }
}
