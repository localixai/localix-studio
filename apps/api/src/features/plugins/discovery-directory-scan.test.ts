import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { tempDirPerTest, writeTree } from '@localixai/testing'

import { scanDirs } from './discovery-directory-scan'

const tempDir = tempDirPerTest('directory-scan-')

describe('the plugins folders', () => {
  // plugins-reference.md, "engines": a plugin read from a local folder loads outside its range.
  test('a plugin the person keeps there loads although it needs a newer Claude Code', async () => {
    const root = join(tempDir(), '.localix', 'plugins')
    writeTree(root, {
      'future/.claude-plugin/plugin.json': JSON.stringify({
        name: 'future',
        engines: { 'claude-code': '>=9.0.0' },
      }),
      'future/skills/a/SKILL.md': '---\ndescription: A\n---\nA',
    })
    const [found] = await scanDirs(root, [''], 'global', '')
    expect(found?.error).toBeUndefined()
    expect(found?.provides.skills).toEqual(['a'])
  })
})
