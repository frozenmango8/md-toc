export type TocErrorCode =
  | 'missing-markers'
  | 'unclosed-marker'
  | 'stray-close'
  | 'nested-marker'
  | 'invalid-option'

/**
 * A problem with the Markdown or with the options passed to the library.
 * The CLI maps `invalid-option` to exit code 2 and every other code to 1.
 */
export class TocError extends Error {
  readonly code: TocErrorCode

  constructor(message: string, code: TocErrorCode) {
    super(message)
    this.name = 'TocError'
    this.code = code
  }
}
