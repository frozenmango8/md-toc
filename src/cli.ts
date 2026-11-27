#!/usr/bin/env node
import { createRequire } from 'node:module'
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { TocError } from './errors.js'
import { expandInputs } from './files.js'
import type { Bullet, TocOptions } from './types.js'
import { updateToc } from './update.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const HELP = `md-toc — GitHub-compatible tables of contents for Markdown

Usage:
  md-toc [options] <file>...

The table of contents is written between these markers, in place:

  <!-- toc -->
  <!-- tocstop -->

Headings above the first marker are left out of the list. They still count
toward duplicate anchors, so every link matches the id GitHub generates.
Run the command again after headings change. A file that is already current
is not rewritten.

Options:
  -d, --max-depth <1-6>   Deepest heading to include (default 6)
      --min-depth <1-6>   Shallowest heading to include (default 1)
      --bullet <-|*|+>    List marker (default -)
      --title <text>      Single-line title, rendered in bold above the list
      --include-above     Also list headings that sit above the first marker
      --keep-front-matter Parse a leading YAML or TOML block as Markdown
      --insert            Add markers after the first heading when they are missing
  -c, --check             Exit 1 when a TOC is missing or stale. Write nothing
      --stdout            Print the updated Markdown instead of writing the file
      --stdin             Read Markdown from stdin and write the result to stdout
  -q, --quiet             Print only errors and stale files
  -h, --help              Show this help
  -v, --version           Print the version

Exit codes:
  0  Updated, already current, or --check passed
  1  A TOC is stale or missing, or the markers are malformed
  2  Bad usage, or a file could not be read or written

Examples:
  md-toc README.md
  md-toc --max-depth 3 "docs/**/*.md"
  md-toc --check README.md CONTRIBUTING.md
  md-toc --insert --title Contents README.md
`

class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

interface Args {
  files: string[]
  help: boolean
  version: boolean
  check: boolean
  stdout: boolean
  stdin: boolean
  quiet: boolean
  options: TocOptions
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return 0
  }
  if (args.version) {
    process.stdout.write(`${version}\n`)
    return 0
  }
  if (args.check && args.stdout) {
    throw new UsageError('--check and --stdout cannot be used together')
  }
  if (args.stdin && args.files.length > 0) {
    throw new UsageError('pass files or --stdin, not both')
  }
  if (!args.stdin && args.files.length === 0) {
    process.stderr.write(HELP)
    return 2
  }

  if (args.stdin) return runStdin(args)

  let expanded: string[]
  try {
    expanded = expandInputs(args.files)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    return 2
  }
  const files = dedupe(expanded)
  if (args.stdout && files.length !== 1) {
    throw new UsageError('--stdout accepts a single file. Omit it to update files in place')
  }

  let code = 0
  const stale: string[] = []
  for (const file of files) {
    try {
      const result = await runFile(file, args)
      if (result === 'stale') stale.push(file)
    } catch (error) {
      code = Math.max(code, report(file, error))
    }
  }
  if (stale.length > 0) {
    code = Math.max(code, 1)
    if (args.check) {
      const noun = stale.length === 1 ? 'file is' : 'files are'
      process.stderr.write(`md-toc --check: ${stale.length} ${noun} out of date\n`)
    }
  }
  return code
}

async function runStdin(args: Args): Promise<number> {
  if (process.stdin.isTTY) {
    throw new UsageError('stdin is a terminal. Pass a file, or pipe Markdown in')
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const input = Buffer.concat(chunks).toString('utf8')
  let output: string
  let changed: boolean
  try {
    const result = updateToc(input, args.options)
    output = result.markdown
    changed = result.changed
  } catch (error) {
    return report('stdin', error)
  }
  if (args.check) {
    if (!changed) return 0
    process.stderr.write('stdin: TOC is out of date\n')
    return 1
  }
  process.stdout.write(output)
  return 0
}

type FileOutcome = 'updated' | 'unchanged' | 'stale'

async function runFile(file: string, args: Args): Promise<FileOutcome> {
  let info
  try {
    info = await stat(file)
  } catch (error) {
    throw ioError(file, error)
  }
  if (info.isDirectory()) {
    throw new UsageError(
      `${file} is a directory. Pass a Markdown file, or a glob such as "${file}/**/*.md"`,
    )
  }

  const input = await readFile(file, 'utf8')
  if (input.includes('\0')) {
    throw new UsageError(`${file} is not a text file`)
  }
  const result = updateToc(input, args.options)

  if (args.check) {
    if (!result.changed) {
      note(args, `current ${file}`)
      return 'unchanged'
    }
    process.stderr.write(`stale ${file}\n`)
    return 'stale'
  }

  if (args.stdout) {
    process.stdout.write(result.markdown)
    return result.changed ? 'updated' : 'unchanged'
  }

  if (!result.changed) {
    note(args, `unchanged ${file}`)
    return 'unchanged'
  }

  await writeAtomic(file, result.markdown)
  note(args, `updated ${file}`)
  return 'updated'
}

function note(args: Args, message: string): void {
  if (!args.quiet) process.stderr.write(`${message}\n`)
}

async function writeAtomic(file: string, contents: string): Promise<void> {
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.md-toc-tmp`,
  )
  try {
    await writeFile(tmp, contents)
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true })
    throw ioError(file, error)
  }
}

function ioError(file: string, error: unknown): Error {
  if (isErrno(error, 'ENOENT')) return new UsageError(`${file}: no such file`)
  if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) {
    return new UsageError(`${file}: permission denied`)
  }
  if (error instanceof Error) return error
  return new Error(String(error))
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  )
}

function report(where: string, error: unknown): number {
  if (error instanceof TocError) {
    const prefix = error.code === 'invalid-option' ? '' : `${where}: `
    process.stderr.write(`${prefix}${error.message}\n`)
    return error.code === 'invalid-option' ? 2 : 1
  }
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`)
    return 2
  }
  if (error instanceof Error) process.stderr.write(`${where}: ${error.message}\n`)
  else process.stderr.write(`${where}: ${String(error)}\n`)
  return 2
}

function dedupe(files: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const file of files) {
    const key = path.resolve(file)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    files: [],
    help: false,
    version: false,
    check: false,
    stdout: false,
    stdin: false,
    quiet: false,
    options: {},
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? ''
    if (token === '--') {
      args.files.push(...argv.slice(i + 1))
      break
    }
    if (token === '-h' || token === '--help') {
      args.help = true
      continue
    }
    if (token === '-v' || token === '--version') {
      args.version = true
      continue
    }
    if (token === '-c' || token === '--check') {
      args.check = true
      continue
    }
    if (token === '-q' || token === '--quiet') {
      args.quiet = true
      continue
    }
    if (token === '--stdout') {
      args.stdout = true
      continue
    }
    if (token === '--stdin' || token === '-') {
      args.stdin = true
      continue
    }
    if (token === '--insert') {
      args.options.insert = true
      continue
    }
    if (token === '--include-above') {
      args.options.includeAbove = true
      continue
    }
    if (token === '--keep-front-matter') {
      args.options.keepFrontMatter = true
      continue
    }
    if (token === '-d' || token === '--max-depth' || token.startsWith('--max-depth=')) {
      args.options.maxDepth = readDepth(token, valueOf(argv, token, i))
      if (!token.includes('=')) i++
      continue
    }
    if (token === '--min-depth' || token.startsWith('--min-depth=')) {
      args.options.minDepth = readDepth(token, valueOf(argv, token, i))
      if (!token.includes('=')) i++
      continue
    }
    if (token === '--bullet' || token.startsWith('--bullet=')) {
      const value = valueOf(argv, token, i)
      if (value !== '-' && value !== '*' && value !== '+') {
        throw new UsageError('--bullet must be -, *, or +')
      }
      args.options.bullet = value as Bullet
      if (!token.includes('=')) i++
      continue
    }
    if (token === '--title' || token.startsWith('--title=')) {
      args.options.title = valueOf(argv, token, i)
      if (!token.includes('=')) i++
      continue
    }
    if (token.startsWith('-')) throw new UsageError(`unknown option: ${token}`)
    args.files.push(token)
  }
  return args
}

function valueOf(argv: readonly string[], token: string, index: number): string {
  const eq = token.indexOf('=')
  if (eq !== -1) return token.slice(eq + 1)
  const next = argv[index + 1]
  if (next === undefined || next.startsWith('-')) {
    const name = token.startsWith('--') ? token : token
    throw new UsageError(`${name} needs a value`)
  }
  return next
}

function readDepth(flag: string, raw: string): number {
  if (!/^[1-6]$/.test(raw)) {
    const name = flag.startsWith('--min') ? '--min-depth' : '--max-depth'
    throw new UsageError(`${name} must be an integer from 1 to 6`)
  }
  return Number(raw)
}

// This file is the executable. npm links it through a symlink in
// node_modules/.bin, so argv[1] is not import.meta.url and a path
// comparison would skip main entirely. The library entry is index.ts.
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    if (error instanceof UsageError || error instanceof TocError) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = error instanceof TocError && error.code !== 'invalid-option' ? 1 : 2
      return
    }
    console.error(error)
    process.exitCode = 2
  })
