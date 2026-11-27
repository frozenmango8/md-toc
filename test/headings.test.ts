import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractHeadings } from '../src/parse.js'

/**
 * Expected slugs were checked against GitHub's permalink ids
 * (`POST /markdown`, `mode=markdown`) for the same Markdown.
 * `github-slugger` turns that plain text into the anchor.
 */
describe('GitHub anchors', () => {
  const cases: Array<{ name: string; md: string; slugs: string[]; text?: string[] }> = [
    {
      name: 'bold text, and a duplicate',
      md: '# Hello **world**\n\n# Hello **world**\n',
      slugs: ['hello-world', 'hello-world-1'],
      text: ['Hello world', 'Hello world'],
    },
    {
      name: 'allowed html keeps its text and drops the tag',
      md: '# Hello <em>world</em>\n',
      slugs: ['hello-world'],
      text: ['Hello world'],
    },
    {
      name: 'kbd',
      md: '# Press <kbd>Ctrl</kbd>\n',
      slugs: ['press-ctrl'],
      text: ['Press Ctrl'],
    },
    {
      name: 'unknown tag is dropped',
      md: '# `code`: <AppBar> icon\n',
      slugs: ['code--icon'],
      text: ['code:  icon'],
    },
    {
      name: 'image alt is not part of the anchor',
      md: '# image ![alt text](img.png) end\n',
      slugs: ['image--end'],
      text: ['image  end'],
    },
    {
      name: 'the space an image leaves behind becomes a hyphen',
      md: '# ![icon](icon.png) Setup\n',
      slugs: ['-setup'],
      text: ['Setup'],
    },
    {
      name: 'a heading literally named like the duplicate suffix',
      md: '# Intro\n\n# Intro\n\n# Intro-1\n',
      slugs: ['intro', 'intro-1', 'intro-1-1'],
    },
    {
      name: 'ampersand leaves the surrounding spaces',
      md: '# C++ & C#\n',
      slugs: ['c--c'],
      text: ['C++ & C#'],
    },
    {
      name: 'unicode letters stay, and are lowercased',
      md: '# Привет non-latin 你好\n',
      slugs: ['привет-non-latin-你好'],
    },
    {
      name: 'accented latin is not transliterated',
      md: '# Café\n',
      slugs: ['café'],
    },
    {
      name: 'a setext soft break is deleted, not hyphenated',
      md: 'Foo\nbar baz\n===\n',
      slugs: ['foobar-baz'],
      text: ['Foo bar baz'],
    },
    {
      name: 'emoji character',
      md: '# 😄 emoji\n',
      slugs: ['-emoji'],
    },
    {
      name: 'gemoji shortcode is slugged as text, which is what the permalink uses',
      md: '# :smile: hello\n',
      slugs: ['smile-hello'],
      text: [':smile: hello'],
    },
    {
      name: 'br leaves both spaces',
      md: '# Hello <br> there\n',
      slugs: ['hello--there'],
      text: ['Hello  there'],
    },
    {
      name: 'double space',
      md: '# foo  bar\n',
      slugs: ['foo--bar'],
    },
    {
      name: 'apostrophe and parentheses',
      md: "# What's new? (2026)\n",
      slugs: ['whats-new-2026'],
      text: ["What's new? (2026)"],
    },
    {
      name: 'heart symbol',
      md: '# I ♥ unicode\n',
      slugs: ['i--unicode'],
    },
    {
      name: 'a spaced hyphen',
      md: '# heading with a - dash\n',
      slugs: ['heading-with-a---dash'],
    },
    {
      name: 'intraword underscores stay',
      md: '# foo_bar_baz\n',
      slugs: ['foo_bar_baz'],
    },
    {
      name: 'strong underscores are emphasis, not part of the slug',
      md: '# __proto__\n\n# __proto__\n',
      slugs: ['proto', 'proto-1'],
      text: ['proto', 'proto'],
    },
    {
      name: 'strikethrough',
      md: '# ~~gone~~ kept\n',
      slugs: ['gone-kept'],
      text: ['gone kept'],
    },
    {
      name: 'link label',
      md: '# See [the docs](https://example.com)\n',
      slugs: ['see-the-docs'],
      text: ['See the docs'],
    },
    {
      name: 'autolink',
      md: '# visit https://example.com now\n',
      slugs: ['visit-httpsexamplecom-now'],
    },
    {
      name: 'inline code keeps angle brackets as text',
      md: '# Use `<div>` here\n',
      slugs: ['use-div-here'],
      text: ['Use <div> here'],
    },
    {
      name: 'parentheses around a word',
      md: '# (foo)\n',
      slugs: ['foo'],
      text: ['(foo)'],
    },
    {
      name: 'punctuation only, so the anchor is empty',
      md: '# ???\n',
      slugs: [''],
      text: ['???'],
    },
    {
      name: 'a line of hyphens is kept',
      md: '# ---\n',
      slugs: ['---'],
    },
    {
      name: 'equals sign in code disappears and leaves the spaces',
      md: '# `const x = 1`\n',
      slugs: ['const-x--1'],
      text: ['const x = 1'],
    },
    {
      name: 'footnotes are numbered in reference order and share a number',
      md: '# A[^b]\n\n# B[^a]\n\n[^a]: first\n\n[^b]: second\n',
      slugs: ['a1', 'b2'],
      text: ['A', 'B'],
    },
    {
      name: 'a repeated footnote mark uses the first number',
      md: '# A[^n]\n\n# B[^n]\n\n[^n]: once\n',
      slugs: ['a1', 'b1'],
      text: ['A', 'B'],
    },
  ]

  for (const sample of cases) {
    it(sample.name, () => {
      const headings = extractHeadings(sample.md)
      assert.deepEqual(
        headings.map((heading) => heading.slug),
        sample.slugs,
      )
      if (sample.text) {
        assert.deepEqual(
          headings.map((heading) => heading.text),
          sample.text,
        )
      }
    })
  }

  it('skips an empty heading', () => {
    assert.deepEqual(extractHeadings('#\n\n# Real\n').map((heading) => heading.slug), ['real'])
  })

  it('skips fenced, indented, and commented headings', () => {
    const md = [
      '```js',
      '# Not in backticks',
      '```',
      '',
      '~~~',
      '# Not in tildes',
      '~~~',
      '',
      '    # Indented',
      '',
      '<!--',
      '# Hidden',
      '-->',
      '',
      '# Shown',
      '',
    ].join('\n')
    const headings = extractHeadings(md)
    assert.deepEqual(
      headings.map((heading) => heading.text),
      ['Shown'],
    )
  })

  it('keeps a heading in a quote and skips one inside a quote fence', () => {
    const md = ['> # Quoted', '>', '> ```', '> # Not this', '> ```', '>', '> ## Also real', ''].join(
      '\n',
    )
    assert.deepEqual(extractHeadings(md).map((heading) => heading.slug), [
      'quoted',
      'also-real',
    ])
  })

  it('does not close a long fence with a shorter one', () => {
    const md = ['````', '# no', '```', '# still no', '````', '', '# yes', ''].join('\n')
    assert.deepEqual(extractHeadings(md).map((heading) => heading.slug), ['yes'])
  })

  it('ignores a leading front matter block', () => {
    const md = '---\ntitle: Hello\n---\n\n# Real\n'
    const headings = extractHeadings(md)
    assert.deepEqual(
      headings.map((heading) => heading.slug),
      ['real'],
    )
    assert.equal(headings[0]?.line, 5)
  })

  it('can keep front matter, matching GitHub README rendering', () => {
    const md = '---\ntitle: Hello\n---\n\n# Real\n'
    assert.deepEqual(
      extractHeadings(md, { keepFrontMatter: true }).map((heading) => heading.slug),
      ['title-hello', 'real'],
    )
  })

  it('does not treat a thematic break as front matter', () => {
    const md = '---\n\n# After\n'
    assert.deepEqual(extractHeadings(md).map((heading) => heading.slug), ['after'])
  })

  it('records the heading line', () => {
    const headings = extractHeadings('# One\n\n## Two\n')
    assert.deepEqual(
      headings.map((heading) => [heading.depth, heading.line]),
      [
        [1, 1],
        [2, 3],
      ],
    )
  })
})
