import { expect, test } from 'bun:test'
import { screenPrompt } from './screen-prompt'

// Screens captured from Claude Code 2.1.330 in an 80-column terminal.
const RULE = '─'.repeat(80)

const TRUST = `
${RULE}
 Accessing workspace:

 D:\\work\\shop

 Quick safety check: Is this a project you created or one you trust? (Like your
 own code, a well-known open source project, or work from your team). If not,
 take a moment to review what's in this folder first.

 Claude Code'll be able to read, edit, and execute files here.

 Security guide

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel`

const PERMISSION = `
❯ Run this exact shell command with the Bash tool: echo hi > out.txt

● Writing hi to out.txt
  ⎿  $ echo hi > out.txt

${RULE}
 Bash command
 Write hi to out.txt
${'╌'.repeat(80)}
 echo hi > out.txt
${'╌'.repeat(80)}
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to
      C:\\Users\\me\\work from this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No

 Esc to cancel · Tab to amend`

const LOGIN = `
${'▔'.repeat(80)}
  Login

  Claude Code can be used with your Claude subscription or billed based on API
  usage through your Console account.

  Select login method:

  ❯ 1. Claude account with subscription · Individual, Team, or Enterprise
    2. Anthropic Console account · API usage billing
    3. 3rd-party platform · Bedrock, Microsoft Foundry, Google Vertex AI

  Esc to cancel`

const IDLE_WITH_REPLY = `
 ▐▛███▛█   Claude Code v2.1.330

❯ say only the word pong

● pong

${RULE}
❯
${RULE}
  ⏵⏵ auto mode on (shift+tab to cycle)`

const SLASH_COMPLETION = `
  ❯ /login                          Sign in with your Anthropic account
    /design-login                   Authorize design-system access for
                                    /design-sync with your claude.ai account
${RULE}
❯ /login
${RULE}`

test('folder trust is a choice whose highlighted answer is the one that exits', () => {
  expect(screenPrompt(TRUST, 80)).toEqual({
    kind: 'choice',
    question: [
      'Accessing workspace:',
      '',
      'D:\\work\\shop',
      '',
      'Quick safety check: Is this a project you created or one you trust? (Like your',
      'own code, a well-known open source project, or work from your team). If not,',
      "take a moment to review what's in this folder first.",
      '',
      "Claude Code'll be able to read, edit, and execute files here.",
      '',
      'Security guide',
    ],
    options: [
      { label: 'No, exit', selected: true },
      { label: 'Yes, I trust this folder', selected: false },
    ],
  })
})

test('a permission keeps the command it asks about, and a wrapped answer stays one answer', () => {
  const prompt = screenPrompt(PERMISSION, 80)
  expect(prompt?.question).toContain('echo hi > out.txt')
  expect(prompt?.question.at(-1)).toBe('Do you want to proceed?')
  expect(prompt?.options.map((option) => option.label)).toEqual([
    '1. Yes',
    '2. Yes, and always allow access to C:\\Users\\me\\work from this project',
    '3. Yes, and switch to auto mode · auto mode handles these prompts for you',
    '4. No',
  ])
  expect(prompt?.options[0]?.selected).toBe(true)
})

test('the login method menu is a choice', () => {
  const prompt = screenPrompt(LOGIN, 80)
  expect(prompt?.kind).toBe('choice')
  expect(prompt?.question.at(-1)).toBe('Select login method:')
  expect(prompt?.options).toHaveLength(3)
})

test('the login code request asks for text and carries the whole wrapped link', () => {
  const url =
    'https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=' + 'x'.repeat(130)
  const screen = `
${'▔'.repeat(80)}
  Login

  Browser didn't open? Use the url below to sign in (c to copy)

${url.slice(0, 80)}
${url.slice(80, 160)}
${url.slice(160)}

  Paste code here if prompted >`
  expect(screenPrompt(screen, 80)).toEqual({
    kind: 'text',
    question: [
      'Login',
      '',
      "Browser didn't open? Use the url below to sign in (c to copy)",
      '',
      url.slice(0, 80),
      url.slice(80, 160),
      url.slice(160),
      '',
      'Paste code here if prompted >',
    ],
    options: [],
    url,
  })
})

test('an agent at its message box, or offering slash command completions, asks nothing', () => {
  expect(screenPrompt(IDLE_WITH_REPLY, 80)).toBeNull()
  expect(screenPrompt(SLASH_COMPLETION, 80)).toBeNull()
})
