import { describe, expect, test } from 'bun:test'

import { buildActivityYear } from './activityYear'

// Wednesday 12 June 2024, 15:00 local time.
const NOW = new Date(2024, 5, 12, 15).getTime()
const at = (month: number, day: number, hour = 10) => ({
  time: new Date(2024, month, day, hour).getTime(),
})

describe('buildActivityYear', () => {
  test('lays a year out as week columns of seven days, Monday first, ending this week', () => {
    const year = buildActivityYear([], NOW)
    expect(year.cells).toHaveLength(53 * 7)
    expect(new Date(year.cells[0]!.date).getDay()).toBe(1)
    const today = year.cells.find((cell) => cell.key === '2024-06-12')
    expect(today?.future).toBe(false)
    expect(year.cells.find((cell) => cell.key === '2024-06-13')?.future).toBe(true)
    expect(year.cells.at(-1)?.key).toBe('2024-06-16')
  })

  test('counts commits per day and shades the busiest day darkest', () => {
    const year = buildActivityYear(
      [at(5, 12), at(5, 12, 11), at(5, 12, 12), at(5, 12, 13), at(5, 10), at(4, 1)],
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
    const throughToday = buildActivityYear([at(5, 10), at(5, 11), at(5, 12)], NOW)
    expect(throughToday.stats.currentStreak).toBe(3)
    const throughYesterday = buildActivityYear([at(5, 9), at(5, 10), at(5, 11)], NOW)
    expect(throughYesterday.stats.currentStreak).toBe(3)
    const broken = buildActivityYear([at(5, 8), at(5, 9), at(5, 10)], NOW)
    expect(broken.stats.currentStreak).toBe(0)
    expect(broken.stats.longestStreak).toBe(3)
  })

  test('commits older than the grid or in the future are left out', () => {
    const year = buildActivityYear([{ time: new Date(2022, 0, 1).getTime() }, at(5, 20)], NOW)
    expect(year.stats.total).toBe(0)
  })

  test('names a month above the first week that starts in it', () => {
    const year = buildActivityYear([], NOW)
    const labels = year.monthLabels.filter((label): label is string => label !== null)
    expect(labels).toContain('Jun')
    expect(labels.length).toBeGreaterThanOrEqual(12)
  })
})
