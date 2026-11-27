# md-toc

`md-toc` writes a table of contents into a Markdown file and keeps it there. Put a pair of markers where the list should go, run the command, and the links come back matching the anchors GitHub generates for the same headings — duplicates, punctuation, emoji, and non-Latin text included. Headings inside fenced or indented code are ignored, and `--check` fails when the list is stale so a pull request cannot merge a README that drifted.

<!-- toc -->

- [Install](#install)
- [Quick start](#quick-start)
- [Usage](#usage)
  - [Several files](#several-files)
  - [Standard input](#standard-input)
  - [Insert markers](#insert-markers)
- [Options](#options)
- [Anchors](#anchors)
  - [Duplicates](#duplicates)
  - [Formatting inside headings](#formatting-inside-headings)
  - [What is left out](#what-is-left-out)
- [Check mode](#check-mode)
  - [GitHub Actions](#github-actions)
  - [pre-commit](#pre-commit)
- [From Node](#from-node)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

<!-- tocstop -->

## Install

Node.js 18 or newer.

```bash
npm install --save-dev github:frozenmango8/md-toc
npx md-toc README.md
```

The npm name `md-toc` already belongs to an unrelated package, so install from this repository. Once it is a dependency of the project, `npx md-toc` runs this program, and so does `md-toc` when `node_modules/.bin` is on your `PATH`.

## Quick start

Leave a marker pair where the list should appear. Anything already between the markers is replaced.

````markdown
# Project

<!-- toc -->
<!-- tocstop -->

## Install

## Usage
````

```bash
npx md-toc README.md
```

The file becomes:

````markdown
# Project

<!-- toc -->

- [Install](#install)
- [Usage](#usage)

<!-- tocstop -->

## Install

## Usage
````

Headings above the markers are left out of the list. They still receive anchors, so a later heading with the same text is numbered the way GitHub numbers it. Run the command again after you add, rename, or remove a section. If the list is already current, the file is not rewritten.

## Usage

```bash
md-toc README.md
md-toc --max-depth 3 docs/guide.md
md-toc --insert --title Contents README.md
```

### Several files

Pass more than one path. A glob works without relying on the shell, which matters on Windows, and it does not walk `node_modules` or `.git`.

```bash
md-toc "docs/**/*.md" README.md
```

Each file is updated on its own. One bad file does not stop the others, and the exit code is the worst result in the batch.

### Standard input

```bash
cat README.md | md-toc --stdin > README.out.md
```

`--stdin` writes the updated document to standard output. `--check --stdin` writes nothing and exits 1 when the list would change.

### Insert markers

`--insert` adds a marker pair after the first heading when the file does not have one yet. A leading YAML or TOML block stays at the top of the file, because front matter has to.

```bash
md-toc --insert CONTRIBUTING.md
```

## Options

| Flag | Meaning |
| --- | --- |
| `-d`, `--max-depth <1-6>` | Deepest heading to list. Default `6`. Deeper headings are hidden, but they still take anchors. |
| `--min-depth <1-6>` | Shallowest heading to list. Default `1`. |
| `--bullet <-\|*\|+>` | List marker. Default `-`. |
| `--title <text>` | One line, rendered in bold above the list. It is not a heading. |
| `--include-above` | Also list headings that sit above the first marker. |
| `--keep-front-matter` | Parse a leading `---` or `+++` block as Markdown, which is what GitHub does for a README. |
| `--insert` | Add markers after the first heading when they are missing. |
| `-c`, `--check` | Write nothing. Exit 1 when a list is missing or stale. |
| `--stdout` | Print the updated document instead of writing the file. |
| `--stdin` | Read Markdown from stdin and write the result to stdout. |
| `-q`, `--quiet` | Print only errors and stale files. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Print the version. |

Exit `0` when the file was updated or was already current. Exit `1` when `--check` finds a stale or missing list, or when a marker is unclosed, nested, or stray. Exit `2` when the arguments are wrong or a file cannot be read.

Markers are recognized only as a whole line, with at most three leading spaces:

```text
<!-- toc -->
<!-- tocstop -->
```

The match is case-insensitive, so `<!-- TOC -->` works. A marker inside a code fence is text, not a marker. The same list is written into every pair in the file.

By default a leading front matter block is ignored, so this does not become a heading:

```yaml
---
title: Hello
---
```

GitHub's README view treats the closing `---` as a setext underline. Pass `--keep-front-matter` when the links have to match that view.

## Anchors

The anchor is the heading's plain text, then the same slug rules as [`github-slugger`](https://github.com/Flet/github-slugger), which tracks GitHub. Emphasis, links, and inline code are resolved first. The second identical heading gets `-1`, the third `-2`. A heading whose text is already `Intro-1` does not reuse the id the previous duplicate took.

| Heading | Anchor |
| --- | --- |
| `Install` | `#install` |
| `Install` again | `#install-1` |
| `Intro-1` after two `Intro` headings | `#intro-1-1` |
| `What's new? (2026)` | `#whats-new-2026` |
| `C++ & C#` | `#c--c` |
| `Café` | `#café` |
| `Привет 你好` | `#привет-你好` |
| `😄 emoji` | `#-emoji` |
| `:smile: hello` | `#smile-hello` |

Punctuation is removed and each space becomes a hyphen. Spaces are not collapsed, so `C++ & C#` keeps the gap the `&` left behind and the id contains `--`. Letters outside ASCII are kept and lowercased. Emoji characters are removed. A `:smile:` shortcode is slugged as the characters you typed; GitHub's permalink does that even though the page draws the emoji.

### Duplicates

Numbering covers the whole document, including headings the list hides.

```markdown
# Foo

#### Foo

# Foo
```

With `--max-depth 1` the list links to `#foo` and `#foo-2`. The `#### Foo` in the middle took `#foo-1`.

### Formatting inside headings

| You write | The list shows | The anchor uses |
| --- | --- | --- |
| `**world**` | world | `world` |
| `` `npm install` `` | npm install | `npm-install` |
| `[docs](https://example.com)` | docs | `docs` |
| `` `<div>` `` | `<div>` | `div` |
| `![icon](icon.png) Setup` | Setup | `-setup` |
| `Hello[^1]` | Hello | `hello1` |

Image alt text is not part of the anchor. GitHub's permalink is the text of the heading element, and an image has none. The space next to the image stays, which is why `![icon](icon.png) Setup` links to `#-setup`. A footnote mark is invisible in the list and present in the id, numbered in the order the marks appear.

### What is left out

These are not headings:

- a fenced block, including `~~~` fences and a fence of four backticks that a shorter fence must not close
- an indented code block
- a heading wrapped in an HTML comment
- the YAML or TOML block at the top of the file, unless `--keep-front-matter` is set
- a heading written between the markers — that region is replaced, so it is not allowed to take an anchor

A heading in a blockquote counts. A heading in a code fence inside that quote does not.

## Check mode

```bash
npx md-toc --check README.md CONTRIBUTING.md
```

Nothing is written. The command exits 1 when a marker pair is missing, unclosed, or would change. That is the check this repository runs on its own docs.

### GitHub Actions

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm install --save-dev github:frozenmango8/md-toc
- run: npx md-toc --check README.md
```

### pre-commit

```yaml
repos:
  - repo: local
    hooks:
      - id: md-toc
        name: md-toc
        entry: npx md-toc --check
        language: system
        files: \.md$
```

## From Node

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { updateToc } from 'md-toc'

const source = await readFile('README.md', 'utf8')
const result = updateToc(source, { maxDepth: 3 })

if (result.changed) {
  await writeFile('README.md', result.markdown)
}

for (const heading of result.headings) {
  console.log(heading.depth, heading.slug, heading.line)
}
```

`extractHeadings` returns every heading and its anchor. `renderToc` turns a list of headings into the bullet list. `updateToc` is the one that rewrites marker blocks. A `TocError` means the markers are missing or malformed, or an option is out of range.

The list this README is showing was written by `md-toc`. `npm test` fails if it drifts.

## Limitations

A few GitHub edges are called out here so the anchors stay predictable.

- Raw `<script>` in a heading is escaped by GitHub and slugged with the tag name still in the text. This tool drops raw tags and keeps their text, which is what GitHub does for the tags it actually renders (`em`, `kbd`, `a`, `br`, `span`).
- A marker has to be the only thing on its line, at the root of the document. A marker in a list item or a blockquote is not recognized.
- Every marker pair in a file receives the same list: the headings after the first pair, filtered by depth.
- `--title` is bold text, not a heading. A heading inside the block would be deleted on the next run.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © frozenmango8
