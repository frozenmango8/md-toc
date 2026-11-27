import { TocError } from './errors.js'
import type { Bullet, TocOptions } from './types.js'

export interface ResolvedOptions {
  maxDepth: number
  minDepth: number
  bullet: Bullet
  title?: string
  includeAbove: boolean
  keepFrontMatter: boolean
  insert: boolean
}

export function resolveOptions(input: TocOptions = {}): ResolvedOptions {
  const maxDepth = input.maxDepth ?? 6
  const minDepth = input.minDepth ?? 1
  assertDepth('maxDepth', maxDepth)
  assertDepth('minDepth', minDepth)
  if (minDepth > maxDepth) {
    throw new TocError('minDepth cannot be greater than maxDepth', 'invalid-option')
  }

  const bullet = input.bullet ?? '-'
  if (bullet !== '-' && bullet !== '*' && bullet !== '+') {
    throw new TocError('bullet must be -, *, or +', 'invalid-option')
  }

  let title = input.title
  if (title !== undefined) {
    if (/[\r\n]/.test(title)) {
      throw new TocError('title must be a single line', 'invalid-option')
    }
    title = title.trim()
    if (title.length === 0) title = undefined
  }

  const resolved: ResolvedOptions = {
    maxDepth,
    minDepth,
    bullet,
    includeAbove: input.includeAbove ?? false,
    keepFrontMatter: input.keepFrontMatter ?? false,
    insert: input.insert ?? false,
  }
  if (title !== undefined) resolved.title = title
  return resolved
}

function assertDepth(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new TocError(`${name} must be an integer from 1 to 6`, 'invalid-option')
  }
}
