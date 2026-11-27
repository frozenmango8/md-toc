import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import GithubSlugger from 'github-slugger'
import type { Heading } from './types.js'
import { joinLines, splitLines } from './text.js'

/**
 * A node we walk ourselves. The GFM extensions add nodes (`footnoteReference`,
 * `delete`) that the base mdast unions don't always include, so the walker
 * stays structural.
 */
interface AnyNode {
  type: string
  value?: string
  identifier?: string
  depth?: number
  children?: AnyNode[]
  position?: {
    start: { line: number }
    end: { line: number }
  }
}

export interface ParsedHeading extends Heading {
  endLine: number
}

export interface ParsedDocument {
  headings: ParsedHeading[]
  /** Lines that cannot hold a TOC marker: code blocks, comment interiors, front matter. */
  obscured: Set<number>
  /** 1-based line of the closing front-matter fence, or 0 when there is none. */
  frontMatterEnd: number
}

export interface ParseOptions {
  keepFrontMatter?: boolean
}

/**
 * Headings in document order, with GitHub anchors.
 *
 * Slugs come from the heading's rendered text (emphasis, links and inline
 * code resolved; raw HTML tags and image alt text dropped) passed through
 * `github-slugger`. That is the text GitHub puts in the permalink. Duplicate
 * headings get `-1`, `-2`, … and a later heading whose own text is already
 * `intro-1` becomes `intro-1-1`.
 *
 * A leading YAML or TOML front matter block is blanked first unless
 * `keepFrontMatter` is set. GitHub's README renderer does not do this; doc
 * tools do, and a closing `---` would otherwise be a setext heading.
 */
export function extractHeadings(markdown: string, options: ParseOptions = {}): Heading[] {
  return parseDocument(markdown, options).headings.map(toHeading)
}

export function parseDocument(markdown: string, options: ParseOptions = {}): ParsedDocument {
  const masked = options.keepFrontMatter
    ? { text: markdown, endLine: 0 }
    : maskFrontMatter(markdown)
  const tree = parseMarkdown(masked.text)
  const obscured = new Set<number>()
  if (masked.endLine > 0) {
    for (let line = 1; line <= masked.endLine; line++) obscured.add(line)
  }
  collectObscured(tree, obscured)
  const numbers = footnoteNumbers(tree)
  const headings = collectHeadings(tree, numbers)
  return { headings, obscured, frontMatterEnd: masked.endLine }
}

export function toHeading(heading: ParsedHeading): Heading {
  return {
    depth: heading.depth,
    text: heading.text,
    slug: heading.slug,
    line: heading.line,
  }
}

function parseMarkdown(source: string): AnyNode {
  return fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as AnyNode
}

/**
 * Replace a leading front matter block with the same number of blank lines
 * so later line numbers stay put. Returns `endLine: 0` when there is no block.
 */
export function maskFrontMatter(source: string): { text: string; endLine: number } {
  const lined = splitLines(source)
  const first = lined.lines[0] ?? ''
  let close: RegExp | null = null
  if (/^---[ \t]*$/.test(first)) close = /^(?:---|\.\.\.)[ \t]*$/
  else if (/^\+\+\+[ \t]*$/.test(first)) close = /^\+\+\+[ \t]*$/
  if (!close) return { text: source, endLine: 0 }

  let end = -1
  for (let i = 1; i < lined.lines.length; i++) {
    if (close.test(lined.lines[i] ?? '')) {
      end = i
      break
    }
  }
  if (end === -1) return { text: source, endLine: 0 }

  for (let i = 0; i <= end; i++) lined.lines[i] = ''
  return { text: joinLines(lined), endLine: end + 1 }
}

function collectObscured(tree: AnyNode, obscured: Set<number>): void {
  visit(tree, (node) => {
    const start = node.position?.start.line
    const end = node.position?.end.line
    if (start === undefined || end === undefined) return
    if (node.type === 'code') {
      for (let line = start; line <= end; line++) obscured.add(line)
    } else if (node.type === 'html' && end > start) {
      // The comment's own first and last lines can still be markers.
      for (let line = start + 1; line < end; line++) obscured.add(line)
    }
  })
}

function footnoteNumbers(tree: AnyNode): Map<string, number> {
  const numbers = new Map<string, number>()
  let next = 1
  visit(tree, (node) => {
    if (node.type !== 'footnoteReference') return
    const id = node.identifier ?? ''
    if (!numbers.has(id)) numbers.set(id, next++)
  })
  return numbers
}

function collectHeadings(tree: AnyNode, numbers: Map<string, number>): ParsedHeading[] {
  const slugger = new GithubSlugger()
  const headings: ParsedHeading[] = []
  visit(tree, (node) => {
    if (node.type !== 'heading') return
    const depth = node.depth
    const position = node.position
    if (depth === undefined || position === undefined) return

    const into = { slug: '', display: '' }
    for (const child of node.children ?? []) collectText(child, into, numbers)
    const text = into.display.replace(/\r?\n/g, ' ').trim()
    if (text.length === 0) return

    headings.push({
      depth,
      text,
      slug: slugger.slug(into.slug),
      line: position.start.line,
      endLine: position.end.line,
    })
  })
  return headings
}

/**
 * Rebuild the string GitHub slugs, and the string we show in the TOC.
 * Footnote calls contribute their number to the anchor (`Hello[^1]` → `hello1`)
 * and nothing to the visible label. Newlines stay in the slug source because
 * GitHub deletes them rather than turning them into hyphens (`Foo\\nbar` → `foobar`).
 */
function collectText(
  node: AnyNode,
  into: { slug: string; display: string },
  numbers: Map<string, number>,
): void {
  if (node.type === 'text' || node.type === 'inlineCode') {
    const value = node.value ?? ''
    into.slug += value
    into.display += value
    return
  }
  if (node.type === 'footnoteReference') {
    const n = numbers.get(node.identifier ?? '')
    if (n !== undefined) into.slug += String(n)
    return
  }
  if (node.type === 'break') {
    into.slug += '\n'
    into.display += '\n'
    return
  }
  // html, image, and imageReference contribute nothing. GitHub's permalink is
  // the heading element's text content: tags are not part of it, and neither
  // is an image's alt text. Unknown tags such as <AppBar> are dropped;
  // allowed tags such as <em> and <kbd> keep their text, which is a sibling.
  for (const child of node.children ?? []) collectText(child, into, numbers)
}

function visit(node: AnyNode, fn: (node: AnyNode) => void): void {
  fn(node)
  for (const child of node.children ?? []) visit(child, fn)
}
