/**
 * The prompts of a "Plan your project" chat, one per step (`planFlow.ts`). The chat runs in Plan
 * mode — it may read the project but change only its own state — so until the person approves
 * the plan the agent plans and describes, never sets up or writes code. Each step names one tool
 * and shows one example call: a small local model handed every step at once skipped tools.
 */

/** Loaded for the chat before its first run, so no model has to go looking for them. */
export const PLANNING_TOOLS = ['kanban', 'space_read', 'space_apply', 'space_view'] as const

export const PLAN_KICKOFF = [
  "Let's plan my project together. Plan and describe only: do not write, create or change any code or project files, and do not set the project up.",
  '',
  "1. If you need to know more — what it is, who it is for, what exists, goals, deadlines — ask me a few short questions. If I've already said enough, skip this.",
  '2. Then write the plan as Markdown in your reply, under these headings:',
  '   `## Overview` (two or three sentences), `## Goals`, `## Milestones` (in order, each `### M1: Name` with its tasks as `- [ ]` lines), `## Risks and open questions`.',
  '',
  'Do not call any tools yet. Next I will ask you to draw this plan in Project Space, then to put its tasks on the Kanban board.',
].join('\n')

/** The kickoff with what the person already wrote about the project, when they wrote it first. */
export function planKickoff(project: string): string {
  const said = project.trim()
  return said ? `${PLAN_KICKOFF}\n\nMy project:\n${said}` : PLAN_KICKOFF
}

export const DRAW_PROMPT = [
  'Draw the plan you wrote as a flow map in Project Space. Call the `space_apply` tool now, once, with every shape and arrow:',
  'an `ellipse` for Start and for Launch, a `rectangle` for each milestone (its name and its tasks as short lines), a `diamond` for each decision, and `connect` arrows in order. For example:',
  '{ "ops": [ { "op": "create", "type": "shape", "id": "start", "text": "Start", "props": { "kind": "ellipse" } }, { "op": "create", "type": "shape", "id": "m1", "text": "M1: Foundation\\n- Set up the repo", "props": { "kind": "rectangle" } }, { "op": "connect", "from": "start", "to": "m1" } ] }',
  'Call the tool; do not print its input as text. Then say in one line what you drew.',
].join('\n')

export const BOARD_PROMPT = [
  'Now put the plan on the Kanban board. Call the `kanban` tool now, once, with every milestone and task:',
  'each milestone an epic (an epic takes no items), each task under its milestone with a checklist of concrete steps in its items. For example:',
  '{ "action": "create", "creates": [ { "title": "M1: Foundation", "kind": "epic" }, { "title": "Set up the repo", "kind": "task", "parent": "M1: Foundation", "items": ["Create the repo", "Add the build"] } ] }',
  'Call the tool; do not print its input as text. Then say in one line how many epics and tasks you added.',
].join('\n')

export const START_PROMPT = [
  'I approve the plan. Start the work now, from the Kanban board, in order:',
  'take the first task, move it to in progress, do it, then move it to done and go on to the next. Tell me before anything risky, and stop to ask when a task needs a decision from me.',
].join('\n')
