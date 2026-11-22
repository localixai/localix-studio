import { promises as fs } from 'node:fs'
import { expect } from '@playwright/test'
import { openConversation } from './fixture-chat.mjs'
import { fixtureFile, uiOrigin } from './runtime.mjs'
import { seedTranscript } from './transcript-fixture.mjs'

const TITLE = 'Formulas fixture'
const QUESTION = 'Why does cross-entropy suit a softmax output?'

/**
 * A reply that mixes inline and display math: fractions, sums, scripts, an operator name, a brace
 * under a term, labelled arrows, a norm and a `cases` block. Illustrative fixture text; no model ran.
 */
const REPLY = String.raw`For one example with true class $y$ and predicted probabilities $p_i$, the loss is

$$
\mathcal{L} = -\sum_{i=1}^{K} y_i \log p_i, \qquad p_i = \frac{e^{z_i}}{\sum_{j=1}^{K} e^{z_j}}
$$

Its gradient with respect to the logits is the error itself, $\partial \mathcal{L} / \partial z_i = p_i - y_i$, so it never vanishes while the model is wrong:

$$
\frac{\partial \mathcal{L}}{\partial z} = \underbrace{p - y}_{\text{prediction minus truth}}
\qquad
z \xrightarrow{\ \operatorname{softmax}\ } p \xrightarrow{-\log} \mathcal{L}
$$

With squared error the same gradient carries a factor $p_i(1 - p_i)$, which is near zero when $p_i \to 0$ or $p_i \to 1$:

$$
\nabla_z \tfrac12 \lVert p - y \rVert^2 = J^\top (p - y), \quad
J_{ij} = \begin{cases} p_i (1 - p_i) & i = j \\ -p_i p_j & i \ne j \end{cases}
$$`

/** Every `$…$` and `$$…$$` in the reply: six inline formulas and three displayed ones. */
const FORMULAS = 9

const rows = [
  { role: 'user', content: QUESTION },
  {
    role: 'assistant',
    content: REPLY,
    items: [{ type: 'text', id: 'formulas-text', status: 'completed', text: REPLY }],
  },
]

/** Run by `seed.mjs` under Bun: it writes the transcript straight into the capture database. */
export async function seedFormulas(fixture) {
  fixture.formulasSessionId = await seedTranscript(fixture, {
    title: TITLE,
    label: 'formulas',
    idPrefix: 'capture-formulas',
    rows,
  })
}

export async function composeFormulas(page) {
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'))
  if (!fixture.formulasSessionId) throw new Error('Run screenshots:seed for the formulas fixture.')
  await page.goto(`${uiOrigin}/#/project/${fixture.projectId}/${fixture.formulasSessionId}`)
  await openConversation(page, TITLE)
  await page.getByText(QUESTION, { exact: true }).first().waitFor()
  // Math loads on first use; until then a formula is its source. Wait for every one to be typeset,
  // then for the math font the typeset formulas asked for.
  await expect(page.locator('.fd-math')).toHaveCount(FORMULAS, { timeout: 30_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

export async function verifyFormulas(page) {
  const formulas = page.locator('.fd-math')
  expect(await formulas.count()).toBeGreaterThanOrEqual(6)
  expect(await page.locator('.fd-math.fd-math-display').count()).toBeGreaterThanOrEqual(1)
  const shown = await page.evaluate(() => {
    // The reply is the nearest element that holds every formula.
    const maths = [...document.querySelectorAll('.fd-math')]
    let reply = maths[0]?.parentElement
    while (reply && !maths.every((math) => reply.contains(math))) reply = reply.parentElement
    if (!reply) return { source: ['no reply'], font: false }
    // A formula keeps its TeX in a MathML annotation, which is not drawn; any other text is shown.
    const walker = document.createTreeWalker(reply, NodeFilter.SHOW_TEXT)
    const source = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('annotation')) continue
      if (/\\frac|\$\$/.test(node.textContent)) source.push(node.textContent.trim())
    }
    // `check` also answers true when no face of the family exists, so the face must be loaded too.
    const face = [...document.fonts].some(
      (font) => font.family.replace(/["']/g, '') === 'Localix Math' && font.status === 'loaded',
    )
    return { source, font: face && document.fonts.check('16px "Localix Math"') }
  })
  expect(shown.source).toEqual([])
  expect(shown.font).toBe(true)
}
