import { readdirSync, type Dirent } from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git'])

/**
 * Expand `*`, `?`, and `**` globs. Paths without a glob character are
 * returned unchanged so a missing file can be reported by the caller.
 * `**` does not descend into `node_modules` or `.git`.
 * Results are sorted and relative to the current directory when the
 * pattern was relative.
 */
export function expandInputs(inputs: readonly string[]): string[] {
  const files: string[] = []
  for (const input of inputs) {
    if (!hasMeta(input)) {
      files.push(input)
      continue
    }
    const matches = glob(input)
    if (matches.length === 0) {
      throw new Error(`no files match ${input}`)
    }
    files.push(...matches)
  }
  return files
}

function hasMeta(input: string): boolean {
  return /[*?[\]]/.test(input)
}

function glob(pattern: string): string[] {
  const normalized = pattern.split(path.sep).join('/').replace(/^\.\//, '')
  const absolute = normalized.startsWith('/')
  const parts = normalized.split('/').filter((part) => part.length > 0)
  const root = absolute ? path.parse(pattern).root : process.cwd()
  const acc: string[] = []
  walk(root, parts, acc)
  acc.sort((a, b) => a.localeCompare(b))
  if (absolute) return acc
  return acc.map((file) => path.relative(process.cwd(), file))
}

function walk(dir: string, parts: string[], acc: string[]): void {
  const head = parts[0]
  if (head === undefined) return
  const rest = parts.slice(1)

  if (head === '**') {
    if (rest.length === 0) {
      addAll(dir, acc)
      return
    }
    walk(dir, rest, acc)
    for (const entry of read(dir)) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), parts, acc)
    }
    return
  }

  const matcher = segmentToRegExp(head)
  const wildcard = head.includes('*') || head.includes('?')
  for (const entry of read(dir)) {
    if (wildcard && SKIP_DIRS.has(entry.name)) continue
    if (!matcher.test(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (rest.length === 0) {
      if (entry.isFile()) acc.push(full)
    } else if (entry.isDirectory()) {
      walk(full, rest, acc)
    }
  }
}

function addAll(dir: string, acc: string[]): void {
  for (const entry of read(dir)) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isFile()) acc.push(full)
    else if (entry.isDirectory()) addAll(full, acc)
  }
}

function read(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function segmentToRegExp(segment: string): RegExp {
  let source = '^'
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]
    if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else if (char === '[') {
      const end = segment.indexOf(']', i + 1)
      if (end === -1) source += '\\['
      else {
        source += segment.slice(i, end + 1)
        i = end
      }
    } else {
      source += char.replace(/[\\^$.|+(){}]/g, '\\$&')
    }
  }
  source += '$'
  return new RegExp(source)
}
