import { TocError } from './errors.js'
import { resolveOptions } from './options.js'
import { parseDocument, toHeading, type ParsedHeading } from './parse.js'
import { renderToc } from './render.js'
import type { TocOptions, TocResult } from './types.js'
import { boldLine, joinLines, splitLines, type Lined } from './text.js'

const OPEN = /^ {0,3}<!--[ \t]*toc[ \t]*-->[ \t]*$/i
const CLOSE = /^ {0,3}<!--[ \t]*tocstop[ \t]*-->[ \t]*$/i

interface MarkerPair {
  /** 1-based line of `<!-- toc -->`. */
  openLine: number
  /** 1-based line of `<!-- tocstop -->`. */
  closeLine: number
}

/**
 * Rewrite every `<!-- toc -->` … `<!-- tocstop -->` block.
 *
 * Headings above the first marker are omitted from the list unless
 * `includeAbove` is set. They still receive anchors, in document order,
 * so a later duplicate links to the same id GitHub generates.
 * Headings between the markers are ignored: that region is replaced, and
 * counting them would make the next run produce a different list.
 *
 * The returned string keeps the input's newline style and BOM. When the
 * TOC is already in the canonical form, `changed` is false and `markdown`
 * is the original string.
 */
export function updateToc(markdown: string, options?: TocOptions): TocResult {
  const opts = resolveOptions(options)
  let source = markdown
  let inserted = false

  for (let pass = 0; pass < 2; pass++) {
    const parsed = parseDocument(source, { keepFrontMatter: opts.keepFrontMatter })
    const markers = findMarkers(source, parsed.obscured)

    if (markers.length === 0) {
      if (!opts.insert || inserted) {
        throw new TocError(
          'no <!-- toc --> / <!-- tocstop --> block. Add the markers, or pass --insert',
          'missing-markers',
        )
      }
      let after = parsed.headings[0]?.endLine ?? 0
      if (after < parsed.frontMatterEnd) after = parsed.frontMatterEnd
      source = insertMarkers(source, after)
      inserted = true
      continue
    }

    const headings = headingsOutsideMarkers(source, markers, opts.keepFrontMatter)
    const firstOpen = markers[0]?.openLine ?? 1
    const listed = headings.filter((heading) => {
      if (heading.depth < opts.minDepth || heading.depth > opts.maxDepth) return false
      if (!opts.includeAbove && heading.line <= firstOpen) return false
      return true
    })

    const next = applyMarkers(source, markers, blockLines(renderToc(listed, opts), opts.title))
    return {
      markdown: next,
      changed: next !== markdown,
      headings: headings.map(toHeading),
    }
  }

  throw new TocError(
    'no <!-- toc --> / <!-- tocstop --> block. Add the markers, or pass --insert',
    'missing-markers',
  )
}

export function findMarkers(source: string, obscured: ReadonlySet<number>): MarkerPair[] {
  const { lines } = splitLines(source)
  const pairs: MarkerPair[] = []
  let openLine: number | null = null

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1
    if (obscured.has(lineNumber)) continue
    const line = lines[index] ?? ''
    const opens = OPEN.test(line)
    const closes = CLOSE.test(line)
    if (!opens && !closes) continue

    if (opens) {
      if (openLine !== null) {
        throw new TocError(
          `line ${lineNumber}: nested <!-- toc --> (the block on line ${openLine} is still open)`,
          'nested-marker',
        )
      }
      openLine = lineNumber
      continue
    }

    if (openLine === null) {
      throw new TocError(
        `line ${lineNumber}: <!-- tocstop --> without a matching <!-- toc -->`,
        'stray-close',
      )
    }
    pairs.push({ openLine, closeLine: lineNumber })
    openLine = null
  }

  if (openLine !== null) {
    throw new TocError(
      `line ${openLine}: <!-- toc --> is missing <!-- tocstop -->`,
      'unclosed-marker',
    )
  }
  return pairs
}

/**
 * Parse a copy of the document whose TOC interiors are blank, so a heading
 * that is about to be deleted cannot take an anchor.
 */
function headingsOutsideMarkers(
  source: string,
  markers: readonly MarkerPair[],
  keepFrontMatter: boolean,
): ParsedHeading[] {
  const lined = splitLines(source)
  for (const pair of markers) {
    const start = pair.openLine
    const end = pair.closeLine - 1
    for (let index = start; index < end && index < lined.lines.length; index++) {
      lined.lines[index] = ''
    }
  }
  return parseDocument(joinLines(lined), { keepFrontMatter }).headings
}

function blockLines(list: string, title: string | undefined): string[] {
  if (!list && !title) return []
  const lines: string[] = ['']
  if (title) lines.push(boldLine(title))
  if (title && list) lines.push('')
  if (list) lines.push(...list.split('\n'))
  lines.push('')
  return lines
}

/**
 * `afterLine` is the 1-based line to insert after. Zero inserts at the top.
 * Surrounding blank lines are added only where the neighbours aren't blank,
 * so a second run is not required to clean up the gap.
 */
export function insertMarkers(source: string, afterLine: number): string {
  const lined = splitLines(source)
  const index = afterLine <= 0 ? -1 : afterLine - 1
  const next = lined.lines[index + 1]
  const pieces = ['<!-- toc -->', '', '<!-- tocstop -->']
  if (index >= 0 && (lined.lines[index] ?? '') !== '') pieces.unshift('')
  if (next !== '') pieces.push('')
  lined.lines.splice(index + 1, 0, ...pieces)
  return joinLines(lined)
}

function applyMarkers(source: string, markers: readonly MarkerPair[], block: readonly string[]): string {
  const lined: Lined = splitLines(source)
  const ordered = [...markers].sort((a, b) => b.openLine - a.openLine)
  for (const pair of ordered) {
    // Interior indexes: the line after the opener through the line before the closer.
    const start = pair.openLine
    const end = pair.closeLine - 1
    lined.lines.splice(start, Math.max(0, end - start), ...block)
  }
  return joinLines(lined)
}
