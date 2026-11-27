import { resolveOptions } from './options.js'
import type { Heading, TocOptions } from './types.js'
import { linkLabel } from './text.js'

/**
 * Render a bullet list. Indentation is relative to the shallowest heading
 * in the list, so a document that starts at `##` does not look nested.
 * Pass the headings you want listed; depth options filter further.
 */
export function renderToc(headings: readonly Heading[], options?: TocOptions): string {
  const opts = resolveOptions(options)
  const included = headings.filter(
    (heading) => heading.depth >= opts.minDepth && heading.depth <= opts.maxDepth,
  )
  if (included.length === 0) return ''

  const base = Math.min(...included.map((heading) => heading.depth))
  return included
    .map((heading) => {
      const indent = '  '.repeat(heading.depth - base)
      return `${indent}${opts.bullet} [${linkLabel(heading.text)}](#${heading.slug})`
    })
    .join('\n')
}
