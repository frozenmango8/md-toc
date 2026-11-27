import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'src/cli.ts')
const loader = path.join(root, 'node_modules/tsx/dist/loader.mjs')

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

function run(args: string[], opts: { cwd?: string; input?: string } = {}): RunResult {
  const result = spawnSync(process.execPath, ['--import', loader, cli, ...args], {
    cwd: opts.cwd ?? root,
    input: opts.input,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'md-toc-'))
}

describe('cli', () => {
  it('prints help and the version', () => {
    const help = run(['--help'])
    assert.equal(help.status, 0)
    assert.match(help.stdout, /<!-- toc -->/)
    assert.match(help.stdout, /--check/)

    const version = run(['--version'])
    assert.equal(version.status, 0)
    assert.equal(version.stdout, '1.0.0\n')
  })

  it('exits 2 on bad usage', () => {
    assert.equal(run(['--nope']).status, 2)
    assert.equal(run([]).status, 2)
    assert.equal(run(['--max-depth', '9']).status, 2)
    assert.equal(run(['--check', '--stdout', 'README.md']).status, 2)
    const missing = run(['missing-file.md'])
    assert.equal(missing.status, 2)
    assert.match(missing.stderr, /no such file/)
  })

  it('updates a file in place and does not touch it again', () => {
    const dir = tempDir()
    const file = path.join(dir, 'doc.md')
    writeFileSync(file, '# Title\n\n<!-- toc -->\n<!-- tocstop -->\n\n## Install\n')
    const first = run([file])
    assert.equal(first.status, 0)
    assert.match(first.stderr, /updated /)
    const written = readFileSync(file, 'utf8')
    assert.match(written, /- \[Install\]\(#install\)/)

    const old = new Date('2020-01-01T00:00:00Z')
    utimesSync(file, old, old)
    const second = run([file])
    assert.equal(second.status, 0)
    assert.match(second.stderr, /unchanged /)
    assert.equal(statSync(file).mtimeMs, old.getTime())
    assert.equal(readFileSync(file, 'utf8'), written)
  })

  it('--check fails without writing when the TOC is stale or missing', () => {
    const dir = tempDir()
    const stale = path.join(dir, 'stale.md')
    const original = '<!-- toc -->\n\n- [Old](#old)\n\n<!-- tocstop -->\n\n## New\n'
    writeFileSync(stale, original)
    const checked = run(['--check', stale])
    assert.equal(checked.status, 1)
    assert.match(checked.stderr, /stale /)
    assert.match(checked.stderr, /out of date/)
    assert.equal(readFileSync(stale, 'utf8'), original)

    const fresh = run(['--check', stale.replace(/stale\.md$/, 'nope')])
    assert.equal(fresh.status, 2)

    const bare = path.join(dir, 'bare.md')
    writeFileSync(bare, '# Title\n')
    const missing = run(['--check', bare])
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /no <!-- toc -->/)
    assert.equal(readFileSync(bare, 'utf8'), '# Title\n')
  })

  it('--check passes once the file is current', () => {
    const dir = tempDir()
    const file = path.join(dir, 'doc.md')
    writeFileSync(file, '<!-- toc -->\n<!-- tocstop -->\n\n## One\n')
    assert.equal(run([file]).status, 0)
    const checked = run(['--check', '--quiet', file])
    assert.equal(checked.status, 0)
    assert.equal(checked.stderr, '')
  })

  it('reads stdin and can check it without echoing the document', () => {
    const input = '<!-- toc -->\n<!-- tocstop -->\n\n## Piped\n'
    const written = run(['--stdin'], { input })
    assert.equal(written.status, 0)
    assert.match(written.stdout, /- \[Piped\]\(#piped\)/)

    const stale = run(['--check', '--stdin'], { input: '<!-- toc -->\n<!-- tocstop -->\n\n## Piped\n' })
    assert.equal(stale.status, 1)
    assert.equal(stale.stdout, '')

    const current = run(['--check', '-'], { input: written.stdout })
    assert.equal(current.status, 0)
  })

  it('prints with --stdout and does not write', () => {
    const dir = tempDir()
    const file = path.join(dir, 'doc.md')
    const original = '<!-- toc -->\n<!-- tocstop -->\n\n## Screen\n'
    writeFileSync(file, original)
    const result = run(['--stdout', file])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /- \[Screen\]\(#screen\)/)
    assert.equal(readFileSync(file, 'utf8'), original)
  })

  it('expands a glob and skips node_modules', () => {
    const dir = tempDir()
    mkdirSync(path.join(dir, 'sub'))
    mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true })
    const doc = '<!-- toc -->\n<!-- tocstop -->\n\n## Item\n'
    writeFileSync(path.join(dir, 'root.md'), doc)
    writeFileSync(path.join(dir, 'sub', 'nested.md'), doc)
    writeFileSync(path.join(dir, 'node_modules', 'pkg', 'skip.md'), doc)
    writeFileSync(path.join(dir, 'notes.txt'), 'nope')

    const result = run(['**/*.md'], { cwd: dir })
    assert.equal(result.status, 0, result.stderr)
    assert.match(readFileSync(path.join(dir, 'root.md'), 'utf8'), /- \[Item\]\(#item\)/)
    assert.match(readFileSync(path.join(dir, 'sub', 'nested.md'), 'utf8'), /- \[Item\]\(#item\)/)
    assert.equal(readFileSync(path.join(dir, 'node_modules', 'pkg', 'skip.md'), 'utf8'), doc)
    assert.match(result.stderr, /root\.md/)
    assert.match(result.stderr, /sub\/nested\.md|sub\\nested\.md/)
    assert.doesNotMatch(result.stderr, /skip\.md/)
  })

  it('rejects a directory and a glob that matches nothing', () => {
    const dir = tempDir()
    assert.equal(run([dir]).status, 2)
    assert.match(run([dir]).stderr, /directory/)
    const none = run(['**/*.md'], { cwd: dir })
    assert.equal(none.status, 2)
    assert.match(none.stderr, /no files match/)
  })

  it('runs through a symlink the way an npm bin does', () => {
    const dir = tempDir()
    const link = path.join(dir, 'md-toc')
    symlinkSync(cli, link)
    const result = run(['--version'], { cwd: dir })
    // `run` invokes the real source path. Also invoke the symlink itself.
    const linked = spawnSync(process.execPath, ['--import', loader, link, '--version'], {
      cwd: dir,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0)
    assert.equal(linked.status, 0, linked.stderr)
    assert.equal(linked.stdout, '1.0.0\n')

    const built = path.join(root, 'dist/cli.js')
    try {
      statSync(built)
    } catch {
      return
    }
    const builtLink = path.join(dir, 'md-toc-built')
    symlinkSync(built, builtLink)
    const fromBin = spawnSync(process.execPath, [builtLink, '--version'], {
      cwd: dir,
      encoding: 'utf8',
    })
    assert.equal(fromBin.status, 0, fromBin.stderr)
    assert.equal(fromBin.stdout, '1.0.0\n')
  })

  it('--insert adds markers and --quiet stays quiet on success', () => {
    const dir = tempDir()
    const file = path.join(dir, 'doc.md')
    writeFileSync(file, '# Title\n\n## Body\n')
    const result = run(['--quiet', '--insert', file])
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    assert.match(readFileSync(file, 'utf8'), /<!-- toc -->\n\n- \[Body\]\(#body\)\n\n<!-- tocstop -->/)
  })
})
