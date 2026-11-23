/**
 * The message the Project overview sends to start a "describe and diagram" chat. The chat runs on
 * whatever model the person chose — a cloud provider or a model on this computer — and its answer's
 * `mermaid` fences are drawn as diagrams in the transcript.
 */

export const DIAGRAM_KINDS = [
  {
    id: 'architecture',
    label: 'Architecture',
    ask: 'an architecture `flowchart` of the main components and how they depend on each other',
  },
  {
    id: 'data-flow',
    label: 'Data flow',
    ask: 'a data-flow `flowchart` of how a request or a piece of data moves through the system',
  },
  {
    id: 'request-sequence',
    label: 'Request sequence',
    ask: 'a `sequenceDiagram` of the most important user action, end to end',
  },
  {
    id: 'data-model',
    label: 'Data model',
    ask: 'an `erDiagram` of the main stored entities and their relations',
  },
  {
    id: 'user-journey',
    label: 'User journey',
    ask: 'a `flowchart` of the main screens or commands a person moves through',
  },
] as const

export type DiagramKind = (typeof DIAGRAM_KINDS)[number]['id']

export function projectOverviewPrompt(input: {
  projectName: string
  description: string
  diagrams: readonly DiagramKind[]
}): string {
  const chosen = DIAGRAM_KINDS.filter((kind) => input.diagrams.includes(kind.id))
  const asks = (chosen.length ? chosen : DIAGRAM_KINDS.slice(0, 1)).map((kind) => `- ${kind.ask}`)
  const description = input.description.trim()
  return [
    `Give me an overview of the project "${input.projectName}" with diagrams.`,
    '',
    description
      ? `Here is how I describe it:\n\n${description}\n\nCheck this against the code and say where they differ.`
      : 'Read the project folder (its README, manifests and main source directories) and work out what it does.',
    '',
    'Then write:',
    '1. A short summary of what the project is and how it is built.',
    '2. These diagrams, each in its own ```mermaid fence:',
    ...asks,
    '3. A few lines under each diagram on what it shows.',
    '',
    'Keep node labels short and name real modules, files or services from the project.',
  ].join('\n')
}
