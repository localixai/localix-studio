import { describe, expect, test } from 'bun:test'

import { buildActivityYear } from './activityYear'

// Wednesday 12 June 2024, 15:00 local time.
const NOW = new Date(2024, 5, 12, 15).getTime()
/** Commits per day, as the API counts them: one key per commit named. */
const days = (...keys: string[]) =>
  keys.reduce<Record<string, number>>((all, key) => ({ ...all, [key]: (all[key] ?? 0) + 1 }), {})
const june = (day: number) => `2024-06-${String(day).padStart(2, '0')}`

describe('buildActivityYear', () => {
  test('lays a year out as week columns of seven days, Monday first, ending this week', () => {
    const year = buildActivityYear({}, NOW)
    expect(year.cells).toHaveLength(53 * 7)
    expect(new Date(year.cells[0]!.date).getDay()).toBe(1)
    const today = year.cells.find((cell) => cell.key === '2024-06-12')
    expect(today?.future).toBe(false)
    expect(year.cells.find((cell) => cell.key === '2024-06-13')?.future).toBe(true)
    expect(year.cells.at(-1)?.key).toBe('2024-06-16')
  })

  test('counts commits per day and shades the busiest day darkest', () => {
    const year = buildActivityYear(
      days(june(12), june(12), june(12), june(12), june(10), '2024-05-01'),
      NOW,
    )
    const day = (key: string) => year.cells.find((cell) => cell.key === key)
    expect(day('2024-06-12')).toMatchObject({ count: 4, level: 4 })
    expect(day('2024-06-10')).toMatchObject({ count: 1, level: 1 })
    expect(day('2024-06-11')).toMatchObject({ count: 0, level: 0 })
    expect(year.stats).toMatchObject({
      total: 6,
      activeDays: 3,
      busiest: { key: '2024-06-12', count: 4 },
    })
  })

  test('the current streak runs to today, or to yesterday while today is still empty', () => {
    const throughToday = buildActivityYear(days(june(10), june(11), june(12)), NOW)
    expect(throughToday.stats.currentStreak).toBe(3)
    const throughYesterday = buildActivityYear(days(june(9), june(10), june(11)), NOW)
    expect(throughYesterday.stats.currentStreak).toBe(3)
    const broken = buildActivityYear(days(june(8), june(9), june(10)), NOW)
    expect(broken.stats.currentStreak).toBe(0)
    expect(broken.stats.longestStreak).toBe(3)
  })

  test('days older than the grid or in the future are left out', () => {
    const year = buildActivityYear(days('2022-01-01', june(20)), NOW)
    expect(year.stats.total).toBe(0)
  })

  test('names a month above the first week that starts in it', () => {
    const year = buildActivityYear({}, NOW)
    const labels = year.monthLabels.filter((label): label is string => label !== null)
    expect(labels).toContain('Jun')
    expect(labels.length).toBeGreaterThanOrEqual(12)
  })
})
