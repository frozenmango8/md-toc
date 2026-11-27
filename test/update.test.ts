import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TocError } from '../src/errors.js'
import { renderToc } from '../src/render.js'
import { extractHeadings } from '../src/parse.js'
import { updateToc } from '../src/update.js'

function toc(body: string): string {
  return `<!-- toc -->\n\n${body}\n\n<!-- tocstop -->`
}

describe('updateToc', () => {
  it('writes a list between the markers and leaves the rest of the file alone', () => {
    const input = [
      '# Title',
      '',
      'Intro with two trailing spaces  ',
      '',
      '<!-- toc -->',
      '<!-- tocstop -->',
      '',
      '## Install',
      '',
      '### npm',
      '',
      '## Usage',
      '',
    ].join('\n')
    const result = updateToc(input)
    assert.equal(
      result.markdown,
      [
        '# Title',
        '',
        'Intro with two trailing spaces  ',
        '',
        toc(['- [Install](#install)', '  - [npm](#npm)', '- [Usage](#usage)'].join('\n')),
        '',
        '## Install',
        '',
        '### npm',
        '',
        '## Usage',
        '',
      ].join('\n'),
    )
    assert.equal(result.changed, true)
    assert.deepEqual(
      result.headings.map((heading) => heading.slug),
      ['title', 'install', 'npm', 'usage'],
    )
  })

  it('is idempotent, including when the file uses CRLF', () => {
    const input = ['# Title', '', '<!-- toc -->', '<!-- tocstop -->', '', '## One', ''].join('\r\n')
    const once = updateToc(input)
    const twice = updateToc(once.markdown)
    assert.equal(twice.markdown, once.markdown)
    assert.equal(twice.changed, false)
    assert.equal(once.markdown.replace(/\r\n/g, '').includes('\n'), false)
  })

  it('returns the same string when nothing would change', () => {
    const input = ['<!-- toc -->', '', '- [One](#one)', '', '<!-- tocstop -->', '', '## One', ''].join(
      '\n',
    )
    const result = updateToc(input)
    assert.equal(result.changed, false)
    assert.equal(result.markdown, input)
  })

  it('omits headings above the first marker and still counts them for duplicates', () => {
    const input = ['# Intro', '', '<!-- toc -->', '<!-- tocstop -->', '', '# Intro', ''].join('\n')
    const result = updateToc(input)
    assert.match(result.markdown, /\[Intro\]\(#intro-1\)/)
    assert.doesNotMatch(result.markdown, /\(#intro\)/)
    assert.deepEqual(
      result.headings.map((heading) => heading.slug),
      ['intro', 'intro-1'],
    )
  })

  it('lists headings above the marker when asked', () => {
    const input = ['# Title', '', '<!-- toc -->', '<!-- tocstop -->', '', '## Install', ''].join('\n')
    const result = updateToc(input, { includeAbove: true })
    assert.match(result.markdown, /- \[Title\]\(#title\)\n {2}- \[Install\]\(#install\)/)
  })

  it('does not let a heading inside the block take an anchor', () => {
    const input = [
      '# Above',
      '',
      '<!-- toc -->',
      '',
      '## Inside',
      '',
      '<!-- tocstop -->',
      '',
      '## Below',
      '',
    ].join('\n')
    const once = updateToc(input)
    const twice = updateToc(once.markdown)
    assert.equal(twice.markdown, once.markdown)
    assert.deepEqual(
      once.headings.map((heading) => heading.slug),
      ['above', 'below'],
    )
    assert.equal(once.markdown.includes('Inside'), false)
    assert.match(once.markdown, /- \[Below\]\(#below\)/)
  })

  it('keeps a deeper duplicate in the numbering when max depth hides it', () => {
    const input = [
      '<!-- toc -->',
      '<!-- tocstop -->',
      '',
      '# Foo',
      '',
      '#### Foo',
      '',
      '# Foo',
      '',
    ].join('\n')
    const result = updateToc(input, { maxDepth: 1 })
    assert.match(result.markdown, /- \[Foo\]\(#foo\)\n- \[Foo\]\(#foo-2\)/)
    assert.equal(result.markdown.includes('foo-1'), false)
  })

  it('honours min depth, bullet, and title', () => {
    const input = ['<!-- toc -->', '<!-- tocstop -->', '', '## A', '', '### B', ''].join('\n')
    const result = updateToc(input, { minDepth: 3, bullet: '*', title: 'On this page' })
    assert.equal(
      result.markdown,
      ['<!-- toc -->', '', '**On this page**', '', '* [B](#b)', '', '<!-- tocstop -->', '', '## A', '', '### B', ''].join(
        '\n',
      ),
    )
  })

  it('escapes a star inside the title', () => {
    const input = '<!-- toc -->\n<!-- tocstop -->\n\n## A\n'
    const result = updateToc(input, { title: 'a*b' })
    assert.match(result.markdown, /\*\*a\\\*b\*\*/)
  })

  it('escapes brackets and html in the link label', () => {
    const input = '<!-- toc -->\n<!-- tocstop -->\n\n## See [raw]\n\n## Use `<div>` here\n'
    const result = updateToc(input)
    assert.match(result.markdown, /- \[See \\\[raw\\\]\]\(#see-raw\)/)
    assert.match(result.markdown, /- \[Use &lt;div&gt; here\]\(#use-div-here\)/)
  })

  it('ignores markers inside a fence and updates the real pair', () => {
    const input = [
      '```',
      '<!-- toc -->',
      '<!-- tocstop -->',
      '# not a heading',
      '```',
      '',
      '# Title',
      '',
      '<!-- toc -->',
      '<!-- tocstop -->',
      '',
      '## Real',
      '',
    ].join('\n')
    const result = updateToc(input)
    assert.equal(result.markdown.split('<!-- toc -->').length, 3)
    assert.match(result.markdown, /- \[Real\]\(#real\)/)
    assert.equal(result.markdown.includes('# not a heading'), true)
  })

  it('updates every block with the same list', () => {
    const input = [
      '<!-- toc -->',
      '<!-- tocstop -->',
      '',
      '## One',
      '',
      '<!-- toc -->',
      '<!-- tocstop -->',
      '',
      '## Two',
      '',
    ].join('\n')
    const result = updateToc(input)
    const lists = result.markdown.match(/- \[One\]\(#one\)\n- \[Two\]\(#two\)/g)
    assert.equal(lists?.length, 2)
  })

  it('preserves a three-space marker indent and a BOM', () => {
    const input = '\uFEFF   <!-- toc -->\n   <!-- tocstop -->\n\n## One\n'
    const result = updateToc(input)
    assert.ok(result.markdown.startsWith('\uFEFF   <!-- toc -->\n'))
    assert.match(result.markdown, /\n   <!-- tocstop -->/)
  })

  it('inserts a block after the first heading', () => {
    const input = '# Title\n\nBody\n\n## Later\n'
    const result = updateToc(input, { insert: true })
    assert.equal(
      result.markdown,
      ['# Title', '', '<!-- toc -->', '', '- [Later](#later)', '', '<!-- tocstop -->', '', 'Body', '', '## Later', ''].join(
        '\n',
      ),
    )
    assert.equal(updateToc(result.markdown).markdown, result.markdown)
  })

  it('inserts after front matter when the file has no heading yet', () => {
    const input = '---\ntitle: Hello\n---\n\nHello.\n'
    const result = updateToc(input, { insert: true })
    assert.ok(result.markdown.startsWith('---\ntitle: Hello\n---\n\n<!-- toc -->\n<!-- tocstop -->\n'))
  })

  it('rejects a document with no markers', () => {
    assert.throws(() => updateToc('# Title\n'), (error: unknown) => {
      assert.ok(error instanceof TocError)
      assert.equal(error.code, 'missing-markers')
      return true
    })
  })

  it('reports an unclosed marker, a stray closer, and a nested opener', () => {
    assert.throws(() => updateToc('<!-- toc -->\n'), /line 1: <!-- toc --> is missing/)
    assert.throws(() => updateToc('<!-- tocstop -->\n'), /line 1: <!-- tocstop --> without/)
    assert.throws(
      () => updateToc('<!-- toc -->\n<!-- toc -->\n<!-- tocstop -->\n'),
      /line 2: nested/,
    )
  })

  it('rejects a bad depth', () => {
    assert.throws(() => updateToc('<!-- toc -->\n<!-- tocstop -->\n', { maxDepth: 0 }), TocError)
  })
})

describe('renderToc', () => {
  it('indents relative to the shallowest heading it was given', () => {
    const headings = extractHeadings('## A\n\n### B\n\n## C\n')
    assert.equal(renderToc(headings), '- [A](#a)\n  - [B](#b)\n- [C](#c)')
  })
})
