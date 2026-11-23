import { describe, expect, test } from 'bun:test'

import { projectOverviewPrompt } from './overviewPrompt'

describe('projectOverviewPrompt', () => {
  test("asks for Mermaid flowcharts of the project, carrying the person's own description", () => {
    const prompt = projectOverviewPrompt({
      projectName: 'shop',
      description: 'A storefront: React UI, a Go API and Postgres.',
      diagrams: ['architecture', 'data-flow'],
    })
    expect(prompt).toContain('shop')
    expect(prompt).toContain('A storefront: React UI, a Go API and Postgres.')
    expect(prompt).toContain('```mermaid')
    expect(prompt).toContain('flowchart')
    expect(prompt).not.toContain('sequenceDiagram')
  })

  test('with no description, asks the agent to read the folder and work it out', () => {
    const prompt = projectOverviewPrompt({ projectName: 'shop', description: '  ', diagrams: [] })
    expect(prompt).toMatch(/read the project/i)
    // An empty choice still yields at least the architecture diagram.
    expect(prompt).toMatch(/architecture/i)
  })

  test('each chosen diagram kind is asked for by name', () => {
    const prompt = projectOverviewPrompt({
      projectName: 'shop',
      description: '',
      diagrams: ['request-sequence', 'data-model'],
    })
    expect(prompt).toContain('sequenceDiagram')
    expect(prompt).toContain('erDiagram')
  })
})
