export interface Lined {
  bom: string
  newline: '\n' | '\r\n'
  lines: string[]
}

/** Split a document without dropping a trailing newline or a leading BOM. */
export function splitLines(source: string): Lined {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : ''
  const text = bom ? source.slice(1) : source
  const newline: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n'
  return { bom, newline, lines: text.split(/\r?\n/) }
}

export function joinLines(lined: Lined): string {
  return lined.bom + lined.lines.join(lined.newline)
}

/**
 * Make heading text safe as the label of a Markdown link.
 * Brackets and emphasis markers are escaped. `<` is escaped so a heading
 * like `Use <div>` cannot be read as raw HTML and break the link.
 */
export function linkLabel(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\*/g, '\\*')
}

/** Bold a single line without letting `*` inside it close the strong span. */
export function boldLine(text: string): string {
  return `**${text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*')}**`
}
