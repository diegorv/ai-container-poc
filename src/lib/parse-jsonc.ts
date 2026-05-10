import { type ParseError, parse, printParseErrorCode } from 'jsonc-parser'
import { CliError } from './cli-error'

/**
 * Parses JSONC (JSON with comments + trailing commas) the way the
 * devcontainer spec mandates.
 *
 * The host CLI used `JSON.parse()` everywhere, which works for the
 * templates we ship (kept strict on purpose) but breaks the moment a
 * user lands on a `.devcontainer/devcontainer.json` from upstream
 * MS / Anthropic / a coworker that uses the spec's allowed comments.
 * Microsoft's `jsonc-parser` is the canonical implementation — same
 * library VS Code itself uses to read settings.json — and ships
 * with no transitive dependencies.
 *
 * Errors are wrapped as `CliError` so the dispatcher prints them with
 * a path-bearing message and an actionable suggestion instead of a
 * raw "Unexpected token" stack trace.
 */
export function parseJsonc(content: string, sourcePath: string): unknown {
  const errors: ParseError[] = []
  const result = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  })
  if (errors.length > 0) {
    const lines = errors
      .slice(0, 5)
      .map((e) => `  - ${printParseErrorCode(e.error)} at offset ${e.offset} (length ${e.length})`)
    const more = errors.length > 5 ? `\n  …and ${errors.length - 5} more` : ''
    throw new CliError(`Failed to parse ${sourcePath}:\n${lines.join('\n')}${more}`, {
      suggestion:
        'devcontainer.json supports JSONC (// comments and trailing commas) but must otherwise be valid JSON. Check the offsets above.',
    })
  }
  return result
}
