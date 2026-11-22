/**
 * The parts of `flowdown` a page fetches the first time a document needs them. Each loader is
 * a module constant: `<Markdown>` keeps what a loader brought, by the loader, so a new function on
 * every render would load again.
 */

/** Formulas as MathML and the math font they are set in, for a document with `$…$`. */
export const loadMath = () =>
  import('@localix-ai/flowdown/math.css').then(() => import('@localix-ai/flowdown/math'))

/** Mermaid, for a ```mermaid fence; drawn one diagram at a time (`@localix-ai/flowdown/mermaid`). */
export const loadMermaid = () => import('mermaid')
