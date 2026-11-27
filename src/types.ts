export type Bullet = '-' | '*' | '+'

export interface TocOptions {
  /** Deepest heading level to list. 1–6, default 6. */
  maxDepth?: number
  /** Shallowest heading level to list. 1–6, default 1. */
  minDepth?: number
  /** List marker. Default `-`. */
  bullet?: Bullet
  /**
   * Single-line label rendered in bold above the list.
   * It is not a heading, so it does not change anchors.
   */
  title?: string
  /**
   * List headings that sit above the first `<!-- toc -->` marker.
   * Default: those headings are omitted from the list (they still take anchors).
   */
  includeAbove?: boolean
  /**
   * Parse a leading YAML (`---`) or TOML (`+++`) block as Markdown.
   * Default: the block is ignored, so `title:` does not become a heading.
   * GitHub's own README view does the opposite; pass true to match it.
   */
  keepFrontMatter?: boolean
  /**
   * When no markers are present, insert a block after the first heading
   * (or at the top of the file when there is no heading).
   */
  insert?: boolean
}

/** A heading that received a GitHub anchor. */
export interface Heading {
  /** 1–6 */
  depth: number
  /** Visible heading text, with Markdown syntax removed. */
  text: string
  /** Anchor id without the leading `#`. May be empty. */
  slug: string
  /** 1-based line number of the heading. */
  line: number
}

export interface TocResult {
  /** The document with every TOC block rewritten. */
  markdown: string
  /** False when `markdown` is byte-for-byte identical to the input. */
  changed: boolean
  /**
   * Every heading that received a slug, in document order.
   * Includes headings that were left out of the list.
   */
  headings: Heading[]
}
