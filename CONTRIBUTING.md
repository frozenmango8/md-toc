# Contributing

Issues and pull requests are welcome. The useful change is one that keeps generated anchors lined up with GitHub, and that proves it with a test.

<!-- toc -->

- [Set up](#set-up)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Anchors](#anchors)
- [Pull requests](#pull-requests)

<!-- tocstop -->

## Set up

Node.js 18 or newer.

```bash
npm ci
npm test
npm run typecheck
```

`npm test` runs the unit tests and also checks that this file and the README still contain the table of contents `md-toc` would write. After a heading change:

```bash
npm run toc
```

`npm run build` compiles to `dist/`. The CLI entry is `src/cli.ts`.

## Project layout

| Path | What it does |
| --- | --- |
| `src/parse.ts` | Parses GFM, skips code and front matter, builds GitHub anchors. |
| `src/render.ts` | Renders the bullet list. |
| `src/update.ts` | Finds `<!-- toc -->` / `<!-- tocstop -->` and rewrites the blocks. |
| `src/cli.ts` | Arguments, files, exit codes. |
| `src/files.ts` | Globs, without walking `node_modules` or `.git`. |
| `test/` | Unit tests, CLI tests, and the check that the docs are current. |

The library surface is `updateToc`, `extractHeadings`, `renderToc`, and `TocError`.

## Tests

```bash
npm test
```

Anchor cases live in `test/headings.test.ts`. The expected ids were taken from GitHub's rendered permalinks (`POST /markdown` with `mode=markdown`), not from a hand-rolled guess. Add a row there when you change how text becomes an anchor, and say what GitHub returns.

CLI tests run the program in a temporary directory. They cover `--check`, stdin, globs, and the promise that a current file's modification time does not move.

## Anchors

A heading is parsed as Markdown first. `**bold**` and `` `code` `` become plain text, then `github-slugger` slugs that text and numbers duplicates. The second `Intro` is `intro-1`, and a following heading written `Intro-1` is `intro-1-1`. Please don't "fix" that to start at `-2` or to collapse `--`. Both match GitHub, and the tests lock them.

Headings above the first marker are omitted from the list and still consume an anchor. Headings between the markers are ignored, because that text is about to be replaced; counting them would make the next run disagree with this one.

## Pull requests

Keep the change focused. Run `npm test` and `npm run typecheck` before you push. If the README or this file gained or lost a heading, run `npm run toc` and commit the updated list.

New behavior needs a test that fails without the change. A GitHub anchor change needs the heading source and the id GitHub assigned.
