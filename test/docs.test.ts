import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { updateToc } from '../src/update.js'

describe('committed docs', () => {
  for (const name of ['README.md', 'CONTRIBUTING.md']) {
    it(`${name} already contains the TOC this tool would write`, () => {
      const markdown = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
      const result = updateToc(markdown)
      assert.equal(
        result.markdown,
        markdown,
        `${name} is stale. Run npm run toc and commit the result.`,
      )
    })
  }
})
